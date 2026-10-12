import type { SQLiteDatabase } from 'expo-sqlite';
import { enqueueOutbox } from './outboxRepository';
import { newId } from '../ids';

export type HelpEvent = {
  id: string;
  createdAt: string;
  reason: string;
  contactState: string;
};

export async function recordHelpEvent(db: SQLiteDatabase, reason: string) {
  const id = newId();
  const createdAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO help_events (id, created_at, reason, contact_state) VALUES (?, ?, ?, ?)', id, createdAt, reason, 'queued_local');
    await enqueueOutbox(db, { id: newId(), entityType: 'emergency_incident', entityId: id, eventType: 'emergency.incident.started.v1', payload: { id, createdAt, reason, contactState: 'queued_local' } });
  });
  return id;
}

export async function listHelpEvents(db: SQLiteDatabase, limit = 20): Promise<HelpEvent[]> {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 100));
  const rows = await db.getAllAsync<{ id: string; created_at: string; reason: string; contact_state: string }>(
    `SELECT id, created_at, reason, contact_state FROM help_events ORDER BY created_at DESC LIMIT ${safeLimit}`,
  );
  return rows.map((row) => ({ id: row.id, createdAt: row.created_at, reason: row.reason, contactState: row.contact_state }));
}
