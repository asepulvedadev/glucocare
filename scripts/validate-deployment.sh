#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

for script in \
  "$root/deploy/vps/glucocare-deploy" \
  "$root/deploy/vps/glucocare-healthcheck" \
  "$root/deploy/vps/glucocare-rollback" \
  "$root/scripts/deploy-vps-direct.sh"; do
  bash -n "$script"
  test -x "$script"
done

docker compose -f "$root/deploy/compose.yml" config >/dev/null

printf 'Deployment scripts and Compose configuration are valid.\n'
