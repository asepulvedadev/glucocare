import type { SQLiteDatabase } from 'expo-sqlite';

export type OutboxStatus = 'pending' | 'sending' | 'acked' | 'failed' | 'dead_letter';

export type OutboxEvent = {
  id: string;
  entityType: string;
  entityId: string;
  eventType: string;
  payload: Record<string, unknown>;
};

export type PendingOutboxEvent = OutboxEvent & {
  status: OutboxStatus;
  attemptCount: number;
  nextAttemptAt: string;
  createdAt: string;
};

export type PendingSyncEntity = {
  eventId: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
};

type OutboxRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  event_type: string;
  payload_json: string;
  status: OutboxStatus;
  attempt_count: number;
  next_attempt_at: string;
  created_at: string;
};

export async function enqueueOutbox(db: SQLiteDatabase, event: OutboxEvent) {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO sync_outbox (id, entity_type, entity_id, event_type, payload_json, status, attempt_count, next_attempt_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
    event.id, event.entityType, event.entityId, event.eventType, JSON.stringify(event.payload), now, now,
  );
}

export async function listPendingOutbox(db: SQLiteDatabase, limit = 20): Promise<PendingOutboxEvent[]> {
  const rows = await db.getAllAsync<OutboxRow>(
    `SELECT * FROM sync_outbox WHERE status IN ('pending', 'failed') AND next_attempt_at <= ? ORDER BY created_at ASC LIMIT ?`,
    new Date().toISOString(), limit,
  );
  return rows.map((row) => ({
    id: row.id, entityType: row.entity_type, entityId: row.entity_id, eventType: row.event_type,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>, status: row.status,
    attemptCount: row.attempt_count, nextAttemptAt: row.next_attempt_at, createdAt: row.created_at,
  }));
}

export async function listPendingSyncEntities(db: SQLiteDatabase): Promise<PendingSyncEntity[]> {
  const rows = await db.getAllAsync<Pick<OutboxRow, 'id' | 'entity_type' | 'entity_id' | 'payload_json'>>(
    `SELECT id, entity_type, entity_id, payload_json
     FROM sync_outbox
     WHERE status IN ('pending', 'sending', 'failed')
     ORDER BY created_at ASC`,
  );
  return rows.map((row) => ({
    eventId: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
  }));
}

export async function markOutboxAcked(db: SQLiteDatabase, eventId: string) {
  await db.runAsync(`UPDATE sync_outbox SET status = 'acked', acknowledged_at = ? WHERE id = ?`, new Date().toISOString(), eventId);
}

export async function markOutboxFailed(db: SQLiteDatabase, eventId: string, attemptCount: number) {
  const nextAttemptAt = new Date(Date.now() + Math.min(60 * 60 * 1000, 2 ** Math.min(attemptCount, 8) * 1000)).toISOString();
  const status: OutboxStatus = attemptCount >= 8 ? 'dead_letter' : 'failed';
  await db.runAsync(`UPDATE sync_outbox SET status = ?, attempt_count = ?, next_attempt_at = ? WHERE id = ?`, status, attemptCount, nextAttemptAt, eventId);
}
