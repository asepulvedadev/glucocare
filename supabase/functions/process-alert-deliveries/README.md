# process-alert-deliveries

Private worker that drains queued emergency-contact deliveries. It never
accepts browser traffic: callers must provide `x-alert-worker-secret` and the
same value configured as `ALERT_WORKER_SECRET`.

## Required secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALERT_WORKER_SECRET`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` for email
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` for SMS

Provider credentials belong only in the hosted function environment. Never
place them in the mobile app, repository, CI logs, or scheduler arguments.

## Scheduling

Invoke the function from a private scheduler every 1–5 minutes. The request
must be a POST with an empty JSON body and the worker header:

```bash
curl --fail-with-body --silent --show-error \
  --request POST "$SUPABASE_URL/functions/v1/process-alert-deliveries" \
  --header "x-alert-worker-secret: $ALERT_WORKER_SECRET" \
  --header "content-type: application/json" \
  --data '{}'
```

Use a scheduler that stores both values as secrets (for example, the checked-in
GitHub Actions `Process emergency alert queue` workflow, a hosted cron/job
runner, or Supabase's private scheduling facilities). Do not use a public
unauthenticated URL. The worker claims at most 50 rows per invocation,
retries transient provider failures with bounded backoff, and recovers queued
claims abandoned for more than 10 minutes.

After claiming a row it freshly reads the contact, then re-checks the contact's
`accepted` consent and `emergency` event permission immediately before the
provider request. Revoking a contact therefore prevents a queued delivery from
being dispatched; the row becomes a non-retryable `CONTACT_CONSENT_REVOKED`
failure for auditability.

## Operational checks

- `provider_accepted` means the provider accepted the request, not that a
  contact saw it.
- `unknown` and `failed` states must remain visible to the patient and support
  direct-call alternatives.
- Alert on queue age/backlog and repeated `*_PROVIDER_NOT_CONFIGURED` errors.
