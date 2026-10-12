import type { SQLiteDatabase } from 'expo-sqlite';
import { newId } from '../ids';
import type { CarePlan } from '../types/carePlan';
import { enqueueOutbox } from './outboxRepository';

type CarePlanRow = {
  id: 'default';
  low_threshold: number | null;
  urgent_low_threshold: number | null;
  high_threshold: number | null;
  urgent_high_threshold: number | null;
  instructions: string | null;
  clinician_verified: number;
  updated_at: string;
};

function mapRow(row: CarePlanRow): CarePlan {
  return {
    id: 'default',
    lowThreshold: row.low_threshold ?? undefined,
    urgentLowThreshold: row.urgent_low_threshold ?? undefined,
    highThreshold: row.high_threshold ?? undefined,
    urgentHighThreshold: row.urgent_high_threshold ?? undefined,
    instructions: row.instructions ?? undefined,
    clinicianVerified: row.clinician_verified === 1,
    updatedAt: row.updated_at,
  };
}

export async function getCarePlan(db: SQLiteDatabase): Promise<CarePlan | null> {
  const row = await db.getFirstAsync<CarePlanRow>('SELECT * FROM care_plan WHERE id = ?', 'default');
  return row ? mapRow(row) : null;
}

export async function upsertCarePlan(db: SQLiteDatabase, plan: CarePlan) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(`INSERT INTO care_plan (id, low_threshold, urgent_low_threshold, high_threshold, urgent_high_threshold, instructions, clinician_verified, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET low_threshold = excluded.low_threshold, urgent_low_threshold = excluded.urgent_low_threshold, high_threshold = excluded.high_threshold, urgent_high_threshold = excluded.urgent_high_threshold, instructions = excluded.instructions, clinician_verified = excluded.clinician_verified, updated_at = excluded.updated_at`,
      plan.id, plan.lowThreshold ?? null, plan.urgentLowThreshold ?? null, plan.highThreshold ?? null, plan.urgentHighThreshold ?? null,
      plan.instructions ?? null, plan.clinicianVerified ? 1 : 0, plan.updatedAt);
    await enqueueOutbox(db, { id: newId(), entityType: 'care_plan', entityId: plan.id, eventType: 'care_plan.revision_saved.v1', payload: plan });
  });
}
