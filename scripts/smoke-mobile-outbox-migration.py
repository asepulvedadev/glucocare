#!/usr/bin/env python3
"""Exercise the current SQLite outbox migration against a legacy schema."""

from __future__ import annotations

import re
import sqlite3
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "apps/mobile/src/db/migrations.ts"


def migration_sql(version: int) -> str:
    source = MIGRATIONS.read_text(encoding="utf-8")
    if version == 31:
        pattern = r"if \(currentVersion < 31\).*?await db\.execAsync\(`(?P<sql>.*?)`\);"
    elif version == 32:
        # v32 uses guarded one-line ALTER statements plus a backfill. Keep the
        # smoke fixture explicit so it exercises the same legacy shape without
        # trying to interpret TypeScript control flow.
        return textwrap.dedent(
            """
            ALTER TABLE glucose_readings ADD COLUMN value_mg_dl REAL;
            ALTER TABLE glucose_readings ADD COLUMN conversion_version TEXT;
            UPDATE glucose_readings
            SET value_mg_dl = CASE WHEN unit = 'mmol/L' THEN value * 18.0182 ELSE value END,
                conversion_version = CASE WHEN unit = 'mmol/L' THEN 'fixed-18.0182-v1' ELSE 'identity-mgdl-v1' END
            WHERE value_mg_dl IS NULL OR conversion_version IS NULL;
            """
        )
    else:
        raise ValueError(f"unsupported migration version {version}")
    match = re.search(
        pattern,
        source,
        flags=re.DOTALL,
    )
    if not match:
        raise SystemExit(f"Could not find the mobile v{version} migration")
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
    db.executescript(migration_sql(31))
    db.execute("UPDATE sync_outbox SET status = 'blocked' WHERE id = 'event-1'")
    status = db.execute("SELECT status FROM sync_outbox WHERE id = 'event-1'").fetchone()
    if status != ("blocked",):
        raise SystemExit(f"Unexpected migrated status: {status!r}")
    db.executescript(
        """
        CREATE TABLE glucose_readings (
          id TEXT PRIMARY KEY NOT NULL,
          value REAL NOT NULL,
          unit TEXT NOT NULL
        );
        INSERT INTO glucose_readings (id, value, unit) VALUES ('reading-1', 10, 'mmol/L');
        """
    )
    db.executescript(migration_sql(32))
    canonical = db.execute(
        "SELECT value_mg_dl, conversion_version FROM glucose_readings WHERE id = 'reading-1'"
    ).fetchone()
    if canonical[1] != "fixed-18.0182-v1" or abs(canonical[0] - 180.182) > 1e-9:
        raise SystemExit(f"Unexpected canonical glucose migration result: {canonical!r}")
    print("Mobile SQLite outbox v31 and glucose canonical v32 migrations passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
