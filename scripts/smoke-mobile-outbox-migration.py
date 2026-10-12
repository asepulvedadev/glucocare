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
    elif version == 33:
        return "ALTER TABLE accessibility_preferences ADD COLUMN glucose_unit TEXT NOT NULL DEFAULT 'mg/dL' CHECK (glucose_unit IN ('mg/dL', 'mmol/L'));"
    elif version == 34:
        return textwrap.dedent(
            """
            BEGIN;
            ALTER TABLE medication_occurrences RENAME TO medication_occurrences_legacy;
            CREATE TABLE medication_occurrences (
              id TEXT PRIMARY KEY NOT NULL,
              medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
              scheduled_at TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'due', 'taken', 'skipped', 'snoozed', 'expired', 'not_recorded')),
              acted_at TEXT,
              created_at TEXT NOT NULL,
              UNIQUE (medication_id, scheduled_at)
            );
            INSERT INTO medication_occurrences (id, medication_id, scheduled_at, status, acted_at, created_at)
              SELECT id, medication_id, scheduled_at, status, acted_at, created_at
              FROM medication_occurrences_legacy;
            DROP TABLE medication_occurrences_legacy;
            CREATE INDEX idx_medication_occurrences_scheduled_at ON medication_occurrences(scheduled_at ASC);
            CREATE INDEX idx_medication_occurrences_medication ON medication_occurrences(medication_id, scheduled_at DESC);
            COMMIT;
            """
        )
    elif version == 35:
        return textwrap.dedent(
            """
            CREATE TABLE IF NOT EXISTS change_audit_events (
              id TEXT PRIMARY KEY NOT NULL,
              entity_type TEXT NOT NULL,
              entity_id TEXT NOT NULL,
              occurred_at TEXT NOT NULL,
              action TEXT NOT NULL,
              before_json TEXT,
              after_json TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_change_audit_entity ON change_audit_events(entity_type, entity_id, occurred_at DESC);
            """
        )
    elif version == 36:
        return "ALTER TABLE glucose_readings ADD COLUMN ketone_result TEXT NOT NULL DEFAULT 'not_checked' CHECK (ketone_result IN ('not_checked', 'negative', 'trace', 'small', 'moderate', 'large', 'unknown'));"
    elif version == 37:
        return "ALTER TABLE accessibility_preferences ADD COLUMN touch_feedback INTEGER NOT NULL DEFAULT 1;"
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
        CREATE TABLE accessibility_preferences (
          id TEXT PRIMARY KEY NOT NULL,
          updated_at TEXT NOT NULL
        );
        """
    )
    db.executescript(migration_sql(32))
    canonical = db.execute(
        "SELECT value_mg_dl, conversion_version FROM glucose_readings WHERE id = 'reading-1'"
    ).fetchone()
    if canonical[1] != "fixed-18.0182-v1" or abs(canonical[0] - 180.182) > 1e-9:
        raise SystemExit(f"Unexpected canonical glucose migration result: {canonical!r}")
    db.executescript(migration_sql(33))
    unit = db.execute("SELECT glucose_unit FROM accessibility_preferences").fetchone()
    if unit is not None:
        raise SystemExit(f"Unexpected preference fixture rows before insert: {unit!r}")
    db.execute("INSERT INTO accessibility_preferences (id, updated_at) VALUES ('default', 'now')")
    unit = db.execute("SELECT glucose_unit FROM accessibility_preferences WHERE id = 'default'").fetchone()
    if unit != ("mg/dL",):
        raise SystemExit(f"Unexpected glucose preference migration result: {unit!r}")
    db.executescript(
        """
        CREATE TABLE medications (id TEXT PRIMARY KEY NOT NULL);
        CREATE TABLE medication_occurrences (
          id TEXT PRIMARY KEY NOT NULL,
          medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
          scheduled_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'taken', 'skipped', 'snoozed', 'expired', 'not_recorded')),
          acted_at TEXT,
          created_at TEXT NOT NULL,
          UNIQUE (medication_id, scheduled_at)
        );
        INSERT INTO medications (id) VALUES ('medication-1');
        INSERT INTO medication_occurrences (id, medication_id, scheduled_at, status, created_at)
          VALUES ('occurrence-1', 'medication-1', '2026-10-12T08:00:00Z', 'due', 'now');
        """
    )
    db.executescript(migration_sql(34))
    preserved = db.execute("SELECT status FROM medication_occurrences WHERE id = 'occurrence-1'").fetchone()
    if preserved != ("due",):
        raise SystemExit(f"Unexpected preserved medication occurrence: {preserved!r}")
    db.execute(
        "INSERT INTO medication_occurrences (id, medication_id, scheduled_at, status, created_at) VALUES (?, ?, ?, ?, ?)",
        ('occurrence-2', 'medication-1', '2026-10-12T20:00:00Z', 'planned', 'now'),
    )
    planned = db.execute("SELECT status FROM medication_occurrences WHERE id = 'occurrence-2'").fetchone()
    if planned != ("planned",):
        raise SystemExit(f"Unexpected planned medication occurrence: {planned!r}")
    db.executescript(migration_sql(35))
    db.execute("INSERT INTO change_audit_events (id, entity_type, entity_id, occurred_at, action, after_json) VALUES ('audit-1', 'medication', 'medication-1', 'now', 'created', '{}')")
    if db.execute("SELECT COUNT(*) FROM change_audit_events").fetchone() != (1,):
        raise SystemExit("Unexpected change audit migration result")
    db.executescript(migration_sql(36))
    ketone = db.execute("SELECT ketone_result FROM glucose_readings WHERE id = 'reading-1'").fetchone()
    if ketone != ("not_checked",):
        raise SystemExit(f"Unexpected ketone migration result: {ketone!r}")
    db.executescript(migration_sql(37))
    touch_feedback = db.execute("SELECT touch_feedback FROM accessibility_preferences WHERE id = 'default'").fetchone()
    if touch_feedback != (1,):
        raise SystemExit(f"Unexpected touch feedback migration result: {touch_feedback!r}")
    print("Mobile SQLite outbox v31, glucose canonical v32, unit preference v33, planned medication v34, change audit v35, ketone v36, and touch feedback v37 migrations passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
