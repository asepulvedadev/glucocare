#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

for script in \
  "$root/deploy/vps/glucocare-deploy" \
  "$root/deploy/vps/glucocare-healthcheck" \
  "$root/deploy/vps/glucocare-db-backup" \
  "$root/deploy/vps/glucocare-db-backup-healthcheck" \
  "$root/deploy/vps/glucocare-db-restore-check" \
  "$root/deploy/vps/glucocare-rollback" \
  "$root/scripts/smoke-backup-gpg.sh" \
  "$root/scripts/smoke-backup-healthcheck.sh" \
  "$root/scripts/validate-production-config.sh" \
  "$root/scripts/deploy-vps-direct.sh"; do
  bash -n "$script"
  test -x "$script"
done

bash "$root/scripts/smoke-backup-gpg.sh"
bash "$root/scripts/smoke-backup-healthcheck.sh"

# Exercise the production handoff validator with synthetic values. The real
# VPS environment is intentionally never copied into CI or this repository.
valid_config=$(mktemp)
invalid_config=$(mktemp)
trap 'rm -f "$valid_config" "$invalid_config"' EXIT
cat >"$valid_config" <<'EOF'
POSTGRES_PASSWORD=synthetic-password-with-at-least-32-characters
GLUCOCARE_PUBLIC_API_URL=https://api.synthetic.example
GLUCOCARE_CORS_ORIGIN=https://app.synthetic.example
GLUCOCARE_BACKUP_GPG_RECIPIENT=backup@example.invalid
EOF
cat >"$invalid_config" <<'EOF'
POSTGRES_PASSWORD=short
GLUCOCARE_PUBLIC_API_URL=http://127.0.0.1:18084
GLUCOCARE_CORS_ORIGIN=http://127.0.0.1:18082
EOF
bash "$root/scripts/validate-production-config.sh" "$valid_config" >/dev/null
if bash "$root/scripts/validate-production-config.sh" "$invalid_config" >/dev/null 2>&1; then
  echo 'production configuration validator accepted an invalid local configuration' >&2
  exit 1
fi

test -f "$root/server/Dockerfile"
test -f "$root/server/migrations/001_initial.sql"
test -f "$root/server/migrations/002_alert_delivery_worker.sql"
test -f "$root/server/migrations/003_account_deletion_audit.sql"
test -f "$root/deploy/vps/glucocare-db-backup.service"
test -f "$root/deploy/vps/glucocare-db-backup.timer"
test -f "$root/deploy/vps/glucocare-db-backup-healthcheck.service"
test -f "$root/deploy/vps/glucocare-db-backup-healthcheck.timer"
test -f "$root/deploy/vps/glucocare-db-restore-check.service"
test -f "$root/deploy/vps/glucocare-db-restore-check.timer"

compose_config=$(docker compose --env-file "$root/deploy/.env.example" -f "$root/deploy/compose.yml" config)
printf '%s\n' "$compose_config" >/dev/null
# Both the API and the private alert worker must receive the reviewed public
# origin. If the worker loses this guard, provider credentials appear valid but
# every delivery is silently classified as not_configured.
test "$(printf '%s\n' "$compose_config" | grep -c 'PUBLIC_API_URL:')" -eq 2
# expo-sqlite on web creates a blob-backed WASM worker; without an explicit
# worker-src the CSP falls back to script-src and the local database never
# initializes in deployed browsers.
grep -Eq "worker-src 'self' blob:" "$root/deploy/nginx/mobile-site.conf"

printf 'Deployment scripts and Compose configuration are valid.\n'
