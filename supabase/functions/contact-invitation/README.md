# contact-invitation

Creates a signed, single-purpose invitation for a trusted contact and accepts or declines it without granting clinical-record access.

## Required secrets

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- Email: `RESEND_API_KEY`, `INVITATION_FROM_EMAIL`
- SMS: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- Optional public URL: `INVITATION_PUBLIC_URL`

Invitations expire after 48 hours. The token is stored only as a SHA-256 hash. The function is truthful when a provider is not configured: it records the invitation as `not_configured` and returns a retryable configuration error instead of claiming delivery.
