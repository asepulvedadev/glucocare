#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

for script in \
  "$root/deploy/vps/glucocare-deploy" \
  "$root/deploy/vps/glucocare-healthcheck" \
  "$root/deploy/vps/glucocare-db-backup" \
  "$root/deploy/vps/glucocare-rollback" \
  "$root/scripts/deploy-vps-direct.sh"; do
  bash -n "$script"
  test -x "$script"
done

test -f "$root/server/Dockerfile"
test -f "$root/server/migrations/001_initial.sql"
test -f "$root/server/migrations/002_alert_delivery_worker.sql"
test -f "$root/deploy/vps/glucocare-db-backup.service"
test -f "$root/deploy/vps/glucocare-db-backup.timer"

docker compose --env-file "$root/deploy/.env.example" -f "$root/deploy/compose.yml" config >/dev/null

printf 'Deployment scripts and Compose configuration are valid.\n'
