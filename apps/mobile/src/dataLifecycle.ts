import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { cancelMedicationReminder } from './notifications';

export type ExportFormat = 'json' | 'csv';

type TableRows = Record<string, unknown>[];
type JsonObject = Record<string, unknown>;

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_ROWS_PER_TABLE = 25_000;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(row: JsonObject, field: string): string {
  const value = row[field];
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) throw new Error(`Invalid ${field}.`);
  return value;
}

function optionalString(row: JsonObject, field: string): string | null {
  const value = row[field];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 4096) throw new Error(`Invalid ${field}.`);
  return value;
}

function nullableNumber(row: JsonObject, field: string): number | null {
  const value = row[field];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid ${field}.`);
  return value;
}

function integer(row: JsonObject, field: string, minimum: number, maximum: number, fallback?: number): number {
  const value = row[field] ?? fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`Invalid ${field}.`);
  return value;
}

function booleanFlag(row: JsonObject, field: string, fallback = false): number {
  const value = row[field];
  if (value === undefined || value === null) return fallback ? 1 : 0;
  if (value === true || value === 1) return 1;
  if (value === false || value === 0) return 0;
  throw new Error(`Invalid ${field}.`);
}

function enumValue<T extends string>(row: JsonObject, field: string, allowed: readonly T[], fallback?: T): T {
  const value = row[field] ?? fallback;
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`Invalid ${field}.`);
  return value as T;
}

function jsonArray(value: unknown, field: string): string {
  if (value === undefined || value === null) return '[]';
  if (typeof value !== 'string' || value.length > 32_000) throw new Error(`Invalid ${field}.`);
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string' || item.length > 128)) throw new Error('not an array');
    return JSON.stringify(parsed);
  } catch {
    throw new Error(`Invalid ${field}.`);
  }
}

function rowsFrom(bundle: JsonObject, field: string): JsonObject[] {
  const value = bundle[field];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_ROWS_PER_TABLE || value.some((row) => !isObject(row))) throw new Error(`Invalid ${field}.`);
  return value as JsonObject[];
}

function parseImport(content: string): JsonObject {
  if (content.length > MAX_IMPORT_BYTES) throw new Error('El archivo supera el tamaño permitido.');
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error('El archivo no contiene JSON válido.'); }
  if (!isObject(parsed) || parsed.schemaVersion !== 2) throw new Error('Versión de exportación no compatible.');
  return parsed;
}

async function rows(db: SQLiteDatabase, table: string): Promise<TableRows> {
  return db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`);
}

export async function buildExportContent(db: SQLiteDatabase, format: ExportFormat) {
  const exportedAt = new Date().toISOString();
  const bundle = {
    schemaVersion: 2,
    exportedAt,
    glucoseReadings: await rows(db, 'glucose_readings'),
    carePlan: await rows(db, 'care_plan'),
    medications: await rows(db, 'medications'),
    medicationOccurrences: await rows(db, 'medication_occurrences'),
    appointments: await rows(db, 'appointments'),
    emergencyCard: await rows(db, 'emergency_card'),
    trustedContacts: await rows(db, 'trusted_contacts'),
    helpEvents: await rows(db, 'help_events'),
    measurementPlan: await rows(db, 'measurement_plans'),
    measurementOccurrences: await rows(db, 'measurement_occurrences'),
    syncOutbox: await rows(db, 'sync_outbox'),
    syncMetadata: await rows(db, 'sync_metadata'),
    accessibilityPreferences: await rows(db, 'accessibility_preferences'),
    privacyConsent: await rows(db, 'privacy_consents'),
    syncConflicts: await rows(db, 'sync_conflicts'),
  };
  if (format === 'json') return { content: JSON.stringify(bundle, null, 2), filename: `glucocare-export-${Date.now()}.json`, mimeType: 'application/json' };

  const glucose = bundle.glucoseReadings;
  const header = ['recorded_at', 'value', 'unit', 'context', 'symptoms', 'note'];
  const csvValue = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const body = glucose.map((reading) => header.map((field) => csvValue(reading[field])).join(',')).join('\n');
  return { content: `${header.join(',')}\n${body}\n`, filename: `glucocare-glucose-${Date.now()}.csv`, mimeType: 'text/csv' };
}

export async function shareExport(db: SQLiteDatabase, format: ExportFormat): Promise<{ shared: boolean; filename: string }> {
  const exported = await buildExportContent(db, format);
  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') return { shared: false, filename: exported.filename };
    const blob = new Blob([exported.content], { type: exported.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = exported.filename; anchor.click(); URL.revokeObjectURL(url);
    return { shared: true, filename: exported.filename };
  }
  const file = new File(Paths.cache, exported.filename);
  file.write(exported.content);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: exported.mimeType, dialogTitle: 'Exportar datos de GlucoCare' });
    return { shared: true, filename: exported.filename };
  }
  return { shared: false, filename: file.uri };
}

async function cancelStoredReminders(db: SQLiteDatabase) {
  const scheduled = await db.getAllAsync<{ notification_id: string | null; notification_ids_json: string | null }>(
    `SELECT notification_id, notification_ids_json FROM medications WHERE notification_id IS NOT NULL OR notification_ids_json != '[]'
     UNION ALL SELECT notification_id, NULL AS notification_ids_json FROM appointments WHERE notification_id IS NOT NULL`,
  );
  for (const row of scheduled) {
    let ids: string[] = row.notification_id ? [row.notification_id] : [];
    try {
      const parsed: unknown = row.notification_ids_json ? JSON.parse(row.notification_ids_json) : [];
      if (Array.isArray(parsed)) ids = parsed.filter((item): item is string => typeof item === 'string');
    } catch { /* Keep the legacy single identifier. */ }
    await cancelMedicationReminder(ids);
  }
}

async function clearLocalTables(db: SQLiteDatabase) {
  await db.runAsync('DELETE FROM measurement_occurrences');
  await db.runAsync('DELETE FROM medication_occurrences');
  await db.runAsync('DELETE FROM glucose_readings');
  await db.runAsync('DELETE FROM care_plan');
  await db.runAsync('DELETE FROM medications');
  await db.runAsync('DELETE FROM appointments');
  await db.runAsync('DELETE FROM emergency_card');
  await db.runAsync('DELETE FROM trusted_contacts');
  await db.runAsync('DELETE FROM help_events');
  await db.runAsync('DELETE FROM measurement_plans');
  await db.runAsync('DELETE FROM sync_outbox');
  await db.runAsync('DELETE FROM sync_metadata');
  await db.runAsync('DELETE FROM sync_conflicts');
  await db.runAsync('DELETE FROM accessibility_preferences');
  await db.runAsync('DELETE FROM privacy_consents');
}

/**
 * Restores user records from a GlucoCare JSON export.
 *
 * The restore is an explicit replace operation. Sync queues, cursors, conflicts,
 * privacy consent, and notification identifiers are intentionally not restored:
 * imported data stays local until the user reviews it and grants consent again.
 */
export async function restoreFromExportContent(db: SQLiteDatabase, content: string) {
  const bundle = parseImport(content);
  const glucose = rowsFrom(bundle, 'glucoseReadings');
  const carePlan = rowsFrom(bundle, 'carePlan');
  const medications = rowsFrom(bundle, 'medications');
  const medicationOccurrences = rowsFrom(bundle, 'medicationOccurrences');
  const appointments = rowsFrom(bundle, 'appointments');
  const emergencyCard = rowsFrom(bundle, 'emergencyCard');
  const trustedContacts = rowsFrom(bundle, 'trustedContacts');
  const helpEvents = rowsFrom(bundle, 'helpEvents');
  const measurementPlan = rowsFrom(bundle, 'measurementPlan');
  const measurementOccurrences = rowsFrom(bundle, 'measurementOccurrences');
  const accessibilityPreferences = rowsFrom(bundle, 'accessibilityPreferences');

  await cancelStoredReminders(db);
  await db.withTransactionAsync(async () => {
    await clearLocalTables(db);

    for (const row of glucose) {
      enumValue(row, 'unit', ['mg/dL', 'mmol/L'] as const);
      const context = enumValue(row, 'context', ['fasting', 'before_meal', 'after_meal', 'bedtime', 'other'] as const);
      await db.runAsync(
        `INSERT INTO glucose_readings (id, value, unit, context, recorded_at, symptoms, note, sync_state, risk_classification)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'local', ?)`,
        requiredString(row, 'id'), nullableNumber(row, 'value') ?? (() => { throw new Error('Invalid value.'); })(), context,
        requiredString(row, 'recorded_at'), optionalString(row, 'symptoms'), optionalString(row, 'note'), optionalString(row, 'risk_classification'),
      );
    }

    for (const row of carePlan) {
      await db.runAsync(
        `INSERT INTO care_plan (id, low_threshold, urgent_low_threshold, high_threshold, urgent_high_threshold, instructions, clinician_verified, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        requiredString(row, 'id'), nullableNumber(row, 'low_threshold'), nullableNumber(row, 'urgent_low_threshold'), nullableNumber(row, 'high_threshold'), nullableNumber(row, 'urgent_high_threshold'), optionalString(row, 'instructions'), booleanFlag(row, 'clinician_verified'), requiredString(row, 'updated_at'),
      );
    }

    for (const row of medications) {
      const hour = integer(row, 'hour', 0, 23);
      const minute = integer(row, 'minute', 0, 59);
      const route = enumValue(row, 'route', ['oral', 'injection', 'inhaled', 'topical', 'other'] as const);
      const reminderState = enumValue(row, 'reminder_state', ['scheduled', 'permission_denied', 'unavailable'] as const, 'unavailable');
      await db.runAsync(
        `INSERT INTO medications (id, name, dose_text, route, hour, minute, times_json, enabled, notification_id, notification_ids_json, reminder_state, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]', ?, ?)`,
        requiredString(row, 'id'), requiredString(row, 'name'), requiredString(row, 'dose_text'), route, hour, minute,
        jsonArray(row.times_json, 'times_json'), booleanFlag(row, 'enabled', true), reminderState === 'scheduled' ? 'unavailable' : reminderState, requiredString(row, 'created_at'),
      );
    }

    for (const row of appointments) {
      const status = enumValue(row, 'status', ['requested', 'pending_authorization', 'authorized', 'scheduled', 'completed', 'cancelled'] as const);
      await db.runAsync(
        `INSERT INTO appointments (id, title, provider, scheduled_at, status, location, notes, reminder_state, notification_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'unavailable', NULL, ?)`,
        requiredString(row, 'id'), requiredString(row, 'title'), requiredString(row, 'provider'), requiredString(row, 'scheduled_at'), status, optionalString(row, 'location'), optionalString(row, 'notes'), requiredString(row, 'created_at'),
      );
    }

    for (const row of emergencyCard) {
      await db.runAsync(
        `INSERT INTO emergency_card (id, full_name, birth_date, diabetes_type, allergies, care_provider, care_facility, emergency_notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        requiredString(row, 'id'), requiredString(row, 'full_name'), optionalString(row, 'birth_date'), optionalString(row, 'diabetes_type'), optionalString(row, 'allergies'), optionalString(row, 'care_provider'), optionalString(row, 'care_facility'), optionalString(row, 'emergency_notes'), requiredString(row, 'updated_at'),
      );
    }

    for (const row of trustedContacts) {
      await db.runAsync(
        `INSERT INTO trusted_contacts (id, name, relationship, phone, email, consent_granted, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
        requiredString(row, 'id'), requiredString(row, 'name'), optionalString(row, 'relationship'), optionalString(row, 'phone'), optionalString(row, 'email'), requiredString(row, 'created_at'),
      );
    }

    for (const row of helpEvents) {
      await db.runAsync(
        `INSERT INTO help_events (id, created_at, reason, contact_state) VALUES (?, ?, ?, ?)`,
        requiredString(row, 'id'), requiredString(row, 'created_at'), requiredString(row, 'reason'), requiredString(row, 'contact_state'),
      );
    }

    for (const row of measurementPlan) {
      await db.runAsync(
        `INSERT INTO measurement_plans (id, readings_per_day, times_json, instructions, updated_at) VALUES (?, ?, ?, ?, ?)`,
        requiredString(row, 'id'), integer(row, 'readings_per_day', 1, 3), jsonArray(row.times_json, 'times_json'), optionalString(row, 'instructions'), requiredString(row, 'updated_at'),
      );
    }

    for (const row of medicationOccurrences) {
      const status = enumValue(row, 'status', ['due', 'taken', 'skipped', 'snoozed', 'expired', 'not_recorded'] as const);
      await db.runAsync(
        `INSERT INTO medication_occurrences (id, medication_id, scheduled_at, status, acted_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        requiredString(row, 'id'), requiredString(row, 'medication_id'), requiredString(row, 'scheduled_at'), status, optionalString(row, 'acted_at'), requiredString(row, 'created_at'),
      );
    }

    for (const row of measurementOccurrences) {
      const status = enumValue(row, 'status', ['planned', 'due', 'completed', 'skipped', 'expired'] as const);
      await db.runAsync(
        `INSERT INTO measurement_occurrences (id, plan_id, scheduled_at, status, completed_reading_id, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        requiredString(row, 'id'), requiredString(row, 'plan_id'), requiredString(row, 'scheduled_at'), status, optionalString(row, 'completed_reading_id'), optionalString(row, 'completed_at'), requiredString(row, 'created_at'),
      );
    }

    for (const row of accessibilityPreferences) {
      await db.runAsync(
        `INSERT INTO accessibility_preferences (id, simple_mode, large_text, high_contrast, reduce_motion, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        requiredString(row, 'id'), booleanFlag(row, 'simple_mode'), booleanFlag(row, 'large_text'), booleanFlag(row, 'high_contrast'), booleanFlag(row, 'reduce_motion'), requiredString(row, 'updated_at'),
      );
    }
  });
  return { imported: glucose.length + carePlan.length + medications.length + appointments.length + emergencyCard.length + trustedContacts.length + helpEvents.length + measurementPlan.length + medicationOccurrences.length + measurementOccurrences.length, contactsRequireConsent: trustedContacts.length > 0 };
}

export async function deleteAllLocalData(db: SQLiteDatabase) {
  await cancelStoredReminders(db);
  await db.withTransactionAsync(async () => {
    await clearLocalTables(db);
  });
}
