# Production configuration handoff

This runbook activates the release gates that cannot be inferred from source
code. It is intentionally separate from the strict application deploy so no
operator accidentally exposes health data without a reviewed domain and TLS
certificate.

## 1. Public domains and TLS

Choose domains whose DNS `A` records point to `2.24.115.58`:

- `GLUCOCARE_APP_DOMAIN`: web companion host, for example `app.example.com`.
- `GLUCOCARE_API_DOMAIN`: API host, for example `api.example.com`.

Install a reviewed Nginx reverse-proxy configuration and certificates for both
hosts. The API must proxy only to `127.0.0.1:18084` and the web host only to
`127.0.0.1:18082`; PostgreSQL must remain unpublished.

After the TLS route is reviewed, update `/srv/glucocare/.env` (mode `600`):

```dotenv
GLUCOCARE_PUBLIC_API_URL=https://api.example.com
GLUCOCARE_CORS_ORIGIN=https://app.example.com
```

Then run the mandatory release command from a clean, pushed `main` checkout:

```bash
EXPO_PUBLIC_API_URL=https://api.example.com ./scripts/deploy-vps-direct.sh
```

The variable is baked into the Expo web bundle. Native EAS builds must receive
the same value through the `EXPO_PUBLIC_API_URL` secret in the GitHub
`production` environment, never through committed files. The manual EAS
workflow rejects a production build unless that value is a non-empty `https://`
URL; preview builds may remain local-first until a reviewed TLS endpoint exists.

## 2. Alert providers

Keep provider credentials only in `/srv/glucocare/.env`:

```dotenv
GLUCOCARE_RESEND_API_KEY=...
GLUCOCARE_RESEND_FROM=alerts@example.com
GLUCOCARE_TWILIO_ACCOUNT_SID=...
GLUCOCARE_TWILIO_AUTH_TOKEN=...
GLUCOCARE_TWILIO_FROM=...
GLUCOCARE_PROVIDER_CALLBACK_SECRET=...
```

Configure provider webhooks and monitoring before describing a message as
delivered. The worker reports `provider_accepted` only; acceptance is not proof
that a contact read the message. The callback secret enables the signed
`POST /v1/internal/provider-callback` route; expose it only through a reviewed
HTTPS reverse proxy and an adapter that verifies the provider's own signature
before computing the GlucoCare HMAC.

## 3. Verification gate

```bash
curl --fail https://api.example.com/healthz
curl --fail --head https://app.example.com/
docker compose --env-file /srv/glucocare/.env --project-name glucocare \
  -f /srv/glucocare/release/deploy/compose.yml ps
systemctl start glucocare-healthcheck.service
```

Record the DNS/TLS reviewer, certificate expiry, provider test result, build
identifier, and rollback command in the release evidence before beta approval.
