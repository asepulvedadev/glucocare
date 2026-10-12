import type { SQLiteDatabase } from 'expo-sqlite';
import type { GlucoseContext, GlucoseReading, GlucoseSource, GlucoseUnit } from '../types/domain';
import type { GlucoseRiskClassification } from '../types/carePlan';
import { newId } from '../ids';
import { enqueueOutbox } from './outboxRepository';
import { completeNearestMeasurementOccurrence } from './measurementOccurrenceRepository';

export type NewGlucoseReading = Omit<GlucoseReading, 'id' | 'syncState'>;

type GlucoseRow = {
  id: string;
  value: number;
  unit: GlucoseUnit;
  context: GlucoseContext;
  source: GlucoseSource | null;
  meal_offset_minutes: number | null;
  recorded_at: string;
  timezone: string | null;
  utc_offset_minutes: number | null;
  time_edited: number;
  symptoms: string | null;
  note: string | null;
  sync_state: 'local' | 'pending' | 'synced' | 'failed';
  risk_classification: GlucoseRiskClassification | null;
};

function mapRow(row: GlucoseRow): GlucoseReading {
  return {
    id: row.id,
    value: row.value,
    unit: row.unit,
    context: row.context,
    source: row.source ?? 'manual',
    mealOffsetMinutes: row.meal_offset_minutes ?? undefined,
    recordedAt: row.recorded_at,
    timezone: row.timezone ?? undefined,
    utcOffsetMinutes: row.utc_offset_minutes ?? undefined,
    timeEdited: row.time_edited === 1,
    symptoms: row.symptoms ?? undefined,
    note: row.note ?? undefined,
    riskClassification: row.risk_classification ?? undefined,
    syncState: row.sync_state,
  };
}

export async function listGlucoseReadings(db: SQLiteDatabase): Promise<GlucoseReading[]> {
  const rows = await db.getAllAsync<GlucoseRow>(
    'SELECT * FROM glucose_readings ORDER BY recorded_at DESC',
  );
  return rows.map(mapRow);
}

export async function insertGlucoseReading(
  db: SQLiteDatabase,
  reading: NewGlucoseReading,
): Promise<GlucoseReading> {
  const stored: GlucoseReading = {
    ...reading,
    id: newId(),
    syncState: 'pending',
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO glucose_readings (id, value, unit, context, source, meal_offset_minutes, recorded_at, timezone, utc_offset_minutes, time_edited, symptoms, note, sync_state, risk_classification)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      stored.id, stored.value, stored.unit, stored.context, stored.source ?? 'manual', stored.mealOffsetMinutes ?? null, stored.recordedAt, stored.timezone ?? null, stored.utcOffsetMinutes ?? null, stored.timeEdited ? 1 : 0, stored.symptoms ?? null, stored.note ?? null, stored.syncState, stored.riskClassification ?? null,
    );
    await enqueueOutbox(db, { id: newId(), entityType: 'glucose_reading', entityId: stored.id, eventType: 'glucose.reading.recorded.v1', payload: stored });
  });
  try {
    await completeNearestMeasurementOccurrence(db, stored.id, stored.recordedAt);
  } catch {
    // A measurement occurrence is an optional tracking projection; never block saving the reading.
  }
  return stored;
}
