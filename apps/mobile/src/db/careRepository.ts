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
  hour: number;
  minute: number;
  enabled: number;
  notification_id: string | null;
  reminder_state: ReminderState;
  created_at: string;
};

function mapRow(row: MedicationRow): Medication {
  return {
    id: row.id,
    name: row.name,
    doseText: row.dose_text,
    route: row.route,
    hour: row.hour,
    minute: row.minute,
    enabled: row.enabled === 1,
    notificationId: row.notification_id ?? undefined,
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
      `INSERT INTO medications (id, name, dose_text, route, hour, minute, enabled, notification_id, reminder_state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      medication.id, medication.name, medication.doseText, medication.route, medication.hour, medication.minute,
      medication.enabled ? 1 : 0, medication.notificationId ?? null, medication.reminderState, medication.createdAt,
    );
    await enqueueOutbox(db, { id: newId(), entityType: 'medication', entityId: medication.id, eventType: 'medication.created.v1', payload: medication });
  });
}

export async function updateMedicationReminder(db: SQLiteDatabase, medicationId: string, reminderState: ReminderState, notificationId?: string) {
  await db.runAsync('UPDATE medications SET reminder_state = ?, notification_id = ? WHERE id = ?', reminderState, notificationId ?? null, medicationId);
}
