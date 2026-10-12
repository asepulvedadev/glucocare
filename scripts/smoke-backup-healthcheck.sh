#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
base=$(mktemp -d)
trap 'rm -rf "$base"' EXIT
mkdir -p "$base/backups"
printf 'POSTGRES_DB=glucocare\nGLUCOCARE_BACKUP_MAX_AGE_HOURS=30\n' > "$base/.env"
chmod 600 "$base/.env"
printf 'synthetic backup metadata fixture\n' > "$base/backups/glucocare-smoke.dump"
chmod 600 "$base/backups/glucocare-smoke.dump"

GLUCOCARE_BASE="$base" bash "$root/deploy/vps/glucocare-db-backup-healthcheck" >/dev/null

encrypted_base=$(mktemp -d)
trap 'rm -rf "$base" "$encrypted_base"' EXIT
mkdir -p "$encrypted_base/backups"
printf 'POSTGRES_DB=glucocare\nGLUCOCARE_BACKUP_MAX_AGE_HOURS=30\nGLUCOCARE_BACKUP_GPG_RECIPIENT=backup@example.invalid\n' > "$encrypted_base/.env"
chmod 600 "$encrypted_base/.env"
printf 'synthetic backup metadata fixture\n' > "$encrypted_base/backups/glucocare-smoke.dump"
chmod 600 "$encrypted_base/backups/glucocare-smoke.dump"
if GLUCOCARE_BASE="$encrypted_base" bash "$root/deploy/vps/glucocare-db-backup-healthcheck" >/dev/null 2>&1; then
  printf 'backup-healthcheck-smoke: accepted plaintext while GPG recipient was configured\n' >&2
  exit 1
fi

printf 'backup-healthcheck-smoke=passed\n'
