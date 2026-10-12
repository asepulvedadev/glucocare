import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 3;

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

  if (currentVersion < 2) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS medications (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        dose_text TEXT NOT NULL,
        route TEXT NOT NULL,
        hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
        minute INTEGER NOT NULL CHECK (minute BETWEEN 0 AND 59),
        enabled INTEGER NOT NULL DEFAULT 1,
        notification_id TEXT,
        reminder_state TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_medications_schedule ON medications(hour ASC, minute ASC);
    `);
    currentVersion = 2;
  }

  if (currentVersion < 3) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        provider TEXT NOT NULL,
        scheduled_at TEXT NOT NULL,
        status TEXT NOT NULL,
        location TEXT,
        notes TEXT,
        reminder_state TEXT NOT NULL,
        notification_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at ASC);
    `);
    currentVersion = 3;
  }

  if (currentVersion !== DATABASE_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  }
}
