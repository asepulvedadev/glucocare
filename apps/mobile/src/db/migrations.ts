import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 1;

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentVersion = result?.user_version ?? 0;

  if (currentVersion < 1) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS glucose_readings (
        id TEXT PRIMARY KEY NOT NULL,
        value REAL NOT NULL,
        unit TEXT NOT NULL CHECK (unit IN ('mg/dL', 'mmol/L')),
        context TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        symptoms TEXT,
        note TEXT,
        sync_state TEXT NOT NULL DEFAULT 'local'
      );
      CREATE INDEX IF NOT EXISTS idx_glucose_recorded_at ON glucose_readings(recorded_at DESC);
    `);
    currentVersion = 1;
  }

  if (currentVersion !== DATABASE_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  }
}
