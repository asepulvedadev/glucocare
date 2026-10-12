# record-glucose-audit

Private Edge Function used by mobile sync to persist the audit trail for a corrected glucose reading.

## Security and idempotency

- Requires a valid Supabase user session; it never accepts a service-role key from the client.
- Verifies that the corrected reading belongs to the authenticated patient.
- Uses the local outbox event UUID as `audit_events.id`, so retries return `already_recorded` instead of creating duplicates.
- The client cannot insert, update, or delete `audit_events` directly. The service role is used only inside this function.

## Required secrets

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Deploy this function before enabling cloud sync for correction events. If the function is unavailable, the mobile outbox remains pending and the corrected reading stays available locally.
