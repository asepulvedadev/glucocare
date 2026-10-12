import type { SQLiteDatabase } from 'expo-sqlite';
import type { MeasurementPlan, MeasurementTiming } from '../types/measurement';
import { enqueueOutbox } from './outboxRepository';
import { newId } from '../ids';

type PlanRow = { id: 'default'; readings_per_day: number; times_json: string; timings_json: string | null; instructions: string | null; updated_at: string };

const validTimings: MeasurementTiming[] = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'other'];

function parseTimings(value: string | null, count: number): MeasurementTiming[] {
  try {
    const parsed: unknown = value ? JSON.parse(value) : [];
    if (!Array.isArray(parsed)) return Array.from({ length: count }, () => 'other');
    return Array.from({ length: count }, (_, index) => validTimings.includes(parsed[index] as MeasurementTiming) ? parsed[index] as MeasurementTiming : 'other');
  } catch {
    return Array.from({ length: count }, () => 'other');
  }
}

export async function getMeasurementPlan(db: SQLiteDatabase): Promise<MeasurementPlan | null> {
  const row = await db.getFirstAsync<PlanRow>('SELECT * FROM measurement_plans WHERE id = ?', 'default');
  if (!row) return null;
  const readingsPerDay = row.readings_per_day as 1 | 2 | 3;
  return { id: 'default', readingsPerDay, times: JSON.parse(row.times_json) as string[], timings: parseTimings(row.timings_json, readingsPerDay), instructions: row.instructions ?? undefined, updatedAt: row.updated_at };
}

export async function upsertMeasurementPlan(db: SQLiteDatabase, plan: MeasurementPlan) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(`INSERT INTO measurement_plans (id, readings_per_day, times_json, timings_json, instructions, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET readings_per_day = excluded.readings_per_day, times_json = excluded.times_json, timings_json = excluded.timings_json, instructions = excluded.instructions, updated_at = excluded.updated_at`, plan.id, plan.readingsPerDay, JSON.stringify(plan.times), JSON.stringify(plan.timings ?? Array.from({ length: plan.readingsPerDay }, () => 'other')), plan.instructions ?? null, plan.updatedAt);
    await enqueueOutbox(db, { id: newId(), entityType: 'measurement_plan', entityId: plan.id, eventType: 'measurement_plan.revision_saved.v1', payload: plan });
  });
}
