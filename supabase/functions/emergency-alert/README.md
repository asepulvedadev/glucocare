# Emergency alert function

`POST /functions/v1/emergency-alert` validates the authenticated patient, verifies accepted trusted-contact consent, creates an append-only incident, and queues delivery ledger rows. `202 Accepted` means queued only; an external provider worker must later update `alert_deliveries` to `provider_accepted`, `delivered`, `failed`, or `unknown`.

The function intentionally never accepts or forwards a glucose value by default. Provider credentials belong in Supabase Function secrets, not the mobile app.
