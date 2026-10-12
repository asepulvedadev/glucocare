#!/usr/bin/env python3
"""Exercise the current SQLite outbox migration against a legacy schema."""

from __future__ import annotations

import re
import sqlite3
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "apps/mobile/src/db/migrations.ts"


def migration_sql() -> str:
    source = MIGRATIONS.read_text(encoding="utf-8")
    match = re.search(
        r"if \(currentVersion < 31\).*?await db\.execAsync\(`(?P<sql>.*?)`\);",
        source,
        flags=re.DOTALL,
    )
    if not match:
        raise SystemExit("Could not find the mobile outbox v31 migration")
    return textwrap.dedent(match.group("sql"))


def main() -> int:
    db = sqlite3.connect(":memory:")
    db.executescript(
        """
        CREATE TABLE sync_outbox (
          id TEXT PRIMARY KEY NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'sending', 'acked', 'failed', 'dead_letter')),
          attempt_count INTEGER NOT NULL DEFAULT 0,
          next_attempt_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          acknowledged_at TEXT
        );
        CREATE INDEX idx_sync_outbox_pending ON sync_outbox(status, next_attempt_at);
        INSERT INTO sync_outbox
          (id, entity_type, entity_id, event_type, payload_json, status, attempt_count, next_attempt_at, created_at)
        VALUES ('event-1', 'trusted_contact', 'contact-1', 'contact.created.v1', '{}', 'pending', 0, 'now', 'now');
        """
    )
    db.executescript(migration_sql())
    db.execute("UPDATE sync_outbox SET status = 'blocked' WHERE id = 'event-1'")
    status = db.execute("SELECT status FROM sync_outbox WHERE id = 'event-1'").fetchone()
    if status != ("blocked",):
        raise SystemExit(f"Unexpected migrated status: {status!r}")
    print("Mobile SQLite outbox v31 migration passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
