#!/usr/bin/env python3
"""High-confidence secret scan for tracked text files.

This is a CI guardrail, not a replacement for provider-side secret rotation or
an external DLP service. It deliberately ignores environment-variable
references such as env(SUPABASE_SERVICE_ROLE_KEY) and Deno.env.get(...).
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


PATTERNS = (
    re.compile(rb"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----"),
    re.compile(rb"\b(?:ghp|github_pat|sk_live|sk_test|xox[baprs])-[A-Za-z0-9_-]{12,}\b"),
    re.compile(rb"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(rb"(?i)\b(?:password|secret|token|api[_-]?key)\s*[:=]\s*[\"'][^\"']{20,}[\"']"),
)


def tracked_paths() -> list[Path]:
    result = subprocess.run(["git", "ls-files", "-z"], check=True, stdout=subprocess.PIPE)
    return [Path(item) for item in result.stdout.decode().split("\0") if item]


def main() -> int:
    findings: list[tuple[Path, int]] = []
    for path in tracked_paths():
        try:
            content = path.read_bytes()
        except OSError:
            continue
        if len(content) > 2_000_000 or b"\0" in content:
            continue
        for line_number, line in enumerate(content.splitlines(), start=1):
            if b"env(" in line or b"secrets." in line:
                continue
            if any(pattern.search(line) for pattern in PATTERNS):
                findings.append((path, line_number))
    if findings:
        print("Potential high-confidence secrets found:")
        for path, line_number in findings:
            print(f"- {path}:{line_number}")
        return 1
    print(f"Secret scan passed for {len(tracked_paths())} tracked files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
