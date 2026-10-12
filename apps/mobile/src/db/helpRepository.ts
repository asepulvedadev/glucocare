import type { SQLiteDatabase } from 'expo-sqlite';
import { enqueueOutbox } from './outboxRepository';
import { newId } from '../ids';

export async function recordHelpEvent(db: SQLiteDatabase, reason: string) {
  const id = newId();
  const createdAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO help_events (id, created_at, reason, contact_state) VALUES (?, ?, ?, ?)', id, createdAt, reason, 'queued_local');
    await enqueueOutbox(db, { id: newId(), entityType: 'emergency_incident', entityId: id, eventType: 'emergency.incident.started.v1', payload: { id, createdAt, reason, contactState: 'queued_local' } });
  });
  return id;
}
