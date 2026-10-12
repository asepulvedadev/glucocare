import type { SQLiteDatabase } from 'expo-sqlite';
import type { Appointment, AppointmentReminderState, AppointmentStatus } from '../types/appointments';
import { enqueueOutbox } from './outboxRepository';
import { newId } from '../ids';
import { isTerminalAppointmentStatus, transitionAppointment } from '../domain/appointmentState';

type AppointmentRow = {
  id: string;
  title: string;
  provider: string;
  specialty: string | null;
  insurer: string | null;
  authorization_number: string | null;
  facility: string | null;
  scheduled_at: string;
  requested_at: string | null;
  status: AppointmentStatus;
  location: string | null;
  virtual_url: string | null;
  preparation_notes: string | null;
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
    specialty: row.specialty ?? undefined,
    insurer: row.insurer ?? undefined,
    authorizationNumber: row.authorization_number ?? undefined,
    facility: row.facility ?? undefined,
    scheduledAt: row.scheduled_at,
    requestedAt: row.requested_at ?? undefined,
    status: row.status,
    location: row.location ?? undefined,
    virtualUrl: row.virtual_url ?? undefined,
    preparationNotes: row.preparation_notes ?? undefined,
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
      `INSERT INTO appointments (id, title, provider, specialty, insurer, authorization_number, facility, scheduled_at, requested_at, status, location, virtual_url, preparation_notes, notes, reminder_state, notification_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      appointment.id, appointment.title, appointment.provider, appointment.specialty ?? null, appointment.insurer ?? null, appointment.authorizationNumber ?? null, appointment.facility ?? null, appointment.scheduledAt, appointment.requestedAt ?? appointment.createdAt, appointment.status,
      appointment.location ?? null, appointment.virtualUrl ?? null, appointment.preparationNotes ?? null, appointment.notes ?? null, appointment.reminderState, appointment.notificationId ?? null, appointment.createdAt,
    );
    await enqueueOutbox(db, { id: newId(), entityType: 'appointment', entityId: appointment.id, eventType: 'appointment.created.v1', payload: appointment });
  });
}

export async function updateAppointment(db: SQLiteDatabase, appointment: Appointment) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE appointments SET title = ?, provider = ?, specialty = ?, insurer = ?, authorization_number = ?, facility = ?, scheduled_at = ?, requested_at = ?, status = ?, location = ?, virtual_url = ?, preparation_notes = ?, notes = ?, reminder_state = ?, notification_id = ? WHERE id = ?`,
      appointment.title,
      appointment.provider,
      appointment.specialty ?? null,
      appointment.insurer ?? null,
      appointment.authorizationNumber ?? null,
      appointment.facility ?? null,
      appointment.scheduledAt,
      appointment.requestedAt ?? appointment.createdAt,
      appointment.status,
      appointment.location ?? null,
      appointment.virtualUrl ?? null,
      appointment.preparationNotes ?? null,
      appointment.notes ?? null,
      appointment.reminderState,
      appointment.notificationId ?? null,
      appointment.id,
    );
    await enqueueOutbox(db, { id: newId(), entityType: 'appointment', entityId: appointment.id, eventType: 'appointment.updated.v1', payload: appointment });
  });
}

export async function updateAppointmentStatus(db: SQLiteDatabase, appointmentId: string, status: AppointmentStatus) {
  const row = await db.getFirstAsync<AppointmentRow>('SELECT * FROM appointments WHERE id = ?', appointmentId);
  if (!row) throw new Error('Appointment not found.');
  const current = mapRow(row);
  transitionAppointment(current.status, status);
  const terminal = isTerminalAppointmentStatus(status);
  const updated = { ...current, status, reminderState: terminal ? 'unavailable' as const : current.reminderState };
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE appointments SET status = ?, reminder_state = ? WHERE id = ?', status, updated.reminderState, appointmentId);
    await enqueueOutbox(db, { id: newId(), entityType: 'appointment', entityId: appointmentId, eventType: `appointment.${status}.v1`, payload: updated });
  });
  return updated;
}

export async function updateAppointmentReminder(db: SQLiteDatabase, appointmentId: string, reminderState: AppointmentReminderState, notificationId?: string) {
  await db.runAsync('UPDATE appointments SET reminder_state = ?, notification_id = ? WHERE id = ?', reminderState, notificationId ?? null, appointmentId);
}
