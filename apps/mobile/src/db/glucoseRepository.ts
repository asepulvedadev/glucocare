import type { SQLiteDatabase } from 'expo-sqlite';
import type { GlucoseContext, GlucoseReading, GlucoseUnit } from '../types/domain';
import { newId } from '../ids';
import { enqueueOutbox } from './outboxRepository';
import { completeNearestMeasurementOccurrence } from './measurementOccurrenceRepository';

export type NewGlucoseReading = Omit<GlucoseReading, 'id' | 'syncState'>;

type GlucoseRow = {
  id: string;
  value: number;
  unit: GlucoseUnit;
  context: GlucoseContext;
  recorded_at: string;
  symptoms: string | null;
  note: string | null;
  sync_state: 'local' | 'pending' | 'synced' | 'failed';
};

function mapRow(row: GlucoseRow): GlucoseReading {
  return {
    id: row.id,
    value: row.value,
    unit: row.unit,
    context: row.context,
    recordedAt: row.recorded_at,
    symptoms: row.symptoms ?? undefined,
    note: row.note ?? undefined,
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
      `INSERT INTO glucose_readings (id, value, unit, context, recorded_at, symptoms, note, sync_state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      stored.id, stored.value, stored.unit, stored.context, stored.recordedAt, stored.symptoms ?? null, stored.note ?? null, stored.syncState,
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
