import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { cancelAllScheduledReminders, cancelMeasurementPlanReminders, cancelMedicationReminder } from './notifications';
import { buildClinicianReportHtml, type ClinicianReportAppointment, type ClinicianReportCard, type ClinicianReportCorrection, type ClinicianReportHelpEvent, type ClinicianReportMeal, type ClinicianReportMedication, type ClinicianReportMedicationOccurrence, type ClinicianReportReading } from './report';
import { conversionVersionForUnit, toCanonicalMgDl } from './domain/glucoseSummary';

export type ExportFormat = 'json' | 'csv';

type TableRows = Record<string, unknown>[];
type JsonObject = Record<string, unknown>;

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_ROWS_PER_TABLE = 25_000;

export async function printClinicianReport(db: SQLiteDatabase): Promise<{ shared: boolean }> {
  const [card, readings, medications, appointments, meals, medicationOccurrences, helpEvents, auditEvents] = await Promise.all([
    db.getFirstAsync<ClinicianReportCard>('SELECT full_name, birth_date, diabetes_type, diagnosis_year, insulin_use, allergies, critical_conditions, care_provider, care_facility, insurer, policy_number, emergency_notes FROM emergency_card ORDER BY updated_at DESC LIMIT 1'),
    db.getAllAsync<ClinicianReportReading>('SELECT value, unit, context, source, meal_offset_minutes, recorded_at, symptoms, note, risk_classification FROM glucose_readings ORDER BY recorded_at DESC LIMIT 200'),
    db.getAllAsync<ClinicianReportMedication>('SELECT name, dose_text, route, prescriber_name, instructions, start_date, end_date, times_json, enabled FROM medications ORDER BY name ASC'),
    db.getAllAsync<ClinicianReportAppointment>('SELECT title, provider, specialty, insurer, authorization_number, facility, scheduled_at, status, location, virtual_url, preparation_notes FROM appointments ORDER BY scheduled_at ASC LIMIT 100'),
    db.getAllAsync<ClinicianReportMeal>('SELECT meal_type, occurred_at, note FROM meal_events ORDER BY occurred_at DESC LIMIT 200'),
    db.getAllAsync<ClinicianReportMedicationOccurrence>('SELECT medications.name AS medication_name, medications.dose_text, medication_occurrences.scheduled_at, medication_occurrences.status, medication_occurrences.acted_at FROM medication_occurrences INNER JOIN medications ON medications.id = medication_occurrences.medication_id ORDER BY medication_occurrences.scheduled_at DESC LIMIT 300'),
    db.getAllAsync<ClinicianReportHelpEvent>('SELECT created_at, reason, contact_state FROM help_events ORDER BY created_at DESC LIMIT 100'),
    db.getAllAsync<{ occurred_at: string; reason: string | null; before_json: string; after_json: string }>('SELECT occurred_at, reason, before_json, after_json FROM glucose_audit_events ORDER BY occurred_at DESC LIMIT 200'),
  ]);
  const corrections: ClinicianReportCorrection[] = auditEvents.map((event) => {
    let before: Record<string, unknown> = {};
    let after: Record<string, unknown> = {};
    try { before = JSON.parse(event.before_json) as Record<string, unknown>; } catch { /* Keep malformed legacy rows readable. */ }
    try { after = JSON.parse(event.after_json) as Record<string, unknown>; } catch { /* Keep malformed legacy rows readable. */ }
    return {
      occurred_at: event.occurred_at,
      reason: event.reason,
      before_value: typeof before.value === 'number' ? before.value : null,
      before_unit: typeof before.unit === 'string' ? before.unit : null,
      after_value: typeof after.value === 'number' ? after.value : null,
      after_unit: typeof after.unit === 'string' ? after.unit : null,
    };
  });
  const html = buildClinicianReportHtml({ card, readings, medications, appointments, meals, medicationOccurrences, helpEvents, corrections });
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return { shared: true };
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: 'Compartir reporte de GlucoCare' });
    return { shared: true };
  }
  await Print.printAsync({ html });
  return { shared: false };
}

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

function jsonObjectArray(value: unknown, field: string): string {
  if (value === undefined || value === null) return '[]';
  if (typeof value !== 'string' || value.length > 32_000) throw new Error(`Invalid ${field}.`);
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => !isObject(item))) throw new Error('not an object array');
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
    glucoseAuditEvents: await rows(db, 'glucose_audit_events'),
    carePlan: await rows(db, 'care_plan'),
    medications: await rows(db, 'medications'),
    medicationOccurrences: await rows(db, 'medication_occurrences'),
    appointments: await rows(db, 'appointments'),
    emergencyCard: await rows(db, 'emergency_card'),
    trustedContacts: await rows(db, 'trusted_contacts'),
    helpEvents: await rows(db, 'help_events'),
    measurementPlan: await rows(db, 'measurement_plans'),
    measurementOccurrences: await rows(db, 'measurement_occurrences'),
    mealEvents: await rows(db, 'meal_events'),
    syncOutbox: await rows(db, 'sync_outbox'),
    syncMetadata: await rows(db, 'sync_metadata'),
    accessibilityPreferences: await rows(db, 'accessibility_preferences'),
    privacyConsent: await rows(db, 'privacy_consents'),
    syncConflicts: await rows(db, 'sync_conflicts'),
  };
  if (format === 'json') return { content: JSON.stringify(bundle, null, 2), filename: `glucocare-export-${Date.now()}.json`, mimeType: 'application/json' };

  const glucose = bundle.glucoseReadings;
  const header = ['recorded_at', 'timezone', 'utc_offset_minutes', 'time_edited', 'value', 'unit', 'value_mg_dl', 'conversion_version', 'context', 'symptoms', 'note'];
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
  await cancelAllScheduledReminders().catch(() => undefined);
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
    try { await cancelMedicationReminder(ids); } catch { /* Data deletion/restore must continue if the OS already removed a reminder. */ }
  }
  try { await cancelMeasurementPlanReminders(); } catch { /* Measurement reminders are identified by payload and are not stored in SQLite. */ }
}

async function clearLocalTables(db: SQLiteDatabase) {
  await db.runAsync('DELETE FROM measurement_occurrences');
  await db.runAsync('DELETE FROM medication_occurrences');
  await db.runAsync('DELETE FROM glucose_readings');
  await db.runAsync('DELETE FROM glucose_audit_events');
  await db.runAsync('DELETE FROM care_plan');
  await db.runAsync('DELETE FROM medications');
  await db.runAsync('DELETE FROM appointments');
  await db.runAsync('DELETE FROM emergency_card');
  await db.runAsync('DELETE FROM trusted_contacts');
  await db.runAsync('DELETE FROM help_events');
  await db.runAsync('DELETE FROM measurement_plans');
  await db.runAsync('DELETE FROM meal_events');
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
  const glucoseAuditEvents = rowsFrom(bundle, 'glucoseAuditEvents');
  const carePlan = rowsFrom(bundle, 'carePlan');
  const medications = rowsFrom(bundle, 'medications');
  const medicationOccurrences = rowsFrom(bundle, 'medicationOccurrences');
  const appointments = rowsFrom(bundle, 'appointments');
  const emergencyCard = rowsFrom(bundle, 'emergencyCard');
  const trustedContacts = rowsFrom(bundle, 'trustedContacts');
  const helpEvents = rowsFrom(bundle, 'helpEvents');
  const measurementPlan = rowsFrom(bundle, 'measurementPlan');
  const measurementOccurrences = rowsFrom(bundle, 'measurementOccurrences');
  const mealEvents = rowsFrom(bundle, 'mealEvents');
  const accessibilityPreferences = rowsFrom(bundle, 'accessibilityPreferences');

  await cancelStoredReminders(db);
  await db.withTransactionAsync(async () => {
    await clearLocalTables(db);

    for (const row of glucose) {
      const unit = enumValue(row, 'unit', ['mg/dL', 'mmol/L'] as const);
      const context = enumValue(row, 'context', ['fasting', 'before_meal', 'after_meal', 'bedtime', 'other'] as const);
      const source = enumValue(row, 'source', ['manual', 'import', 'cgm', 'glucometer'] as const, 'manual');
      const value = nullableNumber(row, 'value');
      if (value === null || value <= 0) throw new Error('Invalid value.');
      const mealOffsetMinutes = row.meal_offset_minutes === undefined || row.meal_offset_minutes === null || row.meal_offset_minutes === '' ? null : integer(row, 'meal_offset_minutes', 0, 1440);
      await db.runAsync(
        `INSERT INTO glucose_readings (id, value, unit, value_mg_dl, conversion_version, context, source, meal_offset_minutes, recorded_at, timezone, utc_offset_minutes, time_edited, symptoms, note, sync_state, risk_classification)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', ?)`,
        requiredString(row, 'id'), value, unit, toCanonicalMgDl(value, unit), conversionVersionForUnit(unit), context, source, mealOffsetMinutes,
        requiredString(row, 'recorded_at'), optionalString(row, 'timezone'), row.utc_offset_minutes === undefined || row.utc_offset_minutes === null || row.utc_offset_minutes === '' ? null : integer(row, 'utc_offset_minutes', -840, 840), booleanFlag(row, 'time_edited'), optionalString(row, 'symptoms'), optionalString(row, 'note'), optionalString(row, 'risk_classification'),
      );
    }

    for (const row of glucoseAuditEvents) {
      const beforeJson = requiredString(row, 'before_json');
      const afterJson = requiredString(row, 'after_json');
      JSON.parse(beforeJson);
      JSON.parse(afterJson);
      await db.runAsync(
        `INSERT INTO glucose_audit_events (id, reading_id, occurred_at, action, reason, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        requiredString(row, 'id'), requiredString(row, 'reading_id'), requiredString(row, 'occurred_at'), requiredString(row, 'action'), optionalString(row, 'reason'), beforeJson, afterJson,
      );
    }

    for (const row of carePlan) {
      await db.runAsync(
        `INSERT INTO care_plan (id, low_threshold, urgent_low_threshold, high_threshold, urgent_high_threshold, instructions, source, effective_from, effective_to, clinician_verified, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        requiredString(row, 'id'), nullableNumber(row, 'low_threshold'), nullableNumber(row, 'urgent_low_threshold'), nullableNumber(row, 'high_threshold'), nullableNumber(row, 'urgent_high_threshold'), optionalString(row, 'instructions'), optionalString(row, 'source'), optionalString(row, 'effective_from'), optionalString(row, 'effective_to'), booleanFlag(row, 'clinician_verified'), requiredString(row, 'updated_at'),
      );
    }

    for (const row of medications) {
      const hour = integer(row, 'hour', 0, 23);
      const minute = integer(row, 'minute', 0, 59);
      const route = enumValue(row, 'route', ['oral', 'injection', 'inhaled', 'topical', 'other'] as const);
      const reminderState = enumValue(row, 'reminder_state', ['scheduled', 'scheduled_limited', 'permission_denied', 'unavailable'] as const, 'unavailable');
      await db.runAsync(
        `INSERT INTO medications (id, name, dose_text, route, prescriber_name, instructions, start_date, end_date, hour, minute, times_json, enabled, notification_id, notification_ids_json, reminder_state, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]', ?, ?)`,
        requiredString(row, 'id'), requiredString(row, 'name'), requiredString(row, 'dose_text'), route, optionalString(row, 'prescriber_name'), optionalString(row, 'instructions'), optionalString(row, 'start_date'), optionalString(row, 'end_date'), hour, minute,
        jsonArray(row.times_json, 'times_json'), booleanFlag(row, 'enabled', true), reminderState === 'scheduled' || reminderState === 'scheduled_limited' ? 'unavailable' : reminderState, requiredString(row, 'created_at'),
      );
    }

    for (const row of appointments) {
      const status = enumValue(row, 'status', ['requested', 'pending_authorization', 'authorized', 'scheduled', 'completed', 'missed', 'denied', 'cancelled'] as const);
      await db.runAsync(
        `INSERT INTO appointments (id, title, provider, specialty, insurer, authorization_number, facility, scheduled_at, requested_at, status, location, virtual_url, preparation_notes, notes, reminder_state, notification_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unavailable', NULL, ?)`,
        requiredString(row, 'id'), requiredString(row, 'title'), requiredString(row, 'provider'), optionalString(row, 'specialty'), optionalString(row, 'insurer'), optionalString(row, 'authorization_number'), optionalString(row, 'facility'), requiredString(row, 'scheduled_at'), optionalString(row, 'requested_at'), status, optionalString(row, 'location'), optionalString(row, 'virtual_url'), optionalString(row, 'preparation_notes'), optionalString(row, 'notes'), requiredString(row, 'created_at'),
      );
    }

    for (const row of emergencyCard) {
      await db.runAsync(
        `INSERT INTO emergency_card (id, full_name, birth_date, diabetes_type, diagnosis_year, insulin_use, allergies, critical_conditions, care_provider, care_facility, insurer, policy_number, emergency_number, emergency_region, emergency_notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        requiredString(row, 'id'), requiredString(row, 'full_name'), optionalString(row, 'birth_date'), optionalString(row, 'diabetes_type'), optionalString(row, 'diagnosis_year'), row.insulin_use === undefined || row.insulin_use === null || row.insulin_use === '' ? null : enumValue(row, 'insulin_use', ['yes', 'no', 'unknown'] as const), optionalString(row, 'allergies'), optionalString(row, 'critical_conditions'), optionalString(row, 'care_provider'), optionalString(row, 'care_facility'), optionalString(row, 'insurer'), optionalString(row, 'policy_number'), optionalString(row, 'emergency_number'), optionalString(row, 'emergency_region'), optionalString(row, 'emergency_notes'), requiredString(row, 'updated_at'),
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
        `INSERT INTO measurement_plans (id, readings_per_day, times_json, timings_json, windows_json, weekdays_json, effective_from, effective_to, instructions, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        requiredString(row, 'id'), integer(row, 'readings_per_day', 1, 3), jsonArray(row.times_json, 'times_json'), jsonArray(row.timings_json, 'timings_json'), jsonObjectArray(row.windows_json, 'windows_json'), jsonArray(row.weekdays_json, 'weekdays_json'), optionalString(row, 'effective_from'), optionalString(row, 'effective_to'), optionalString(row, 'instructions'), requiredString(row, 'updated_at'),
      );
    }

    for (const row of medicationOccurrences) {
      const status = enumValue(row, 'status', ['planned', 'due', 'taken', 'skipped', 'snoozed', 'expired', 'not_recorded'] as const);
      await db.runAsync(
        `INSERT INTO medication_occurrences (id, medication_id, scheduled_at, status, acted_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        requiredString(row, 'id'), requiredString(row, 'medication_id'), requiredString(row, 'scheduled_at'), status, optionalString(row, 'acted_at'), requiredString(row, 'created_at'),
      );
    }

    for (const row of mealEvents) {
      const mealType = enumValue(row, 'meal_type', ['breakfast', 'lunch', 'dinner', 'snack'] as const);
      await db.runAsync(
        `INSERT INTO meal_events (id, meal_type, occurred_at, note, created_at, sync_state) VALUES (?, ?, ?, ?, ?, 'local')`,
        requiredString(row, 'id'), mealType, requiredString(row, 'occurred_at'), optionalString(row, 'note'), requiredString(row, 'created_at'),
      );
    }

    for (const row of measurementOccurrences) {
      const status = enumValue(row, 'status', ['planned', 'due', 'completed', 'skipped', 'expired'] as const);
      await db.runAsync(
        `INSERT INTO measurement_occurrences (id, plan_id, scheduled_at, window_index, meal_event_id, status, completed_reading_id, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        requiredString(row, 'id'), requiredString(row, 'plan_id'), requiredString(row, 'scheduled_at'), row.window_index === undefined || row.window_index === null ? null : integer(row, 'window_index', 0, 32), optionalString(row, 'meal_event_id'), status, optionalString(row, 'completed_reading_id'), optionalString(row, 'completed_at'), requiredString(row, 'created_at'),
      );
    }

    for (const row of accessibilityPreferences) {
      const glucoseUnit = enumValue(row, 'glucose_unit', ['mg/dL', 'mmol/L'] as const, 'mg/dL');
      await db.runAsync(
        `INSERT INTO accessibility_preferences (id, simple_mode, large_text, high_contrast, reduce_motion, notification_sound, notification_vibration, app_lock_enabled, onboarding_completed, glucose_unit, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        requiredString(row, 'id'), booleanFlag(row, 'simple_mode'), booleanFlag(row, 'large_text'), booleanFlag(row, 'high_contrast'), booleanFlag(row, 'reduce_motion'), booleanFlag(row, 'notification_sound', true), booleanFlag(row, 'notification_vibration', true), booleanFlag(row, 'app_lock_enabled'), booleanFlag(row, 'onboarding_completed'), glucoseUnit, requiredString(row, 'updated_at'),
      );
    }
  });
  return { imported: glucose.length + carePlan.length + medications.length + appointments.length + emergencyCard.length + trustedContacts.length + helpEvents.length + measurementPlan.length + medicationOccurrences.length + measurementOccurrences.length + mealEvents.length, contactsRequireConsent: trustedContacts.length > 0 };
}

export async function deleteAllLocalData(db: SQLiteDatabase) {
  await cancelStoredReminders(db);
  await db.withTransactionAsync(async () => {
    await clearLocalTables(db);
  });
}
