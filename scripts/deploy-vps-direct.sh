#!/usr/bin/env bash
set -euo pipefail

# GlucoCare staging deploys are intentionally operator-driven. This script is
# the single supported order: verify a clean, pushed main branch; validate the
# repository; build the Expo web bundle; stream it to the VPS; then prove the
# two staging surfaces are healthy. There is no skip-validation flag.

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

die() {
  printf 'deploy-vps-direct: %s\n' "$*" >&2
  exit 1
}

required_commands=(git python3 npm npx tar sshpass ssh curl)
for command_name in "${required_commands[@]}"; do
  command -v "$command_name" >/dev/null 2>&1 || die "missing required command: $command_name"
done

[[ "$(git branch --show-current)" == "main" ]] || die 'deployments must run from the main branch'
git diff --quiet || die 'working tree has unstaged changes'
git diff --cached --quiet || die 'working tree has staged changes'
[[ -z "$(git status --porcelain)" ]] || die 'working tree is not clean'
git fetch --quiet origin main
git merge-base --is-ancestor HEAD origin/main || die 'local HEAD is not contained in origin/main; push first'
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || die 'local HEAD differs from origin/main; deploy the pushed commit only'

password_file=${AUTOKING_VPS_PASSWORD_FILE:-$HOME/.autoking-vps-password}
[[ -r "$password_file" ]] || die "password file is not readable: $password_file"
export SSHPASS
SSHPASS=$(cat "$password_file")
[[ -n "$SSHPASS" ]] || die 'VPS password file is empty'

vps_host=${DEPLOY_HOST:-2.24.115.58}
vps_port=${DEPLOY_PORT:-22}
vps_user=${DEPLOY_USER:-root}
deploy_user=glucocare-deploy

printf '%s\n' '== 1/5 Validate documentation, secrets, and deployment configuration =='
python3 scripts/validate-docs.py
python3 scripts/scan-secrets.py
bash scripts/validate-deployment.sh

printf '%s\n' '== 2/5 Validate mobile application and PostgreSQL API =='
pushd apps/mobile >/dev/null
npm ci --legacy-peer-deps
npm run typecheck
npm run lint
npm test -- --run
printf '%s\n' '== 3/5 Export Expo web bundle =='
npx expo export --platform web
popd >/dev/null
pushd server >/dev/null
npm ci
npm run build
popd >/dev/null

printf '%s\n' '== 4/5 Stream release to VPS =='
tar --exclude-vcs \
  --exclude='./.github' \
  --exclude='./apps/mobile/node_modules' \
  --exclude='./apps/mobile/.expo' \
  --create --gzip --file=- . \
  | sshpass -e ssh \
      -o StrictHostKeyChecking=no \
      -p "$vps_port" "$vps_user@$vps_host" \
      "sudo -u $deploy_user /usr/local/sbin/glucocare-deploy"

printf '%s\n' '== 5/5 Verify VPS health =='
sshpass -e ssh \
  -o StrictHostKeyChecking=no \
  -p "$vps_port" "$vps_user@$vps_host" \
  'set -euo pipefail
   systemctl start glucocare-healthcheck.service
   test "$(docker inspect --format "{{.State.Health.Status}}" glucocare-glucocare-web-1)" = healthy
   test "$(docker inspect --format "{{.State.Health.Status}}" glucocare-docs)" = healthy
   test "$(docker inspect --format "{{.State.Health.Status}}" glucocare-glucocare-api-1)" = healthy
   test "$(docker inspect --format "{{.State.Health.Status}}" glucocare-glucocare-db-1)" = healthy
   curl --fail --silent http://127.0.0.1:18080/healthz >/dev/null
   curl --fail --silent http://127.0.0.1:18082/healthz >/dev/null
   curl --fail --silent http://127.0.0.1:18084/healthz | grep -q '"database":"ok"'
   echo staging-smoke=passed'

printf 'deploy-vps-direct: deployed %s\n' "$(git rev-parse --short HEAD)"
