# Deployment

## Current state

This repository contains GlucoCare product/design documentation, the Expo mobile application source, and a static documentation staging image. The VPS workflow currently deploys only the documentation image; the Expo app is not yet published as a native release or public web app.

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

Next, add a separate reviewed web-build deployment (if web parity is approved) and EAS workflows for native preview/production builds. Native Android/iOS binaries are distributed through EAS/App Store/Google Play; they are not served by this VPS container.
