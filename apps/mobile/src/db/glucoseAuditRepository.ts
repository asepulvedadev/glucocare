import type { SQLiteDatabase } from 'expo-sqlite';
import type { GlucoseReading } from '../types/domain';

export type GlucoseAuditEvent = {
  id: string;
  readingId: string;
  occurredAt: string;
  action: 'corrected';
  reason?: string;
  before: GlucoseReading;
  after: GlucoseReading;
};

type AuditRow = {
  id: string;
  reading_id: string;
  occurred_at: string;
  action: 'corrected';
  reason: string | null;
  before_json: string;
  after_json: string;
};

function mapRow(row: AuditRow): GlucoseAuditEvent {
  return {
    id: row.id,
    readingId: row.reading_id,
    occurredAt: row.occurred_at,
    action: row.action,
    reason: row.reason ?? undefined,
    before: JSON.parse(row.before_json) as GlucoseReading,
    after: JSON.parse(row.after_json) as GlucoseReading,
  };
}

export async function insertGlucoseAuditEvent(db: SQLiteDatabase, event: GlucoseAuditEvent) {
  await db.runAsync(
    `INSERT INTO glucose_audit_events (id, reading_id, occurred_at, action, reason, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    event.id, event.readingId, event.occurredAt, event.action, event.reason ?? null, JSON.stringify(event.before), JSON.stringify(event.after),
  );
}

export async function listGlucoseAuditEvents(db: SQLiteDatabase, readingId?: string) {
  const rows = readingId
    ? await db.getAllAsync<AuditRow>('SELECT * FROM glucose_audit_events WHERE reading_id = ? ORDER BY occurred_at DESC', readingId)
    : await db.getAllAsync<AuditRow>('SELECT * FROM glucose_audit_events ORDER BY occurred_at DESC');
  return rows.map(mapRow);
}
