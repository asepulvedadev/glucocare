import type { SQLiteDatabase } from 'expo-sqlite';
import type { Appointment, AppointmentReminderState, AppointmentStatus } from '../types/appointments';
import { enqueueOutbox } from './outboxRepository';
import { newId } from '../ids';
import { transitionAppointment } from '../domain/appointmentState';

type AppointmentRow = {
  id: string;
  title: string;
  provider: string;
  scheduled_at: string;
  status: AppointmentStatus;
  location: string | null;
  notes: string | null;
  reminder_state: AppointmentReminderState;
  notification_id: string | null;
  created_at: string;
};

function mapRow(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    title: row.title,
    provider: row.provider,
    scheduledAt: row.scheduled_at,
    status: row.status,
    location: row.location ?? undefined,
    notes: row.notes ?? undefined,
    reminderState: row.reminder_state,
    notificationId: row.notification_id ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listAppointments(db: SQLiteDatabase): Promise<Appointment[]> {
  const rows = await db.getAllAsync<AppointmentRow>('SELECT * FROM appointments ORDER BY scheduled_at ASC');
  return rows.map(mapRow);
}

export async function insertAppointment(db: SQLiteDatabase, appointment: Appointment) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO appointments (id, title, provider, scheduled_at, status, location, notes, reminder_state, notification_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      appointment.id, appointment.title, appointment.provider, appointment.scheduledAt, appointment.status,
      appointment.location ?? null, appointment.notes ?? null, appointment.reminderState, appointment.notificationId ?? null, appointment.createdAt,
    );
    await enqueueOutbox(db, { id: newId(), entityType: 'appointment', entityId: appointment.id, eventType: 'appointment.created.v1', payload: appointment });
  });
}

export async function updateAppointmentStatus(db: SQLiteDatabase, appointmentId: string, status: AppointmentStatus) {
  const row = await db.getFirstAsync<AppointmentRow>('SELECT * FROM appointments WHERE id = ?', appointmentId);
  if (!row) throw new Error('Appointment not found.');
  const current = mapRow(row);
  transitionAppointment(current.status, status);
  const updated = { ...current, status };
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE appointments SET status = ? WHERE id = ?', status, appointmentId);
    await enqueueOutbox(db, { id: newId(), entityType: 'appointment', entityId: appointmentId, eventType: `appointment.${status}.v1`, payload: updated });
  });
  return updated;
}
