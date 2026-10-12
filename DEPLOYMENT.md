# Deployment

## Current state

This repository currently contains GlucoCare product/design documentation and a static staging landing page. It does **not** contain the Expo application yet. The deployment therefore publishes the blueprint safely without pretending that the mobile app is production-ready.

## VPS target

- Host: AutoKing VPS (`2.24.115.58`), shared with other services.
- Deployment user: dedicated non-root `glucocare-deploy`.
- Container: `glucocare-docs`.
- Compose project name: `glucocare` (explicit to avoid collisions with other `deploy` directories on the shared VPS).
- Host binding: `127.0.0.1:18080` only.
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

The deploy key is restricted on the VPS and cannot forward agents, ports, X11, or allocate a TTY.

## Manual verification on the VPS

```bash
curl --fail http://127.0.0.1:18080/healthz
docker ps --filter name=glucocare-docs
docker compose -f /srv/glucocare/release/deploy/compose.yml ps
```

## Next deployment boundary

When the Expo app exists, replace the static image with the approved web build or add a separate mobile release workflow. Native Android/iOS binaries are distributed through EAS/App Store/Google Play; they are not served by this VPS container.
