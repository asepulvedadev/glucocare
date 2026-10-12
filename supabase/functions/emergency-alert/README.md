# Emergency alert function

`POST /functions/v1/emergency-alert` validates the authenticated patient, verifies accepted trusted-contact consent, creates an append-only incident, and queues delivery ledger rows. `202 Accepted` means queued only; an external provider worker must later update `alert_deliveries` to `provider_accepted`, `delivered`, `failed`, or `unknown`.

The function intentionally never accepts or forwards a glucose value by default. Provider credentials belong in Supabase Function secrets, not the mobile app.

New incident IDs are rate-limited to five requests per patient in a rolling
10-minute window by default. Set `EMERGENCY_ALERT_MAX_PER_WINDOW` in the
function environment to a reviewed positive integer. Replays of the same
incident ID that already created delivery rows remain idempotent and are not
counted as new requests; an incident merely uploaded by background sync is
still treated as a new alert request.
