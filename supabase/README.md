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

The `patients.id = auth.uid()` convention provisions owner access through a private trigger. Delegated access is relationship-based through `patient_access`; it must not use editable user metadata for authorization.

Functions currently scaffolded:

- `emergency-alert`: records an incident and queues consented delivery ledger rows.
- `process-alert-deliveries`: private worker for consented email/SMS delivery with claim tokens, bounded retries, and truthful provider states. Configure `ALERT_WORKER_SECRET`, `RESEND_*`, and/or `TWILIO_*` only in the hosted function environment.
- `delete-account`: records a deletion request and removes the authenticated cloud user; local SQLite data remains under explicit user control.

The current mobile sync policy uploads the local outbox before pulling cloud rows through a bounded cursor window. It is intentionally a continuity projection, not a final conflict-resolution UI: deletions, concurrent edits, and conflict review remain release work.
