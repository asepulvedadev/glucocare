import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 42;

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
        presentation TEXT,
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
        notification_sound INTEGER NOT NULL DEFAULT 1,
        notification_vibration INTEGER NOT NULL DEFAULT 1,
        app_lock_enabled INTEGER NOT NULL DEFAULT 0,
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

  if (currentVersion < 18) {
    const emergencyColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(emergency_card)');
    if (!emergencyColumns.some((column) => column.name === 'emergency_number')) await db.execAsync('ALTER TABLE emergency_card ADD COLUMN emergency_number TEXT');
    if (!emergencyColumns.some((column) => column.name === 'emergency_region')) await db.execAsync('ALTER TABLE emergency_card ADD COLUMN emergency_region TEXT');
    currentVersion = 18;
  }

  if (currentVersion < 19) {
    const preferenceColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(accessibility_preferences)');
    if (!preferenceColumns.some((column) => column.name === 'onboarding_completed')) await db.execAsync('ALTER TABLE accessibility_preferences ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0');
    await db.runAsync(`UPDATE accessibility_preferences SET onboarding_completed = 1 WHERE onboarding_completed = 0 AND EXISTS (SELECT 1 FROM privacy_consents WHERE privacy_consents.id = 'default' AND privacy_consents.local_data_consent = 1)`);
    currentVersion = 19;
  }

  if (currentVersion < 20) {
    const emergencyColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(emergency_card)');
    if (!emergencyColumns.some((column) => column.name === 'diagnosis_year')) await db.execAsync('ALTER TABLE emergency_card ADD COLUMN diagnosis_year TEXT');
    if (!emergencyColumns.some((column) => column.name === 'insulin_use')) await db.execAsync("ALTER TABLE emergency_card ADD COLUMN insulin_use TEXT CHECK (insulin_use IN ('yes', 'no', 'unknown'))");
    if (!emergencyColumns.some((column) => column.name === 'critical_conditions')) await db.execAsync('ALTER TABLE emergency_card ADD COLUMN critical_conditions TEXT');
    if (!emergencyColumns.some((column) => column.name === 'insurer')) await db.execAsync('ALTER TABLE emergency_card ADD COLUMN insurer TEXT');
    if (!emergencyColumns.some((column) => column.name === 'policy_number')) await db.execAsync('ALTER TABLE emergency_card ADD COLUMN policy_number TEXT');
    currentVersion = 20;
  }

  if (currentVersion < 21) {
    const medicationColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(medications)');
    if (!medicationColumns.some((column) => column.name === 'prescriber_name')) await db.execAsync('ALTER TABLE medications ADD COLUMN prescriber_name TEXT');
    if (!medicationColumns.some((column) => column.name === 'instructions')) await db.execAsync('ALTER TABLE medications ADD COLUMN instructions TEXT');
    if (!medicationColumns.some((column) => column.name === 'start_date')) await db.execAsync('ALTER TABLE medications ADD COLUMN start_date TEXT');
    if (!medicationColumns.some((column) => column.name === 'end_date')) await db.execAsync('ALTER TABLE medications ADD COLUMN end_date TEXT');
    currentVersion = 21;
  }

  if (currentVersion < 22) {
    const measurementColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(measurement_plans)');
    if (!measurementColumns.some((column) => column.name === 'timings_json')) await db.execAsync("ALTER TABLE measurement_plans ADD COLUMN timings_json TEXT NOT NULL DEFAULT '[]'");
    currentVersion = 22;
  }

  if (currentVersion < 23) {
    const measurementColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(measurement_plans)');
    if (!measurementColumns.some((column) => column.name === 'weekdays_json')) await db.execAsync("ALTER TABLE measurement_plans ADD COLUMN weekdays_json TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,7]'");
    if (!measurementColumns.some((column) => column.name === 'effective_from')) await db.execAsync('ALTER TABLE measurement_plans ADD COLUMN effective_from TEXT');
    if (!measurementColumns.some((column) => column.name === 'effective_to')) await db.execAsync('ALTER TABLE measurement_plans ADD COLUMN effective_to TEXT');
    currentVersion = 23;
  }

  if (currentVersion < 24) {
    const appointmentColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(appointments)');
    if (!appointmentColumns.some((column) => column.name === 'specialty')) await db.execAsync('ALTER TABLE appointments ADD COLUMN specialty TEXT');
    if (!appointmentColumns.some((column) => column.name === 'insurer')) await db.execAsync('ALTER TABLE appointments ADD COLUMN insurer TEXT');
    if (!appointmentColumns.some((column) => column.name === 'authorization_number')) await db.execAsync('ALTER TABLE appointments ADD COLUMN authorization_number TEXT');
    if (!appointmentColumns.some((column) => column.name === 'facility')) await db.execAsync('ALTER TABLE appointments ADD COLUMN facility TEXT');
    if (!appointmentColumns.some((column) => column.name === 'requested_at')) await db.execAsync('ALTER TABLE appointments ADD COLUMN requested_at TEXT');
    if (!appointmentColumns.some((column) => column.name === 'virtual_url')) await db.execAsync('ALTER TABLE appointments ADD COLUMN virtual_url TEXT');
    if (!appointmentColumns.some((column) => column.name === 'preparation_notes')) await db.execAsync('ALTER TABLE appointments ADD COLUMN preparation_notes TEXT');
    currentVersion = 24;
  }

  if (currentVersion < 25) {
    const glucoseColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(glucose_readings)');
    if (!glucoseColumns.some((column) => column.name === 'source')) await db.execAsync("ALTER TABLE glucose_readings ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
    if (!glucoseColumns.some((column) => column.name === 'meal_offset_minutes')) await db.execAsync('ALTER TABLE glucose_readings ADD COLUMN meal_offset_minutes INTEGER');
    currentVersion = 25;
  }

  if (currentVersion < 26) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS meal_events (
        id TEXT PRIMARY KEY NOT NULL,
        meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
        occurred_at TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        sync_state TEXT NOT NULL DEFAULT 'pending' CHECK (sync_state IN ('local', 'pending', 'synced', 'failed'))
      );
      CREATE INDEX IF NOT EXISTS idx_meal_events_occurred_at ON meal_events(occurred_at DESC);
    `);
    const occurrenceColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(measurement_occurrences)');
    const measurementColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(measurement_plans)');
    if (!measurementColumns.some((column) => column.name === 'windows_json')) await db.execAsync("ALTER TABLE measurement_plans ADD COLUMN windows_json TEXT NOT NULL DEFAULT '[]'");
    if (!occurrenceColumns.some((column) => column.name === 'window_index')) await db.execAsync('ALTER TABLE measurement_occurrences ADD COLUMN window_index INTEGER');
    if (!occurrenceColumns.some((column) => column.name === 'meal_event_id')) await db.execAsync('ALTER TABLE measurement_occurrences ADD COLUMN meal_event_id TEXT REFERENCES meal_events(id) ON DELETE SET NULL');
    currentVersion = 26;
  }

  if (currentVersion < 27) {
    const glucoseColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(glucose_readings)');
    if (!glucoseColumns.some((column) => column.name === 'timezone')) await db.execAsync("ALTER TABLE glucose_readings ADD COLUMN timezone TEXT");
    if (!glucoseColumns.some((column) => column.name === 'utc_offset_minutes')) await db.execAsync('ALTER TABLE glucose_readings ADD COLUMN utc_offset_minutes INTEGER');
    if (!glucoseColumns.some((column) => column.name === 'time_edited')) await db.execAsync('ALTER TABLE glucose_readings ADD COLUMN time_edited INTEGER NOT NULL DEFAULT 0');
    currentVersion = 27;
  }

  if (currentVersion < 28) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS glucose_audit_events (
        id TEXT PRIMARY KEY NOT NULL,
        reading_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT,
        before_json TEXT NOT NULL,
        after_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_glucose_audit_reading ON glucose_audit_events(reading_id, occurred_at DESC);
    `);
    currentVersion = 28;
  }

  if (currentVersion < 29) {
    const preferenceColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(accessibility_preferences)');
    if (!preferenceColumns.some((column) => column.name === 'notification_sound')) await db.execAsync('ALTER TABLE accessibility_preferences ADD COLUMN notification_sound INTEGER NOT NULL DEFAULT 1');
    if (!preferenceColumns.some((column) => column.name === 'notification_vibration')) await db.execAsync('ALTER TABLE accessibility_preferences ADD COLUMN notification_vibration INTEGER NOT NULL DEFAULT 1');
    currentVersion = 29;
  }

  if (currentVersion < 30) {
    const preferenceColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(accessibility_preferences)');
    if (!preferenceColumns.some((column) => column.name === 'app_lock_enabled')) await db.execAsync('ALTER TABLE accessibility_preferences ADD COLUMN app_lock_enabled INTEGER NOT NULL DEFAULT 0');
    currentVersion = 30;
  }

  if (currentVersion < 31) {
    // A trusted-contact event must be retainable locally while emergency
    // sharing consent is withdrawn. Rebuild the table to add a durable
    // consent-blocked state without losing queued events.
    await db.execAsync(`
      BEGIN;
      ALTER TABLE sync_outbox RENAME TO sync_outbox_legacy;
      CREATE TABLE sync_outbox (
        id TEXT PRIMARY KEY NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'acked', 'failed', 'dead_letter', 'blocked')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        acknowledged_at TEXT
      );
      INSERT INTO sync_outbox (id, entity_type, entity_id, event_type, payload_json, status, attempt_count, next_attempt_at, created_at, acknowledged_at)
        SELECT id, entity_type, entity_id, event_type, payload_json, status, attempt_count, next_attempt_at, created_at, acknowledged_at
        FROM sync_outbox_legacy;
      DROP TABLE sync_outbox_legacy;
      CREATE INDEX idx_sync_outbox_pending ON sync_outbox(status, next_attempt_at);
      COMMIT;
    `);
    currentVersion = 31;
  }

  if (currentVersion < 32) {
    const glucoseColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(glucose_readings)');
    if (!glucoseColumns.some((column) => column.name === 'value_mg_dl')) await db.execAsync('ALTER TABLE glucose_readings ADD COLUMN value_mg_dl REAL');
    if (!glucoseColumns.some((column) => column.name === 'conversion_version')) await db.execAsync('ALTER TABLE glucose_readings ADD COLUMN conversion_version TEXT');
    await db.execAsync(`
      UPDATE glucose_readings
      SET value_mg_dl = CASE WHEN unit = 'mmol/L' THEN value * 18.0182 ELSE value END,
          conversion_version = CASE WHEN unit = 'mmol/L' THEN 'fixed-18.0182-v1' ELSE 'identity-mgdl-v1' END
      WHERE value_mg_dl IS NULL OR conversion_version IS NULL;
    `);
    currentVersion = 32;
  }

  if (currentVersion < 33) {
    const preferenceColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(accessibility_preferences)');
    if (!preferenceColumns.some((column) => column.name === 'glucose_unit')) await db.execAsync("ALTER TABLE accessibility_preferences ADD COLUMN glucose_unit TEXT NOT NULL DEFAULT 'mg/dL' CHECK (glucose_unit IN ('mg/dL', 'mmol/L'))");
    currentVersion = 33;
  }

  if (currentVersion < 34) {
    // Preserve future medication doses as planned rows so the UI cannot mark
    // a dose taken before its scheduled time. SQLite requires a table rebuild
    // to change the status CHECK constraint.
    await db.execAsync(`
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
    `);
    currentVersion = 34;
  }

  if (currentVersion < 35) {
    await db.execAsync(`
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
    `);
    currentVersion = 35;
  }

  if (currentVersion < 36) {
    const glucoseColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(glucose_readings)');
    if (!glucoseColumns.some((column) => column.name === 'ketone_result')) await db.execAsync("ALTER TABLE glucose_readings ADD COLUMN ketone_result TEXT NOT NULL DEFAULT 'not_checked' CHECK (ketone_result IN ('not_checked', 'negative', 'trace', 'small', 'moderate', 'large', 'unknown'))");
    currentVersion = 36;
  }

  if (currentVersion < 37) {
    const preferenceColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(accessibility_preferences)');
    if (!preferenceColumns.some((column) => column.name === 'touch_feedback')) await db.execAsync('ALTER TABLE accessibility_preferences ADD COLUMN touch_feedback INTEGER NOT NULL DEFAULT 1');
    currentVersion = 37;
  }

  if (currentVersion < 38) {
    const medicationColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(medications)');
    if (!medicationColumns.some((column) => column.name === 'presentation')) await db.execAsync('ALTER TABLE medications ADD COLUMN presentation TEXT');
    currentVersion = 38;
  }

  if (currentVersion < 39) {
    const medicationColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(medications)');
    if (!medicationColumns.some((column) => column.name === 'schedule_json')) await db.execAsync("ALTER TABLE medications ADD COLUMN schedule_json TEXT NOT NULL DEFAULT '{}'");
    currentVersion = 39;
  }

  if (currentVersion < 40) {
    const glucoseColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(glucose_readings)');
    if (!glucoseColumns.some((column) => column.name === 'risk_rule_id')) await db.execAsync('ALTER TABLE glucose_readings ADD COLUMN risk_rule_id TEXT');
    if (!glucoseColumns.some((column) => column.name === 'risk_plan_updated_at')) await db.execAsync('ALTER TABLE glucose_readings ADD COLUMN risk_plan_updated_at TEXT');
    currentVersion = 40;
  }

  if (currentVersion < 41) {
    const emergencyColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(emergency_card)');
    if (!emergencyColumns.some((column) => column.name === 'document_type')) await db.execAsync('ALTER TABLE emergency_card ADD COLUMN document_type TEXT');
    if (!emergencyColumns.some((column) => column.name === 'document_number')) await db.execAsync('ALTER TABLE emergency_card ADD COLUMN document_number TEXT');
    if (!emergencyColumns.some((column) => column.name === 'blood_type')) await db.execAsync('ALTER TABLE emergency_card ADD COLUMN blood_type TEXT');
    if (!emergencyColumns.some((column) => column.name === 'rh_factor')) await db.execAsync('ALTER TABLE emergency_card ADD COLUMN rh_factor TEXT');
    if (!emergencyColumns.some((column) => column.name === 'care_address')) await db.execAsync('ALTER TABLE emergency_card ADD COLUMN care_address TEXT');
    currentVersion = 41;
  }

  if (currentVersion < 42) {
    const privacyColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(privacy_consents)');
    if (!privacyColumns.some((column) => column.name === 'locale')) await db.execAsync("ALTER TABLE privacy_consents ADD COLUMN locale TEXT NOT NULL DEFAULT 'es-CO'");
    if (!privacyColumns.some((column) => column.name === 'purposes_json')) await db.execAsync("ALTER TABLE privacy_consents ADD COLUMN purposes_json TEXT NOT NULL DEFAULT '[]'");
    if (!privacyColumns.some((column) => column.name === 'data_categories_json')) await db.execAsync("ALTER TABLE privacy_consents ADD COLUMN data_categories_json TEXT NOT NULL DEFAULT '[]'");
    if (!privacyColumns.some((column) => column.name === 'recipients_json')) await db.execAsync("ALTER TABLE privacy_consents ADD COLUMN recipients_json TEXT NOT NULL DEFAULT '[]'");
    if (!privacyColumns.some((column) => column.name === 'evidence_method')) await db.execAsync("ALTER TABLE privacy_consents ADD COLUMN evidence_method TEXT NOT NULL DEFAULT 'in_app_checkbox'");
    currentVersion = 42;
  }

  if (currentVersion !== DATABASE_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  }
}
