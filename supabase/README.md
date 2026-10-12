# GlucoCare cloud foundation

The mobile app is local-first. Supabase is an optional continuity layer for authenticated users, multi-device sync, audit events, and trusted-contact delivery orchestration.

## Local validation

```bash
supabase start
supabase db lint --local --level warning --fail-on error
supabase gen types --local --lang typescript > apps/mobile/src/types/supabase.ts
```

The migration creates patient-scoped tables and enables RLS on every public table. The client must use only the publishable key. Service-role/secret keys belong only in private Edge Functions or CI secrets.

The owner-write policy migration keeps delegated `patient_access` roles read-oriented in the MVP. The authenticated owner can create or change health records; alert-delivery and audit rows are read-only to the client and are written by private functions.

`20261012063455_sync_occurrence_timestamps.sql` adds `updated_at` and server-side update triggers to mutable records, including medication and measurement occurrences. This is required by the mobile cursor pull so a status change made on another device is observable without trusting client clocks.

## Linking a hosted project

Do not link or push migrations until the project owner provides the Supabase project ref and confirms the data region, retention policy, and Colombian privacy review.

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push --linked --dry-run
supabase db push --linked
```

For a reviewed hosted rollout, add `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and `SUPABASE_PROJECT_REF` to the `production` GitHub environment, then run the manual **Supabase migrations** workflow. It always prints the dry run first; set `apply` to `true` only after verifying the migration plan. The workflow is intentionally separate from the VPS web deploy so a UI release cannot silently mutate clinical data.

For emergency-contact delivery, add `ALERT_WORKER_URL` and `ALERT_WORKER_SECRET` to the same protected environment. The scheduled **Process emergency alert queue** workflow invokes the private worker every five minutes; provider credentials remain secrets of the deployed Edge Function and are never exposed to the mobile app.

Edge Functions are deployed separately through the manual **Supabase Edge Functions** workflow. It requires only `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`, deploys one function or the reviewed `all` set, and disables JWT verification only for the private `process-alert-deliveries` worker (which uses `ALERT_WORKER_SECRET`). Provider and worker secrets must be configured in the hosted function environment before enabling delivery.

The `patients.id = auth.uid()` convention provisions owner access through a private trigger. Delegated access is relationship-based through `patient_access`; it must not use editable user metadata for authorization.

Functions currently scaffolded:

- `contact-invitation`: creates expiring, single-purpose email/SMS invitations and handles accept/decline/revoke without granting clinical-record access.
- `emergency-alert`: records an incident and queues consented delivery ledger rows.
- `process-alert-deliveries`: private worker for consented email/SMS delivery with expiring claim leases, bounded retries, and truthful provider states. A crashed worker's queued claims are recovered after 10 minutes. Configure `ALERT_WORKER_SECRET`, `RESEND_*`, and/or `TWILIO_*` only in the hosted function environment.
- `record-glucose-audit`: authenticated, idempotent writer for corrected-reading audit events. It verifies patient ownership and keeps `audit_events` append-only for clients.
- `delete-account`: records a deletion request and removes the authenticated cloud user; local SQLite data remains under explicit user control.

The current mobile sync policy uploads the local outbox before pulling cloud rows through a bounded cursor window. Concurrent edits are preserved as local conflict records; Profile lets the user retry the local event or explicitly apply a supported remote projection. Deletions and physical two-device evidence remain release work.
