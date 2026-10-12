import type { SQLiteDatabase } from 'expo-sqlite';
import type { Medication, MedicationRoute, ReminderState } from '../types/care';
import { enqueueOutbox } from './outboxRepository';
import { newId } from '../ids';

export type StoredMedication = Medication;

type MedicationRow = {
  id: string;
  name: string;
  dose_text: string;
  route: MedicationRoute;
  prescriber_name: string | null;
  instructions: string | null;
  start_date: string | null;
  end_date: string | null;
  hour: number;
  minute: number;
  times_json: string | null;
  enabled: number;
  notification_id: string | null;
  notification_ids_json: string | null;
  reminder_state: ReminderState;
  created_at: string;
};

function parseTimes(value: string | null, hour: number, minute: number) {
  try {
    const parsed: unknown = value ? JSON.parse(value) : [];
    const times = Array.isArray(parsed) ? parsed.filter((item): item is string => {
      if (typeof item !== 'string' || !/^\d{2}:\d{2}$/.test(item)) return false;
      const [parsedHour, parsedMinute] = item.split(':').map(Number);
      return parsedHour >= 0 && parsedHour <= 23 && parsedMinute >= 0 && parsedMinute <= 59;
    }) : [];
    return times.length ? times : [`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`];
  } catch {
    return [`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`];
  }
}

function parseNotificationIds(value: string | null, notificationId: string | null) {
  try {
    const parsed: unknown = value ? JSON.parse(value) : [];
    const ids = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    return ids.length ? ids : notificationId ? [notificationId] : [];
  } catch {
    return notificationId ? [notificationId] : [];
  }
}

function mapRow(row: MedicationRow): Medication {
  return {
    id: row.id,
    name: row.name,
    doseText: row.dose_text,
    route: row.route,
    prescriberName: row.prescriber_name ?? undefined,
    instructions: row.instructions ?? undefined,
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    hour: row.hour,
    minute: row.minute,
    times: parseTimes(row.times_json, row.hour, row.minute),
    enabled: row.enabled === 1,
    notificationId: row.notification_id ?? undefined,
    notificationIds: parseNotificationIds(row.notification_ids_json, row.notification_id),
    reminderState: row.reminder_state,
    createdAt: row.created_at,
  };
}

export async function listMedications(db: SQLiteDatabase): Promise<Medication[]> {
  const rows = await db.getAllAsync<MedicationRow>('SELECT * FROM medications ORDER BY hour ASC, minute ASC, name ASC');
  return rows.map(mapRow);
}

export async function insertMedication(db: SQLiteDatabase, medication: Medication) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO medications (id, name, dose_text, route, prescriber_name, instructions, start_date, end_date, hour, minute, times_json, enabled, notification_id, notification_ids_json, reminder_state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      medication.id, medication.name, medication.doseText, medication.route, medication.prescriberName ?? null, medication.instructions ?? null, medication.startDate ?? null, medication.endDate ?? null, medication.hour, medication.minute,
      JSON.stringify(medication.times ?? [`${String(medication.hour).padStart(2, '0')}:${String(medication.minute).padStart(2, '0')}`]),
      medication.enabled ? 1 : 0, medication.notificationId ?? null, JSON.stringify(medication.notificationIds ?? (medication.notificationId ? [medication.notificationId] : [])), medication.reminderState, medication.createdAt,
    );
    await enqueueOutbox(db, { id: newId(), entityType: 'medication', entityId: medication.id, eventType: 'medication.created.v1', payload: medication });
  });
}

export async function updateMedicationReminder(db: SQLiteDatabase, medicationId: string, reminderState: ReminderState, notificationId?: string, notificationIds?: string[]) {
  await db.runAsync('UPDATE medications SET reminder_state = ?, notification_id = ?, notification_ids_json = ? WHERE id = ?', reminderState, notificationId ?? null, JSON.stringify(notificationIds ?? (notificationId ? [notificationId] : [])), medicationId);
}
