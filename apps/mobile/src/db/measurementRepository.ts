import type { SQLiteDatabase } from 'expo-sqlite';
import type { MeasurementPlan, MeasurementReadingsPerDay, MeasurementTiming, MeasurementWindow } from '../types/measurement';
import { enqueueOutbox } from './outboxRepository';
import { newId } from '../ids';
import { insertChangeAuditEvent } from './changeAuditRepository';

type PlanRow = { id: 'default'; readings_per_day: number; times_json: string; timings_json: string | null; windows_json: string | null; weekdays_json: string | null; effective_from: string | null; effective_to: string | null; instructions: string | null; updated_at: string };

const validTimings: MeasurementTiming[] = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'other'];
const defaultWeekdays = [1, 2, 3, 4, 5, 6, 7];

function parseTimings(value: string | null, count: number): MeasurementTiming[] {
  try {
    const parsed: unknown = value ? JSON.parse(value) : [];
    if (!Array.isArray(parsed)) return Array.from({ length: count }, () => 'other');
    return Array.from({ length: count }, (_, index) => validTimings.includes(parsed[index] as MeasurementTiming) ? parsed[index] as MeasurementTiming : 'other');
  } catch {
    return Array.from({ length: count }, () => 'other');
  }
}

function parseWeekdays(value: string | null) {
  try {
    const parsed: unknown = value ? JSON.parse(value) : defaultWeekdays;
    if (!Array.isArray(parsed)) return defaultWeekdays;
    const weekdays = parsed.filter((item): item is number => typeof item === 'number' && Number.isInteger(item) && item >= 1 && item <= 7);
    return [...new Set(weekdays)];
  } catch {
    return defaultWeekdays;
  }
}

function parseWindows(value: string | null, count: number): MeasurementWindow[] | undefined {
  try {
    const parsed: unknown = value ? JSON.parse(value) : [];
    if (!Array.isArray(parsed) || parsed.length !== count) return undefined;
    const windows = parsed.filter((item): item is MeasurementWindow => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Record<string, unknown>;
      if (candidate.kind === 'fixed') return typeof candidate.time === 'string' && typeof candidate.timing === 'string';
      return candidate.kind === 'meal_relative' && typeof candidate.meal === 'string' && typeof candidate.offsetMinutes === 'number' && typeof candidate.timing === 'string';
    });
    return windows.length === count ? windows : undefined;
  } catch {
    return undefined;
  }
}

export async function getMeasurementPlan(db: SQLiteDatabase): Promise<MeasurementPlan | null> {
  const row = await db.getFirstAsync<PlanRow>('SELECT * FROM measurement_plans WHERE id = ?', 'default');
  if (!row) return null;
  const readingsPerDay = row.readings_per_day as MeasurementReadingsPerDay;
  return { id: 'default', readingsPerDay, times: JSON.parse(row.times_json) as string[], timings: parseTimings(row.timings_json, readingsPerDay), windows: parseWindows(row.windows_json, readingsPerDay), weekdays: parseWeekdays(row.weekdays_json), effectiveFrom: row.effective_from ?? undefined, effectiveTo: row.effective_to ?? undefined, instructions: row.instructions ?? undefined, updatedAt: row.updated_at };
}

export async function upsertMeasurementPlan(db: SQLiteDatabase, plan: MeasurementPlan) {
  const previous = await getMeasurementPlan(db);
  await db.withTransactionAsync(async () => {
    await db.runAsync(`INSERT INTO measurement_plans (id, readings_per_day, times_json, timings_json, windows_json, weekdays_json, effective_from, effective_to, instructions, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET readings_per_day = excluded.readings_per_day, times_json = excluded.times_json, timings_json = excluded.timings_json, windows_json = excluded.windows_json, weekdays_json = excluded.weekdays_json, effective_from = excluded.effective_from, effective_to = excluded.effective_to, instructions = excluded.instructions, updated_at = excluded.updated_at`, plan.id, plan.readingsPerDay, JSON.stringify(plan.times), JSON.stringify(plan.timings ?? Array.from({ length: plan.readingsPerDay }, () => 'other')), JSON.stringify(plan.windows ?? []), JSON.stringify(plan.weekdays ?? defaultWeekdays), plan.effectiveFrom ?? null, plan.effectiveTo ?? null, plan.instructions ?? null, plan.updatedAt);
    await insertChangeAuditEvent(db, { entityType: 'measurement_plan', entityId: plan.id, action: previous ? 'updated' : 'created', before: previous ?? undefined, after: plan });
    await enqueueOutbox(db, { id: newId(), entityType: 'measurement_plan', entityId: plan.id, eventType: 'measurement_plan.revision_saved.v1', payload: plan });
  });
}
