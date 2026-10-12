#!/usr/bin/env bash
set -euo pipefail

# Exercise the same non-interactive GPG mode used by the VPS backup command
# without touching a real database or importing a persistent operator key.
command -v gpg >/dev/null 2>&1 || {
  printf 'backup-gpg-smoke: gpg is required\n' >&2
  exit 1
}

home=$(mktemp -d)
trap 'rm -rf "$home"' EXIT
chmod 700 "$home"
export GNUPGHOME="$home"

cat > "$home/key.conf" <<'EOF'
Key-Type: RSA
Key-Length: 2048
Name-Real: GlucoCare backup smoke test
Name-Email: backup-smoke@example.invalid
Expire-Date: 0
%no-protection
%commit
EOF

gpg --batch --generate-key "$home/key.conf" >/dev/null 2>&1
recipient=$(gpg --list-keys --with-colons backup-smoke@example.invalid 2>/dev/null | awk -F: '/^fpr:/{print $10; exit}')
test -n "$recipient"

printf 'synthetic postgres custom dump payload\n' > "$home/input.dump"
gpg --batch --yes --no-tty --trust-model always --recipient "$recipient" \
  --output "$home/output.dump.gpg" --encrypt "$home/input.dump"
chmod 600 "$home/output.dump.gpg"
gpg --batch --no-tty --decrypt --output "$home/restored.dump" "$home/output.dump.gpg" >/dev/null 2>&1
cmp "$home/input.dump" "$home/restored.dump"

printf 'backup-gpg-smoke=passed\n'
