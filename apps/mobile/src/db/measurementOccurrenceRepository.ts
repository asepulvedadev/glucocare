import type { SQLiteDatabase } from 'expo-sqlite';
import { newId } from '../ids';
import { transitionMeasurementOccurrence } from '../domain/measurementOccurrenceState';
import type { MeasurementPlan } from '../types/measurement';
import type { MeasurementOccurrence, MeasurementOccurrenceStatus } from '../types/measurementOccurrences';
import { enqueueOutbox } from './outboxRepository';

type MeasurementOccurrenceRow = {
  id: string;
  plan_id: 'default';
  scheduled_at: string;
  status: MeasurementOccurrenceStatus;
  completed_reading_id: string | null;
  completed_at: string | null;
  created_at: string;
};

function mapRow(row: MeasurementOccurrenceRow): MeasurementOccurrence {
  return {
    id: row.id,
    planId: row.plan_id,
    scheduledAt: row.scheduled_at,
    status: row.status,
    completedReadingId: row.completed_reading_id ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
  };
}

function startOfLocalDay(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function scheduledAtForTime(time: string, now: Date) {
  const [hour, minute] = time.split(':').map(Number);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute).toISOString();
}

export async function ensureTodaysMeasurementOccurrences(db: SQLiteDatabase, plan: MeasurementPlan | null, now = new Date()) {
  if (!plan) return;
  const createdAt = new Date().toISOString();
  const start = startOfLocalDay(now).toISOString();
  const end = new Date(startOfLocalDay(now).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const schedule = plan.times.map((time) => scheduledAtForTime(time, now));
  await db.withTransactionAsync(async () => {
    if (schedule.length > 0) {
      const placeholders = schedule.map(() => '?').join(', ');
      await db.runAsync(
        `DELETE FROM measurement_occurrences WHERE plan_id = ? AND scheduled_at >= ? AND scheduled_at < ?
         AND status IN ('planned', 'due') AND scheduled_at NOT IN (${placeholders})`,
        plan.id, start, end, ...schedule,
      );
    }
    for (const scheduledAt of schedule) {
      await db.runAsync(
        `INSERT OR IGNORE INTO measurement_occurrences (id, plan_id, scheduled_at, status, created_at)
         VALUES (?, ?, ?, 'planned', ?)`,
        newId(), plan.id, scheduledAt, createdAt,
      );
    }
  });
}

export async function listTodaysMeasurementOccurrences(db: SQLiteDatabase, now = new Date()): Promise<MeasurementOccurrence[]> {
  const start = startOfLocalDay(now).toISOString();
  const end = new Date(startOfLocalDay(now).getTime() + 24 * 60 * 60 * 1000).toISOString();
  await db.runAsync("UPDATE measurement_occurrences SET status = 'due' WHERE status = 'planned' AND scheduled_at <= ? AND scheduled_at >= ? AND scheduled_at < ?", now.toISOString(), start, end);
  const rows = await db.getAllAsync<MeasurementOccurrenceRow>(
    `SELECT * FROM measurement_occurrences WHERE scheduled_at >= ? AND scheduled_at < ? ORDER BY scheduled_at ASC`,
    start, end,
  );
  return rows.map(mapRow);
}

export async function recordMeasurementOccurrence(db: SQLiteDatabase, occurrenceId: string, status: MeasurementOccurrenceStatus) {
  const row = await db.getFirstAsync<MeasurementOccurrenceRow>('SELECT * FROM measurement_occurrences WHERE id = ?', occurrenceId);
  if (!row) throw new Error('Measurement occurrence not found.');
  const current = mapRow(row);
  if (current.status !== status) transitionMeasurementOccurrence(current.status, status);
  const next = { ...current, status, completedAt: status === 'completed' ? new Date().toISOString() : current.completedAt };
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE measurement_occurrences SET status = ?, completed_at = ? WHERE id = ?', next.status, next.completedAt ?? null, occurrenceId);
    await enqueueOutbox(db, { id: newId(), entityType: 'measurement_occurrence', entityId: occurrenceId, eventType: `measurement_occurrence.${status}.v1`, payload: next });
  });
  return next;
}

export async function completeNearestMeasurementOccurrence(db: SQLiteDatabase, readingId: string, recordedAt: string) {
  const readingTime = new Date(recordedAt).getTime();
  if (!Number.isFinite(readingTime)) return;
  const readingDate = new Date(recordedAt);
  const start = startOfLocalDay(readingDate).toISOString();
  const end = new Date(startOfLocalDay(readingDate).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const occurrence = await db.getFirstAsync<MeasurementOccurrenceRow>(
    `SELECT * FROM measurement_occurrences WHERE status IN ('planned', 'due')
     AND scheduled_at >= ? AND scheduled_at < ?
     ORDER BY ABS(julianday(scheduled_at) - julianday(?)) ASC LIMIT 1`,
    start, end, recordedAt,
  );
  if (!occurrence) return;
  const distance = Math.abs(new Date(occurrence.scheduled_at).getTime() - readingTime);
  if (!Number.isFinite(distance) || distance > 3 * 60 * 60 * 1000) return;
  const current = mapRow(occurrence);
  const next = { ...current, status: 'completed' as const, completedReadingId: readingId, completedAt: new Date().toISOString() };
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE measurement_occurrences SET status = ?, completed_reading_id = ?, completed_at = ? WHERE id = ?', 'completed', readingId, next.completedAt, occurrence.id);
    await enqueueOutbox(db, { id: newId(), entityType: 'measurement_occurrence', entityId: occurrence.id, eventType: 'measurement_occurrence.completed.v1', payload: next });
  });
}
