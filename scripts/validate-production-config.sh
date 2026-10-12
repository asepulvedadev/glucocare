#!/usr/bin/env bash
set -euo pipefail

# Validate the operator-owned production environment without printing secrets.
# This is deliberately separate from the localhost staging deploy: a public
# domain and TLS route must be reviewed before provider delivery is enabled.
env_file=${1:-/srv/glucocare/.env}

die() {
  printf 'validate-production-config: %s\n' "$*" >&2
  exit 1
}

test -r "$env_file" || die "environment file is not readable: $env_file"
set -a
. "$env_file"
set +a

require_https_origin() {
  local name="$1"
  local value="${!name:-}"
  [[ "$value" == https://* ]] || die "$name must be an https:// origin"
  [[ "$value" != *localhost* && "$value" != *127.0.0.1* && "$value" != *example.invalid* ]] \
    || die "$name still uses a local or placeholder host"
  [[ "$value" != */ ]] || die "$name must not end with a slash"
}

require_https_origin GLUCOCARE_PUBLIC_API_URL
require_https_origin GLUCOCARE_CORS_ORIGIN

postgres_password=${POSTGRES_PASSWORD:-}
[[ ${#postgres_password} -ge 32 ]] || die 'POSTGRES_PASSWORD must contain at least 32 characters'

backup_recipient=${GLUCOCARE_BACKUP_GPG_RECIPIENT:-}
[[ -n "$backup_recipient" ]] || die 'GLUCOCARE_BACKUP_GPG_RECIPIENT must identify an off-host GPG public key'
[[ ${#backup_recipient} -le 320 ]] || die 'GLUCOCARE_BACKUP_GPG_RECIPIENT is too long'

callback_secret=${GLUCOCARE_PROVIDER_CALLBACK_SECRET:-}
if [[ -n "$callback_secret" && ${#callback_secret} -lt 32 ]]; then
  die 'GLUCOCARE_PROVIDER_CALLBACK_SECRET must contain at least 32 characters when set'
fi

resend_key=${GLUCOCARE_RESEND_API_KEY:-}
resend_from=${GLUCOCARE_RESEND_FROM:-}
if [[ -n "$resend_key" || -n "$resend_from" ]]; then
  [[ -n "$resend_key" && -n "$resend_from" ]] || die 'Resend credentials must be configured together'
fi

twilio_sid=${GLUCOCARE_TWILIO_ACCOUNT_SID:-}
twilio_token=${GLUCOCARE_TWILIO_AUTH_TOKEN:-}
twilio_from=${GLUCOCARE_TWILIO_FROM:-}
if [[ -n "$twilio_sid" || -n "$twilio_token" || -n "$twilio_from" ]]; then
  [[ -n "$twilio_sid" && -n "$twilio_token" && -n "$twilio_from" ]] || die 'Twilio credentials must be configured together'
fi

printf 'Production configuration is valid: api=%s cors=%s email=%s sms=%s\n' \
  "${GLUCOCARE_PUBLIC_API_URL#https://}" \
  "${GLUCOCARE_CORS_ORIGIN#https://}" \
  "$([[ -n "$resend_key" ]] && printf configured || printf not_configured)" \
  "$([[ -n "$twilio_sid" ]] && printf configured || printf not_configured)"
