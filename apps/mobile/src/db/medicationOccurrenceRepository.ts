import type { SQLiteDatabase } from 'expo-sqlite';
import { newId } from '../ids';
import type { Medication } from '../types/care';
import type { MealEvent } from '../types/meals';
import type { MedicationOccurrence, MedicationOccurrenceStatus } from '../types/medicationOccurrences';
import { transitionMedicationOccurrence } from '../domain/medicationOccurrenceState';
import { isMedicationActive } from '../domain/medication';
import { enqueueOutbox } from './outboxRepository';
import { medicationOccurrenceDatesForDay } from '../domain/medicationReminder';

type MedicationOccurrenceRow = {
  id: string;
  medication_id: string;
  scheduled_at: string;
  status: MedicationOccurrenceStatus;
  acted_at: string | null;
  created_at: string;
};

export type MedicationHistoryItem = MedicationOccurrence & {
  medicationName: string;
  doseText: string;
};

type MedicationHistoryRow = MedicationOccurrenceRow & {
  medication_name: string;
  dose_text: string;
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

export async function ensureTodaysMedicationOccurrences(db: SQLiteDatabase, medications: Medication[], meals: MealEvent[] = [], now = new Date()) {
  const createdAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    const staleRows = await db.getAllAsync<MedicationOccurrenceRow>(
      `SELECT * FROM medication_occurrences WHERE status IN ('planned', 'due', 'snoozed') AND scheduled_at < ?`,
      startOfLocalDay(now).toISOString(),
    );
    for (const row of staleRows) {
      const current = mapRow(row);
      const next = { ...current, status: 'expired' as const, actedAt: now.toISOString() };
      transitionMedicationOccurrence(current.status, next.status);
      await db.runAsync('UPDATE medication_occurrences SET status = ?, acted_at = ? WHERE id = ?', 'expired', next.actedAt, row.id);
      await enqueueOutbox(db, { id: newId(), entityType: 'medication_occurrence', entityId: row.id, eventType: 'medication_occurrence.expired.v1', payload: next });
    }
    for (const medication of medications) {
      const times = medicationOccurrenceDatesForDay(medication, meals, now).map((date) => date.toISOString());
      if (!isMedicationActive(medication, now)) {
        const inactiveRows = await db.getAllAsync<MedicationOccurrenceRow>(
          `SELECT * FROM medication_occurrences
           WHERE medication_id = ? AND scheduled_at >= ? AND scheduled_at < ?
           AND status IN ('planned', 'due', 'snoozed')`,
          medication.id,
          startOfLocalDay(now).toISOString(),
          new Date(startOfLocalDay(now).getTime() + 24 * 60 * 60 * 1000).toISOString(),
        );
        for (const row of inactiveRows) {
          const current = mapRow(row);
          const next = { ...current, status: 'expired' as const, actedAt: now.toISOString() };
          transitionMedicationOccurrence(current.status, next.status);
          await db.runAsync('UPDATE medication_occurrences SET status = ?, acted_at = ? WHERE id = ?', 'expired', next.actedAt, row.id);
          await enqueueOutbox(db, { id: newId(), entityType: 'medication_occurrence', entityId: row.id, eventType: 'medication_occurrence.expired.v1', payload: next });
        }
        continue;
      }
      for (const scheduledAt of times) {
        const status = new Date(scheduledAt).getTime() <= now.getTime() ? 'due' : 'planned';
        await db.runAsync(
          `INSERT OR IGNORE INTO medication_occurrences (id, medication_id, scheduled_at, status, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          newId(), medication.id, scheduledAt, status, createdAt,
        );
      }
    }
  });
}

export async function listTodaysMedicationOccurrences(db: SQLiteDatabase, now = new Date()): Promise<MedicationOccurrence[]> {
  const start = startOfLocalDay(now).toISOString();
  const end = new Date(startOfLocalDay(now).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const plannedRows = await db.getAllAsync<MedicationOccurrenceRow>(
    `SELECT * FROM medication_occurrences WHERE status = 'planned' AND scheduled_at <= ? AND scheduled_at >= ? AND scheduled_at < ?`,
    now.toISOString(), start, end,
  );
  if (plannedRows.length > 0) {
    await db.withTransactionAsync(async () => {
      for (const row of plannedRows) {
        const current = mapRow(row);
        const next = { ...current, status: 'due' as const };
        transitionMedicationOccurrence(current.status, next.status);
        await db.runAsync("UPDATE medication_occurrences SET status = 'due' WHERE id = ?", row.id);
        await enqueueOutbox(db, { id: newId(), entityType: 'medication_occurrence', entityId: row.id, eventType: 'medication_occurrence.due.v1', payload: next });
      }
    });
  }
  const rows = await db.getAllAsync<MedicationOccurrenceRow>(
    `SELECT * FROM medication_occurrences WHERE scheduled_at >= ? AND scheduled_at < ? ORDER BY scheduled_at ASC`,
    start, end,
  );
  return rows.map(mapRow);
}

export async function listMedicationHistory(db: SQLiteDatabase, limit = 30): Promise<MedicationHistoryItem[]> {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 100));
  const rows = await db.getAllAsync<MedicationHistoryRow>(
    `SELECT mo.*, m.name AS medication_name, m.dose_text
     FROM medication_occurrences mo
     INNER JOIN medications m ON m.id = mo.medication_id
     ORDER BY mo.scheduled_at DESC LIMIT ${safeLimit}`,
  );
  return rows.map((row) => ({ ...mapRow(row), medicationName: row.medication_name, doseText: row.dose_text }));
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
