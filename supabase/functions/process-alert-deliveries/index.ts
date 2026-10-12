import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Channel = "push" | "email" | "sms" | "voice";
type DeliveryRow = {
  id: string;
  channel: Channel;
  contact_id: string;
  attempt_count: number;
  trusted_contacts: {
    name: string;
    email: string | null;
    phone: string | null;
    consent_status: string;
    allowed_event_types: string[] | null;
  } | null;
};

const jsonHeaders = { "Content-Type": "application/json" };
const MAX_BATCH = 50;
const CLAIM_LEASE_MS = 10 * 60 * 1000;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function safeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

function messageForContact() {
  return "Un contacto de confianza en GlucoCare ha solicitado ayuda. Contacta a la persona y llama a emergencias si hay riesgo.";
}

async function sendEmail(contact: NonNullable<DeliveryRow["trusted_contacts"]>) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL");
  if (!apiKey || !from || !contact.email) return { status: "unknown" as const, failureCode: "EMAIL_PROVIDER_NOT_CONFIGURED" };
  const result = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [contact.email], subject: "Solicitud de ayuda de un contacto GlucoCare", text: messageForContact() }),
    signal: AbortSignal.timeout(10000),
  });
  const body = await result.json().catch(() => ({})) as { id?: string };
  if (!result.ok) return { status: result.status >= 500 ? "retry" as const : "failed" as const, failureCode: `RESEND_HTTP_${result.status}` };
  return { status: "provider_accepted" as const, providerEventId: body.id };
}

async function sendSms(contact: NonNullable<DeliveryRow["trusted_contacts"]>) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!accountSid || !authToken || !from || !contact.phone) return { status: "unknown" as const, failureCode: "SMS_PROVIDER_NOT_CONFIGURED" };
  const form = new URLSearchParams({ To: contact.phone, From: from, Body: messageForContact() });
  const result = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(10000),
  });
  const body = await result.json().catch(() => ({})) as { sid?: string };
  if (!result.ok) return { status: result.status >= 500 ? "retry" as const : "failed" as const, failureCode: `TWILIO_HTTP_${result.status}` };
  return { status: "provider_accepted" as const, providerEventId: body.sid };
}

async function sendDelivery(row: DeliveryRow) {
  if (!row.trusted_contacts) return { status: "failed" as const, failureCode: "CONTACT_NOT_FOUND" };
  // A delivery can remain queued while the patient or contact revokes
  // consent. Queue creation is not proof that dispatch is still authorized.
  if (row.trusted_contacts.consent_status !== "accepted" || !(row.trusted_contacts.allowed_event_types ?? []).includes("emergency")) {
    return { status: "failed" as const, failureCode: "CONTACT_CONSENT_REVOKED" };
  }
  if (row.channel === "email") return sendEmail(row.trusted_contacts);
  if (row.channel === "sms") return sendSms(row.trusted_contacts);
  return { status: "unknown" as const, failureCode: `${row.channel.toUpperCase()}_PROVIDER_NOT_CONFIGURED` };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Use POST." } }, 405);
  const workerSecret = Deno.env.get("ALERT_WORKER_SECRET");
  const providedSecret = request.headers.get("x-alert-worker-secret") ?? "";
  if (!workerSecret || !safeEqual(workerSecret, providedSecret)) return json({ error: { code: "UNAUTHORIZED", message: "Worker authentication failed." } }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: { code: "SERVER_NOT_CONFIGURED", message: "Delivery worker is not configured." } }, 500);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date().toISOString();
  // A crashed worker must not leave a delivery permanently invisible. Claims
  // are leases, not durable ownership; recover only queued rows whose lease is
  // older than the bounded timeout and make them eligible immediately.
  const staleClaimBefore = new Date(Date.now() - CLAIM_LEASE_MS).toISOString();
  const { error: leaseError } = await admin.from("alert_deliveries")
    .update({ claimed_at: null, claim_token: null, next_attempt_at: now, failure_code: "WORKER_CLAIM_EXPIRED" })
    .eq("status", "queued")
    .lt("claimed_at", staleClaimBefore);
  if (leaseError) return json({ error: { code: "CLAIM_RECOVERY_FAILED", message: "Delivery claims could not be recovered." } }, 500);
  const { data: queued, error: loadError } = await admin.from("alert_deliveries")
    .select("id,channel,contact_id,attempt_count,trusted_contacts(name,email,phone,consent_status,allowed_event_types)")
    .eq("status", "queued").lte("next_attempt_at", now).is("claimed_at", null).limit(MAX_BATCH);
  if (loadError) return json({ error: { code: "QUEUE_LOOKUP_FAILED", message: "The queue could not be read." } }, 500);

  const results: Array<{ id: string; status: string; failureCode?: string }> = [];
  for (const row of (queued ?? []) as DeliveryRow[]) {
    const claimToken = crypto.randomUUID();
    const { data: claimed, error: claimError } = await admin.from("alert_deliveries").update({ claimed_at: now, claim_token: claimToken, attempt_count: row.attempt_count + 1 }).eq("id", row.id).eq("status", "queued").is("claimed_at", null).select("id").maybeSingle();
    if (claimError || !claimed) continue;
    try {
      const outcome = await sendDelivery(row);
      if (outcome.status === "retry" && row.attempt_count < 3) {
        const nextAttemptAt = new Date(Date.now() + (2 ** Math.min(row.attempt_count + 1, 3)) * 60_000).toISOString();
        await admin.from("alert_deliveries").update({ status: "queued", claimed_at: null, claim_token: null, next_attempt_at: nextAttemptAt, failure_code: outcome.failureCode }).eq("id", row.id).eq("claim_token", claimToken);
        results.push({ id: row.id, status: "retry_scheduled", failureCode: outcome.failureCode });
        continue;
      }
      const status = outcome.status === "provider_accepted" ? "provider_accepted" : outcome.status === "unknown" ? "unknown" : "failed";
      await admin.from("alert_deliveries").update({ status, claimed_at: null, claim_token: null, provider_event_id: outcome.providerEventId ?? null, failure_code: outcome.failureCode ?? null }).eq("id", row.id).eq("claim_token", claimToken);
      results.push({ id: row.id, status, failureCode: outcome.failureCode });
    } catch {
      await admin.from("alert_deliveries").update({ status: "queued", claimed_at: null, claim_token: null, failure_code: "PROVIDER_REQUEST_FAILED", next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString() }).eq("id", row.id).eq("claim_token", claimToken);
      results.push({ id: row.id, status: "retry_scheduled", failureCode: "PROVIDER_REQUEST_FAILED" });
    }
  }
  return json({ processed: results.length, results });
});
