import type { SQLiteDatabase } from 'expo-sqlite';

export async function recordHelpEvent(db: SQLiteDatabase, reason: string) {
  const id = `help_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.runAsync('INSERT INTO help_events (id, created_at, reason, contact_state) VALUES (?, ?, ?, ?)', id, new Date().toISOString(), reason, 'queued_local');
  return id;
}
