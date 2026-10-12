import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Channel = "push" | "email" | "sms" | "voice";
type AlertRequest = {
  incidentId: string;
  occurredAt?: string;
  timezone: string;
  contactIds: string[];
  channels?: Channel[];
  share?: { eventType?: boolean; location?: boolean; glucoseValue?: boolean };
};

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const allowedChannels = new Set<Channel>(["push", "email", "sms", "voice"]);

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isIsoDate(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return response({ error: { code: "METHOD_NOT_ALLOWED", message: "Use POST." } }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization?.startsWith("Bearer ")) {
    return response({ error: { code: "SERVER_NOT_CONFIGURED", message: "Emergency alert service is not configured." } }, 500);
  }

  const token = authorization.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) return response({ error: { code: "UNAUTHENTICATED", message: "A valid session is required." } }, 401);

  let body: AlertRequest;
  try { body = await request.json() as AlertRequest; } catch { return response({ error: { code: "INVALID_JSON", message: "The request body is invalid." } }, 400); }
  const userId = userData.user.id;
  const contactIds = Array.isArray(body.contactIds) ? [...new Set(body.contactIds)] : [];
  const channels = Array.isArray(body.channels) && body.channels.length ? [...new Set(body.channels)] : ["email"];
  if (!isUuid(body.incidentId) || !body.timezone || contactIds.length < 1 || contactIds.length > 5 || contactIds.some((id) => !isUuid(id)) || channels.some((channel) => !allowedChannels.has(channel))) {
    return response({ error: { code: "INVALID_ALERT_REQUEST", message: "The alert request is incomplete." } }, 400);
  }
  if (body.occurredAt && !isIsoDate(body.occurredAt)) return response({ error: { code: "INVALID_OCCURRED_AT", message: "The event time is invalid." } }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: contacts, error: contactsError } = await admin.from("trusted_contacts").select("id,name,email,phone,consent_status,allowed_event_types").eq("patient_id", userId).in("id", contactIds);
  if (contactsError) return response({ error: { code: "CONTACT_LOOKUP_FAILED", message: "The contact list could not be checked." } }, 500);
  const accepted = (contacts ?? []).filter((contact) => contact.consent_status === "accepted" && (contact.allowed_event_types ?? []).includes("emergency"));
  if (accepted.length !== contactIds.length) return response({ error: { code: "CONTACT_CONSENT_REQUIRED", message: "Each contact must accept emergency alerts first." } }, 409);

  const { error: incidentError } = await admin.from("emergency_incidents").upsert({
    id: body.incidentId,
    patient_id: userId,
    occurred_at: body.occurredAt ?? new Date().toISOString(),
    timezone: body.timezone,
    trigger: "manual",
  }, { onConflict: "id", ignoreDuplicates: true });
  if (incidentError) return response({ error: { code: "INCIDENT_CREATE_FAILED", message: "The incident could not be recorded." } }, 500);

  const deliveries = accepted.flatMap((contact) => channels.filter((channel) => channel === "email" ? Boolean(contact.email) : channel === "sms" || channel === "voice" ? Boolean(contact.phone) : true).map((channel) => ({ incident_id: body.incidentId, patient_id: userId, contact_id: contact.id, channel, status: "queued" })));
  if (!deliveries.length) return response({ error: { code: "NO_DELIVERABLE_CHANNEL", message: "No consented contact channel is available." } }, 409);
  const { error: deliveryError } = await admin.from("alert_deliveries").upsert(deliveries, { onConflict: "incident_id,contact_id,channel", ignoreDuplicates: true });
  if (deliveryError) return response({ error: { code: "ALERT_QUEUE_FAILED", message: "The alert was recorded but could not be queued." } }, 500);

  const { error: auditError } = await admin.from("audit_events").insert({ patient_id: userId, actor_user_id: userId, action: "emergency.alert.queued", entity_type: "emergency_incident", entity_id: body.incidentId, reason: "user_requested_help", after_data: { contact_count: accepted.length, channels, share: { eventType: body.share?.eventType !== false, location: body.share?.location === true, glucoseValue: body.share?.glucoseValue === true } } });
  if (auditError) return response({ error: { code: "AUDIT_WRITE_FAILED", message: "The alert was queued but its audit event failed." } }, 500);
  return response({ alertId: body.incidentId, status: "queued", deliveries: deliveries.map((delivery) => ({ contactId: delivery.contact_id, channel: delivery.channel, status: "queued" })) }, 202);
});
