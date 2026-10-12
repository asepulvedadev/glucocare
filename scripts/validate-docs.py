#!/usr/bin/env python3
"""Validate the documentation release without network access."""

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
required = [
    "README.md",
    "project.md",
    "design.md",
    "docs/01-product-requirements.md",
    "docs/02-clinical-safety.md",
    "docs/03-ux-accessibility.md",
    "docs/04-architecture.md",
    "docs/07-security-privacy-compliance.md",
    "docs/10-roadmap-backlog.md",
    "deploy/compose.yml",
    "Dockerfile",
]

missing = [p for p in required if not (ROOT / p).exists()]
if missing:
    print("Missing required files:", ", ".join(missing), file=sys.stderr)
    raise SystemExit(1)

errors = []
for path in ROOT.rglob("*.md"):
    for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", path.read_text(encoding="utf-8")):
        if target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        local = (path.parent / target.split("#", 1)[0]).resolve()
        if not local.exists():
            errors.append(f"{path}: {target}")

if errors:
    print("Broken internal Markdown links:", file=sys.stderr)
    print("\n".join(errors), file=sys.stderr)
    raise SystemExit(1)

print(f"Validated {len(list(ROOT.rglob('*.md')))} Markdown files and all internal links.")
