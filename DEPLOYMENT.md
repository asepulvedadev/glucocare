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
- Successful releases retain the three most recent previous bundles under
  `/srv/glucocare/releases`; this is a static-artifact rollback cache, not a
  patient-data backup.

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

## Self-hosted VPS deploy workflow

The repository also contains [`deploy-vps-self-hosted.yml`](.github/workflows/deploy-vps-self-hosted.yml).
It runs only for `main` pushes or an authorized manual dispatch on a dedicated
GitHub Actions runner installed as the non-root `glucocare-deploy` user on the
staging VPS. The runner is labeled `glucocare-vps` and has no production
provider secrets. It validates the mobile app, creates the web export, streams
the release through `/usr/local/sbin/glucocare-deploy`, and verifies both
localhost health endpoints.

The workflow intentionally does not run on pull requests from the public
repository. Do not attach this runner to workflows that execute untrusted PR
code, and do not install it as root. If the runner is offline, the hosted
`CI/CD` deploy job remains available as a fallback once GitHub Actions billing
and its SSH environment secrets are enabled.

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

## Health monitoring and rollback

The repository includes a payload-free synthetic check at
`deploy/vps/glucocare-healthcheck`. It verifies both container health checks,
the two localhost `/healthz` endpoints, and the cross-origin headers required by
the Expo SQLite web worker. Install the supplied systemd units once as root on
the VPS; the timer runs every five minutes and keeps evidence in the system
journal:

```bash
install -o root -g root -m 0755 /srv/glucocare/release/deploy/vps/glucocare-rollback /usr/local/sbin/glucocare-rollback
install -o root -g root -m 0644 /srv/glucocare/release/deploy/vps/glucocare-healthcheck.service /etc/systemd/system/glucocare-healthcheck.service
install -o root -g root -m 0644 /srv/glucocare/release/deploy/vps/glucocare-healthcheck.timer /etc/systemd/system/glucocare-healthcheck.timer
systemctl daemon-reload
systemctl enable --now glucocare-healthcheck.timer
systemctl start glucocare-healthcheck.service
systemctl status glucocare-healthcheck.timer --no-pager
journalctl -u glucocare-healthcheck.service -n 20 --no-pager
```

The rollback command restores the newest retained release and re-runs the same
health check. A named snapshot can be selected with
`glucocare-rollback 20261012T120000Z-1234`. The command automatically restores
the current release if the candidate does not become healthy.

These checks are intentionally local because the staging surfaces are not
public. External alerting still requires an operations credential/channel and
must be configured separately; no health check logs application or clinical
payloads.
