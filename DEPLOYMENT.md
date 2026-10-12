# Deployment

## Current state

This repository contains GlucoCare product/design documentation, the Expo mobile application source, and two localhost-only staging images. The VPS workflow deploys the documentation image and the Expo web companion; native Android/iOS binaries still require EAS and store release steps.

## VPS target

- Host: AutoKing VPS (`2.24.115.58`), shared with other services.
- Deployment user: dedicated non-root `glucocare-deploy`.
- Containers: `glucocare-docs` and `glucocare-web`.
- Compose project name: `glucocare` (explicit to avoid collisions with other `deploy` directories on the shared VPS).
- Host bindings: `127.0.0.1:18080` (docs) and `127.0.0.1:18082` (Expo web).
- No nginx public route or new port is opened by this deployment.

The localhost-only binding is intentional because no public domain was supplied and the server is shared. Add a domain and TLS reverse-proxy route only as a separate reviewed change.

## GitHub Actions secrets

Configure these repository secrets in the `production` environment:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | `2.24.115.58` |
| `DEPLOY_PORT` | `22` |
| `DEPLOY_USER` | `glucocare-deploy` |
| `DEPLOY_SSH_KEY` | Dedicated Ed25519 private key, never the VPS root password. |
| `DEPLOY_KNOWN_HOSTS` | Pinned `ssh-keyscan` entry for the VPS. |

The separate Supabase workflows use these `production` environment secrets:

| Secret | Used by |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Hosted migration and Edge Function deployment |
| `SUPABASE_PROJECT_REF` | Hosted migration and Edge Function deployment |
| `SUPABASE_DB_PASSWORD` | Hosted migration workflow only |

Run **Supabase Edge Functions** manually after reviewing the local function smoke test. The `process-alert-deliveries` function is intentionally deployed without Supabase JWT verification because it authenticates with its private worker header; all user-facing functions retain JWT verification.

The deploy key is restricted on the VPS and cannot forward agents, ports, X11, or allocate a TTY.

## Manual verification on the VPS

```bash
curl --fail http://127.0.0.1:18080/healthz
curl --fail http://127.0.0.1:18082/healthz
docker ps --filter name=glucocare
docker compose -f /srv/glucocare/release/deploy/compose.yml ps
```

To inspect either staging surface from a local machine without opening a public port:

```bash
ssh -N \
  -L 18080:127.0.0.1:18080 \
  -L 18082:127.0.0.1:18082 \
  root@2.24.115.58
```

Then open `http://127.0.0.1:18080/` for docs or `http://127.0.0.1:18082/` for the Expo web companion.

Native Android/iOS binaries are distributed through EAS/App Store/Google Play; they are not served by this VPS container.
