import type { SQLiteDatabase } from 'expo-sqlite';
import { newId } from '../ids';
import type { Medication } from '../types/care';
import type { MedicationOccurrence, MedicationOccurrenceStatus } from '../types/medicationOccurrences';
import { transitionMedicationOccurrence } from '../domain/medicationOccurrenceState';
import { enqueueOutbox } from './outboxRepository';

type MedicationOccurrenceRow = {
  id: string;
  medication_id: string;
  scheduled_at: string;
  status: MedicationOccurrenceStatus;
  acted_at: string | null;
  created_at: string;
};

function mapRow(row: MedicationOccurrenceRow): MedicationOccurrence {
  return {
    id: row.id,
    medicationId: row.medication_id,
    scheduledAt: row.scheduled_at,
    status: row.status,
    actedAt: row.acted_at ?? undefined,
    createdAt: row.created_at,
  };
}

function startOfLocalDay(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function occurrenceTimesForToday(medication: Medication, now: Date) {
  const times = medication.times?.length ? medication.times : [`${String(medication.hour).padStart(2, '0')}:${String(medication.minute).padStart(2, '0')}`];
  return times.map((time) => {
    const [hour, minute] = time.split(':').map(Number);
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute).toISOString();
  });
}

export async function ensureTodaysMedicationOccurrences(db: SQLiteDatabase, medications: Medication[], now = new Date()) {
  const createdAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const medication of medications.filter((item) => item.enabled)) {
      for (const scheduledAt of occurrenceTimesForToday(medication, now)) {
        await db.runAsync(
          `INSERT OR IGNORE INTO medication_occurrences (id, medication_id, scheduled_at, status, created_at)
           VALUES (?, ?, ?, 'due', ?)`,
          newId(), medication.id, scheduledAt, createdAt,
        );
      }
    }
  });
}

export async function listTodaysMedicationOccurrences(db: SQLiteDatabase, now = new Date()): Promise<MedicationOccurrence[]> {
  const start = startOfLocalDay(now).toISOString();
  const end = new Date(startOfLocalDay(now).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const rows = await db.getAllAsync<MedicationOccurrenceRow>(
    `SELECT * FROM medication_occurrences WHERE scheduled_at >= ? AND scheduled_at < ? ORDER BY scheduled_at ASC`,
    start, end,
  );
  return rows.map(mapRow);
}

export async function recordMedicationOccurrence(db: SQLiteDatabase, occurrenceId: string, status: MedicationOccurrenceStatus) {
  const actedAt = status === 'due' ? null : new Date().toISOString();
  const row = await db.getFirstAsync<MedicationOccurrenceRow>('SELECT * FROM medication_occurrences WHERE id = ?', occurrenceId);
  if (!row) throw new Error('Medication occurrence not found.');
  const current = mapRow(row);
  if (current.status !== status) transitionMedicationOccurrence(current.status, status);
  const next = { ...current, status, actedAt: actedAt ?? undefined };
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE medication_occurrences SET status = ?, acted_at = ? WHERE id = ?', status, actedAt, occurrenceId);
    await enqueueOutbox(db, {
      id: newId(),
      entityType: 'medication_occurrence',
      entityId: occurrenceId,
      eventType: `medication_occurrence.${status}.v1`,
      payload: next,
    });
  });
  return next;
}
