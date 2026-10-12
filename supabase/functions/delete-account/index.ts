import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function response(body: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(body), { status, headers }); }

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return response({ error: { code: "METHOD_NOT_ALLOWED", message: "Use POST." } }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization?.startsWith("Bearer ")) return response({ error: { code: "SERVER_NOT_CONFIGURED", message: "Account deletion service is not configured." } }, 500);

  const token = authorization.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) return response({ error: { code: "UNAUTHENTICATED", message: "A valid session is required." } }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const requestId = crypto.randomUUID();
  const { error: requestError } = await admin.from("account_deletion_requests").insert({ id: requestId, user_id: userData.user.id, status: "processing", reason: "user_requested" });
  if (requestError) return response({ error: { code: "DELETION_REQUEST_FAILED", message: "The deletion request could not be recorded." } }, 500);

  const { error: deleteError } = await admin.auth.admin.deleteUser(userData.user.id);
  if (deleteError) {
    await admin.from("account_deletion_requests").update({ status: "failed", error_code: "AUTH_DELETE_FAILED" }).eq("id", requestId);
    return response({ error: { code: "ACCOUNT_DELETE_FAILED", message: "The account could not be deleted. No new deletion request was accepted." } }, 500);
  }
  await admin.from("account_deletion_requests").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", requestId);
  return response({ requestId, status: "completed" });
});
