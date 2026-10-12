import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 17;

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

  if (currentVersion < 4) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS emergency_card (
        id TEXT PRIMARY KEY NOT NULL,
        full_name TEXT NOT NULL,
        birth_date TEXT,
        diabetes_type TEXT,
        allergies TEXT,
        care_provider TEXT,
        emergency_notes TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS trusted_contacts (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        relationship TEXT,
        phone TEXT,
        email TEXT,
        consent_granted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);
    currentVersion = 4;
  }

  if (currentVersion < 5) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS help_events (
        id TEXT PRIMARY KEY NOT NULL,
        created_at TEXT NOT NULL,
        reason TEXT NOT NULL,
        contact_state TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_help_events_created_at ON help_events(created_at DESC);
    `);
    currentVersion = 5;
  }

  if (currentVersion < 6) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS measurement_plans (
        id TEXT PRIMARY KEY NOT NULL,
        readings_per_day INTEGER NOT NULL CHECK (readings_per_day BETWEEN 1 AND 3),
        times_json TEXT NOT NULL,
        instructions TEXT,
        updated_at TEXT NOT NULL
      );
    `);
    currentVersion = 6;
  }

  if (currentVersion < 7) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_outbox (
        id TEXT PRIMARY KEY NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'acked', 'failed', 'dead_letter')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        acknowledged_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending ON sync_outbox(status, next_attempt_at);
    `);
    currentVersion = 7;
  }

  if (currentVersion < 8) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS accessibility_preferences (
        id TEXT PRIMARY KEY NOT NULL,
        simple_mode INTEGER NOT NULL DEFAULT 0,
        large_text INTEGER NOT NULL DEFAULT 0,
        high_contrast INTEGER NOT NULL DEFAULT 0,
        reduce_motion INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `);
    currentVersion = 8;
  }

  if (currentVersion < 9) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS medication_occurrences (
        id TEXT PRIMARY KEY NOT NULL,
        medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
        scheduled_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'taken', 'skipped', 'snoozed', 'expired', 'not_recorded')),
        acted_at TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (medication_id, scheduled_at)
      );
      CREATE INDEX IF NOT EXISTS idx_medication_occurrences_scheduled_at ON medication_occurrences(scheduled_at ASC);
      CREATE INDEX IF NOT EXISTS idx_medication_occurrences_medication ON medication_occurrences(medication_id, scheduled_at DESC);
    `);
    currentVersion = 9;
  }

  if (currentVersion < 10) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS measurement_occurrences (
        id TEXT PRIMARY KEY NOT NULL,
        plan_id TEXT NOT NULL REFERENCES measurement_plans(id) ON DELETE CASCADE,
        scheduled_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'due', 'completed', 'skipped', 'expired')),
        completed_reading_id TEXT REFERENCES glucose_readings(id) ON DELETE SET NULL,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (plan_id, scheduled_at)
      );
      CREATE INDEX IF NOT EXISTS idx_measurement_occurrences_scheduled_at ON measurement_occurrences(scheduled_at ASC);
    `);
    currentVersion = 10;
  }

  if (currentVersion < 11) {
    const glucoseColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(glucose_readings)');
    if (!glucoseColumns.some((column) => column.name === 'risk_classification')) {
      await db.execAsync('ALTER TABLE glucose_readings ADD COLUMN risk_classification TEXT');
    }
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS care_plan (
        id TEXT PRIMARY KEY NOT NULL,
        low_threshold REAL,
        urgent_low_threshold REAL,
        high_threshold REAL,
        urgent_high_threshold REAL,
        instructions TEXT,
        clinician_verified INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `);
    currentVersion = 11;
  }

  if (currentVersion < 12) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_metadata (
        id TEXT PRIMARY KEY NOT NULL,
        last_pulled_at TEXT
      );
    `);
    currentVersion = 12;
  }

  if (currentVersion < 13) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id TEXT PRIMARY KEY NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        local_event_id TEXT,
        local_payload_json TEXT NOT NULL,
        remote_payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
        resolution TEXT,
        detected_at TEXT NOT NULL,
        resolved_at TEXT,
        UNIQUE (entity_type, entity_id, status)
      );
      CREATE INDEX IF NOT EXISTS idx_sync_conflicts_open ON sync_conflicts(status, detected_at DESC);
    `);
    currentVersion = 13;
  }

  if (currentVersion < 14) {
    const emergencyColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(emergency_card)');
    if (!emergencyColumns.some((column) => column.name === 'care_facility')) {
      await db.execAsync('ALTER TABLE emergency_card ADD COLUMN care_facility TEXT');
    }
    currentVersion = 14;
  }

  if (currentVersion < 15) {
    const medicationColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(medications)');
    if (!medicationColumns.some((column) => column.name === 'times_json')) {
      await db.execAsync("ALTER TABLE medications ADD COLUMN times_json TEXT NOT NULL DEFAULT '[]'");
    }
    if (!medicationColumns.some((column) => column.name === 'notification_ids_json')) {
      await db.execAsync("ALTER TABLE medications ADD COLUMN notification_ids_json TEXT NOT NULL DEFAULT '[]'");
    }
    currentVersion = 15;
  }

  if (currentVersion < 16) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS privacy_consents (
        id TEXT PRIMARY KEY NOT NULL,
        policy_version TEXT NOT NULL,
        local_data_consent INTEGER NOT NULL DEFAULT 0,
        cloud_sync_consent INTEGER NOT NULL DEFAULT 0,
        emergency_sharing_consent INTEGER NOT NULL DEFAULT 0,
        accepted_at TEXT,
        updated_at TEXT NOT NULL
      );
    `);
    currentVersion = 16;
  }

  if (currentVersion < 17) {
    const carePlanColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(care_plan)');
    if (!carePlanColumns.some((column) => column.name === 'source')) await db.execAsync('ALTER TABLE care_plan ADD COLUMN source TEXT');
    if (!carePlanColumns.some((column) => column.name === 'effective_from')) await db.execAsync('ALTER TABLE care_plan ADD COLUMN effective_from TEXT');
    if (!carePlanColumns.some((column) => column.name === 'effective_to')) await db.execAsync('ALTER TABLE care_plan ADD COLUMN effective_to TEXT');
    currentVersion = 17;
  }

  if (currentVersion !== DATABASE_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  }
}
