import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Snapshot = Record<string, unknown>;
type AuditRequest = {
  eventId: string;
  readingId: string;
  occurredAt?: string;
  action: string;
  reason?: string;
  before: Snapshot;
  after: Snapshot;
};

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

function isIsoDate(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isSnapshot(value: unknown): value is Snapshot {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function boundedText(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return null;
  return typeof value === "string" && value.length <= maxLength ? value : null;
}

/**
 * Writes an immutable audit event for a corrected glucose reading.
 *
 * The mobile client cannot write audit_events directly. This function is
 * authenticated with the user's session, verifies ownership of the reading,
 * and uses the service role only for the append-only insert. The outbox event
 * id is reused as the audit id so retries are idempotent.
 */
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return response({ error: { code: "METHOD_NOT_ALLOWED", message: "Use POST." } }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization?.startsWith("Bearer ")) {
    return response({ error: { code: "SERVER_NOT_CONFIGURED", message: "Audit service is not configured." } }, 500);
  }

  const token = authorization.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) return response({ error: { code: "UNAUTHENTICATED", message: "A valid session is required." } }, 401);

  let body: AuditRequest;
  try {
    body = await request.json() as AuditRequest;
  } catch {
    return response({ error: { code: "INVALID_JSON", message: "The request body is invalid." } }, 400);
  }

  if (!isUuid(body.eventId) || !isUuid(body.readingId) || body.action !== "corrected" || !isSnapshot(body.before) || !isSnapshot(body.after)) {
    return response({ error: { code: "INVALID_AUDIT_REQUEST", message: "The correction audit payload is incomplete." } }, 400);
  }
  if (body.occurredAt && !isIsoDate(body.occurredAt)) {
    return response({ error: { code: "INVALID_OCCURRED_AT", message: "The correction time is invalid." } }, 400);
  }
  if (body.reason !== undefined && (typeof body.reason !== "string" || body.reason.length > 500)) {
    return response({ error: { code: "INVALID_REASON", message: "The correction reason is too long." } }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const userId = userData.user.id;
  const { data: reading, error: readingError } = await admin
    .from("glucose_readings")
    .select("id")
    .eq("id", body.readingId)
    .eq("patient_id", userId)
    .maybeSingle();
  if (readingError) return response({ error: { code: "READING_LOOKUP_FAILED", message: "The reading could not be verified." } }, 500);
  if (!reading) return response({ error: { code: "READING_NOT_FOUND", message: "The reading does not belong to this account." } }, 404);

  const { data: existing, error: existingError } = await admin
    .from("audit_events")
    .select("patient_id,action,entity_id")
    .eq("id", body.eventId)
    .maybeSingle();
  if (existingError) return response({ error: { code: "AUDIT_LOOKUP_FAILED", message: "The audit event could not be checked." } }, 500);
  if (existing) {
    if (existing.patient_id !== userId || existing.action !== "glucose.reading.corrected" || existing.entity_id !== body.readingId) {
      return response({ error: { code: "AUDIT_ID_REUSED", message: "The audit event id is already in use." } }, 409);
    }
    return response({ status: "already_recorded", eventId: body.eventId });
  }

  const { error: insertError } = await admin.from("audit_events").insert({
    id: body.eventId,
    patient_id: userId,
    actor_user_id: userId,
    action: "glucose.reading.corrected",
    entity_type: "glucose_reading",
    entity_id: body.readingId,
    occurred_at: body.occurredAt ?? new Date().toISOString(),
    reason: boundedText(body.reason, 500),
    before_data: body.before,
    after_data: body.after,
  });
  if (insertError) return response({ error: { code: "AUDIT_WRITE_FAILED", message: "The correction audit event could not be recorded." } }, 500);
  return response({ status: "recorded", eventId: body.eventId }, 201);
});
