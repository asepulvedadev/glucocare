# Deployment

## Current state

This repository contains GlucoCare product/design documentation, the Expo mobile application source, a Node.js API, and a PostgreSQL 16 service. The operator deploys the documentation image, Expo web companion, API, and database directly to the VPS; native Android/iOS binaries still require EAS and store release steps.

## VPS target

- Host: AutoKing VPS (`2.24.115.58`), shared with other services.
- Deployment user: dedicated non-root `glucocare-deploy`.
- Containers: `glucocare-docs`, `glucocare-web`, `glucocare-api`, and `glucocare-db`.
- Compose project name: `glucocare` (explicit to avoid collisions with other `deploy` directories on the shared VPS).
- Host bindings: `127.0.0.1:18080` (docs), `127.0.0.1:18082` (Expo web), and `127.0.0.1:18084` (API health).
- No nginx public route or new port is opened by this deployment.
- Successful releases retain the three most recent previous bundles under
  `/srv/glucocare/releases`; this is a static-artifact rollback cache, not a
  patient-data backup.

The localhost-only binding is intentional because no public domain was supplied and the server is shared. Add a domain and TLS reverse-proxy route only as a separate reviewed change.

## Direct deployment order (mandatory)

GitHub Actions does not deploy to this VPS. The single supported deployment
command is the local operator script:

```bash
./scripts/deploy-vps-direct.sh
```

The script always performs this order and aborts on the first failure:

**Preflight:** require a clean `main` branch whose `HEAD` exactly matches
`origin/main` and verify the local VPS password file.

1. validate Markdown, secrets, deployment scripts, and Compose configuration;
2. install dependencies and run mobile typecheck, lint, tests, and the
   PostgreSQL API build;
3. export the Expo web bundle;
4. stream the release to `glucocare-deploy` on `2.24.115.58`;
5. run the VPS health check and verify both staging containers and endpoints.

It reads the root SSH password only from `~/.autoking-vps-password` (or the
path in `AUTOKING_VPS_PASSWORD_FILE`). It never stores that password in the
repository and has no validation-bypass flag. Native Android/iOS binaries are
not deployed by this script.

## PostgreSQL y API en el VPS

La base de datos y la API se despliegan en el mismo Compose del VPS. PostgreSQL
no publica el puerto 5432 y el API solo escucha en `127.0.0.1:18084` mientras no
exista una ruta TLS revisada.

Antes del primer despliegue, como root en el VPS:

```bash
install -o glucocare-deploy -g glucocare-deploy -m 0600 /dev/null /srv/glucocare/.env
${EDITOR:-vi} /srv/glucocare/.env
```

El archivo debe contener los valores de [`deploy/.env.example`](deploy/.env.example)
con una contraseña aleatoria larga. Nunca se copia al repositorio ni al bundle
móvil. El deploy estricto aborta si falta el archivo o sus permisos no son 600.

El API ejecuta `server/migrations/001_initial.sql` al arrancar, de forma
idempotente. El cambio de esquema se verifica con el health check antes de
aceptar el release.

### Backups de PostgreSQL

Los datos de PostgreSQL se guardan en el volumen Docker
`glucocare_pgdata`; los bundles de release **no** son un respaldo de datos.
Instala el backup diario después del primer deploy:

```bash
install -o root -g root -m 0755 /srv/glucocare/release/deploy/vps/glucocare-db-backup /usr/local/sbin/glucocare-db-backup
install -o root -g root -m 0644 /srv/glucocare/release/deploy/vps/glucocare-db-backup.service /etc/systemd/system/glucocare-db-backup.service
install -o root -g root -m 0644 /srv/glucocare/release/deploy/vps/glucocare-db-backup.timer /etc/systemd/system/glucocare-db-backup.timer
install -o root -g root -m 0700 -d /srv/glucocare/backups
systemctl daemon-reload
systemctl enable --now glucocare-db-backup.timer
systemctl start glucocare-db-backup.service
systemctl status glucocare-db-backup.timer --no-pager
ls -lh /srv/glucocare/backups
```

El script crea dumps custom con permisos 600 y conserva 30 días localmente.
Configura además una copia cifrada fuera del VPS; la retención local no es
suficiente frente a pérdida total del servidor.

## Manual verification on the VPS

```bash
curl --fail http://127.0.0.1:18080/healthz
curl --fail http://127.0.0.1:18082/healthz
curl --fail http://127.0.0.1:18084/healthz
docker ps --filter name=glucocare
docker compose --env-file /srv/glucocare/.env -f /srv/glucocare/release/deploy/compose.yml ps
```

To inspect either staging surface from a local machine without opening a public port:

```bash
ssh -N \
  -L 18080:127.0.0.1:18080 \
  -L 18082:127.0.0.1:18082 \
  -L 18084:127.0.0.1:18084 \
  root@2.24.115.58
```

Then open `http://127.0.0.1:18080/` for docs, `http://127.0.0.1:18082/` for the Expo web companion, or `http://127.0.0.1:18084/healthz` for the API.

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
