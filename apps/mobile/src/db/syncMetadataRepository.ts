import type { SQLiteDatabase } from 'expo-sqlite';

export async function getLastPulledAt(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ last_pulled_at: string | null }>('SELECT last_pulled_at FROM sync_metadata WHERE id = ?', 'default');
  return row?.last_pulled_at ?? '1970-01-01T00:00:00.000Z';
}

export async function setLastPulledAt(db: SQLiteDatabase, value: string) {
  await db.runAsync(`INSERT INTO sync_metadata (id, last_pulled_at) VALUES ('default', ?) ON CONFLICT(id) DO UPDATE SET last_pulled_at = excluded.last_pulled_at`, value);
}
