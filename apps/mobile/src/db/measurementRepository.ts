import type { SQLiteDatabase } from 'expo-sqlite';
import type { MeasurementPlan } from '../types/measurement';
import { enqueueOutbox } from './outboxRepository';
import { newId } from '../ids';

type PlanRow = { id: 'default'; readings_per_day: number; times_json: string; instructions: string | null; updated_at: string };

export async function getMeasurementPlan(db: SQLiteDatabase): Promise<MeasurementPlan | null> {
  const row = await db.getFirstAsync<PlanRow>('SELECT * FROM measurement_plans WHERE id = ?', 'default');
  if (!row) return null;
  return { id: 'default', readingsPerDay: row.readings_per_day as 1 | 2 | 3, times: JSON.parse(row.times_json) as string[], instructions: row.instructions ?? undefined, updatedAt: row.updated_at };
}

export async function upsertMeasurementPlan(db: SQLiteDatabase, plan: MeasurementPlan) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(`INSERT INTO measurement_plans (id, readings_per_day, times_json, instructions, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET readings_per_day = excluded.readings_per_day, times_json = excluded.times_json, instructions = excluded.instructions, updated_at = excluded.updated_at`, plan.id, plan.readingsPerDay, JSON.stringify(plan.times), plan.instructions ?? null, plan.updatedAt);
    await enqueueOutbox(db, { id: newId(), entityType: 'measurement_plan', entityId: plan.id, eventType: 'measurement_plan.revision_saved.v1', payload: plan });
  });
}
