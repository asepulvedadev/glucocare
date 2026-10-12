import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Channel = "email" | "sms";
type Action = "create" | "accept" | "decline" | "revoke";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}
function htmlResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function tokenFromBytes(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function safeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function invitationUrl(token: string) {
  const configured = Deno.env.get("INVITATION_PUBLIC_URL")?.replace(/\/$/, "");
  if (configured) return `${configured}?token=${encodeURIComponent(token)}`;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  return `${supabaseUrl}/functions/v1/contact-invitation?token=${encodeURIComponent(token)}`;
}

async function sendEmail(destination: string, patientName: string, relationship: string | null, link: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("INVITATION_FROM_EMAIL");
  if (!apiKey || !from) return { status: "not_configured" as const, errorCode: "EMAIL_PROVIDER_NOT_CONFIGURED" };
  const subject = `${patientName} te invitó como persona de apoyo en GlucoCare`;
  const greeting = relationship ? `La persona indica que eres su ${relationship}.` : "La persona te registró como contacto de apoyo.";
  const result = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [destination],
      subject,
      text: `${patientName} te invitó como persona de apoyo en GlucoCare. ${greeting} Solo recibirías avisos de ayuda que la persona solicite. Acepta o rechaza la invitación: ${link}`,
      html: `<p>${safeHtml(patientName)} te invitó como persona de apoyo en GlucoCare.</p><p>${safeHtml(greeting)} Solo recibirías avisos de ayuda que la persona solicite.</p><p><a href="${safeHtml(link)}">Revisar invitación</a></p><p>La aceptación no da acceso al historial clínico.</p>`,
    }),
  });
  if (!result.ok) return { status: "failed" as const, errorCode: "EMAIL_PROVIDER_REJECTED" };
  return { status: "sent" as const, errorCode: null };
}

async function sendSms(destination: string, patientName: string, link: string) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!accountSid || !authToken || !from) return { status: "not_configured" as const, errorCode: "SMS_PROVIDER_NOT_CONFIGURED" };
  const body = new URLSearchParams({ To: destination, From: from, Body: `${patientName} te invitó como persona de apoyo en GlucoCare. Revisa y acepta: ${link}` });
  const result = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!result.ok) return { status: "failed" as const, errorCode: "SMS_PROVIDER_REJECTED" };
  return { status: "sent" as const, errorCode: null };
}

async function authenticatedUser(request: Request, url: string, anonKey: string) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await client.auth.getUser(authorization.slice("Bearer ".length));
  return data.user ?? null;
}

function acceptPage(token: string) {
  const encoded = JSON.stringify(token).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invitación GlucoCare</title><body style="font-family:system-ui,sans-serif;max-width:38rem;margin:3rem auto;padding:1rem;color:#1d1d1b"><h1>Invitación de persona de apoyo</h1><p>Esta invitación solo permite recibir avisos de ayuda solicitados por la persona. No da acceso a su historial clínico.</p><p id="result">Revisa la información y elige una opción.</p><button onclick="act('accept')">Aceptar invitación</button> <button onclick="act('decline')">Rechazar</button><script>const token=${encoded};async function act(action){const result=document.getElementById('result');result.textContent='Procesando…';const response=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token})});const data=await response.json();result.textContent=data.message||data.error?.message||'La invitación fue procesada.';}</script></body></html>`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) return response({ error: { code: "SERVER_NOT_CONFIGURED", message: "Invitation service is not configured." } }, 500);
  const requestUrl = new URL(request.url);
  if (request.method === "GET") {
    const token = requestUrl.searchParams.get("token");
    return token ? htmlResponse(acceptPage(token)) : htmlResponse("<h1>Invitación no encontrada</h1>", 404);
  }
  if (request.method !== "POST") return response({ error: { code: "METHOD_NOT_ALLOWED", message: "Use POST." } }, 405);

  let body: { action?: Action; token?: string; contactId?: string; channel?: Channel };
  try { body = await request.json(); } catch { return response({ error: { code: "INVALID_JSON", message: "The request body is invalid." } }, 400); }
  const action = body.action;
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  if (action === "accept" || action === "decline") {
    if (typeof body.token !== "string" || body.token.length < 20 || body.token.length > 256) return response({ error: { code: "INVALID_TOKEN", message: "The invitation token is invalid." } }, 400);
    const tokenHash = await hashToken(body.token);
    const { data: invitation, error } = await admin.from("contact_invitations").select("id,contact_id,status,expires_at").eq("token_hash", tokenHash).maybeSingle();
    if (error) return response({ error: { code: "INVITATION_LOOKUP_FAILED", message: "The invitation could not be checked." } }, 500);
    if (!invitation || invitation.status !== "pending") return response({ error: { code: "INVITATION_NOT_ACTIVE", message: "This invitation is no longer active." } }, 410);
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      await admin.from("contact_invitations").update({ status: "expired" }).eq("id", invitation.id);
      return response({ error: { code: "INVITATION_EXPIRED", message: "This invitation has expired." } }, 410);
    }
    const accepted = action === "accept";
    const { data: updatedInvitation, error: updateError } = await admin.from("contact_invitations").update({ status: accepted ? "accepted" : "declined", accepted_at: accepted ? new Date().toISOString() : null, declined_at: accepted ? null : new Date().toISOString() }).eq("id", invitation.id).eq("status", "pending").select("id").maybeSingle();
    if (updateError) return response({ error: { code: "INVITATION_UPDATE_FAILED", message: "The invitation could not be updated." } }, 500);
    if (!updatedInvitation) return response({ error: { code: "INVITATION_NOT_ACTIVE", message: "This invitation is no longer active." } }, 409);
    const { error: contactError } = await admin.from("trusted_contacts").update({ consent_status: accepted ? "accepted" : "revoked", consent_changed_at: new Date().toISOString() }).eq("id", invitation.contact_id);
    if (contactError) return response({ error: { code: "CONTACT_UPDATE_FAILED", message: "The contact consent could not be updated." } }, 500);
    return response({ status: accepted ? "accepted" : "declined", message: accepted ? "Invitación aceptada. Ahora puedes recibir avisos de ayuda." : "Invitación rechazada." });
  }

  const user = await authenticatedUser(request, url, anonKey);
  if (!user) return response({ error: { code: "UNAUTHENTICATED", message: "A valid session is required." } }, 401);
  if (action === "revoke") {
    if (!isUuid(body.contactId)) return response({ error: { code: "INVALID_CONTACT", message: "The contact is invalid." } }, 400);
    await admin.from("contact_invitations").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("contact_id", body.contactId).eq("patient_id", user.id).eq("status", "pending");
    const { error } = await admin.from("trusted_contacts").update({ consent_status: "revoked", consent_changed_at: new Date().toISOString() }).eq("id", body.contactId).eq("patient_id", user.id);
    if (error) return response({ error: { code: "CONTACT_REVOKE_FAILED", message: "The contact could not be revoked." } }, 500);
    return response({ status: "revoked" });
  }
  if (action !== "create" || !isUuid(body.contactId) || (body.channel !== "email" && body.channel !== "sms")) return response({ error: { code: "INVALID_INVITATION_REQUEST", message: "The invitation request is incomplete." } }, 400);

  const { data: contact, error: contactError } = await admin.from("trusted_contacts").select("id,name,relationship,email,phone,consent_status").eq("id", body.contactId).eq("patient_id", user.id).maybeSingle();
  if (contactError) return response({ error: { code: "CONTACT_LOOKUP_FAILED", message: "The contact could not be checked." } }, 500);
  if (!contact || contact.consent_status === "revoked") return response({ error: { code: "CONTACT_NOT_FOUND", message: "The contact is not available." } }, 404);
  const destination = body.channel === "email" ? contact.email : contact.phone;
  if (!destination) return response({ error: { code: "CHANNEL_NOT_AVAILABLE", message: "This contact has no destination for that channel." } }, 409);

  await admin.from("contact_invitations").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("contact_id", contact.id).eq("status", "pending");
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = tokenFromBytes(tokenBytes);
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const { data: invitation, error: insertError } = await admin.from("contact_invitations").insert({ patient_id: user.id, contact_id: contact.id, channel: body.channel, token_hash: tokenHash, expires_at: expiresAt }).select("id,expires_at").single();
  if (insertError) return response({ error: { code: "INVITATION_CREATE_FAILED", message: "The invitation could not be created." } }, 500);

  const profile = await admin.from("patients").select("display_name").eq("id", user.id).maybeSingle();
  const delivery = body.channel === "email"
    ? await sendEmail(destination, profile.data?.display_name || "Una persona usuaria", contact.relationship, invitationUrl(token))
    : await sendSms(destination, profile.data?.display_name || "Una persona usuaria", invitationUrl(token));
  await admin.from("contact_invitations").update({ delivery_status: delivery.status, delivery_error_code: delivery.errorCode }).eq("id", invitation.id);
  if (delivery.status !== "sent") return response({ error: { code: delivery.errorCode, message: "La invitación quedó registrada, pero el canal de entrega aún no está configurado." }, invitationId: invitation.id, status: delivery.status }, 503);
  return response({ invitationId: invitation.id, status: "sent", expiresAt: invitation.expires_at }, 202);
});
