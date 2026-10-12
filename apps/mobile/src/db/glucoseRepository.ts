import type { SQLiteDatabase } from 'expo-sqlite';
import type { GlucoseContext, GlucoseReading, GlucoseSource, GlucoseUnit } from '../types/domain';
import type { GlucoseRiskClassification } from '../types/carePlan';
import { newId } from '../ids';
import { enqueueOutbox } from './outboxRepository';
import { completeNearestMeasurementOccurrence } from './measurementOccurrenceRepository';
import { insertGlucoseAuditEvent } from './glucoseAuditRepository';
import { conversionVersionForUnit, toCanonicalMgDl } from '../domain/glucoseSummary';

export type NewGlucoseReading = Omit<GlucoseReading, 'id' | 'syncState'>;

type GlucoseRow = {
  id: string;
  value: number;
  unit: GlucoseUnit;
  value_mg_dl: number | null;
  conversion_version: string | null;
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
    valueMgDl: row.value_mg_dl ?? toCanonicalMgDl(row.value, row.unit),
    conversionVersion: row.conversion_version ?? conversionVersionForUnit(row.unit),
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
    valueMgDl: toCanonicalMgDl(reading.value, reading.unit),
    conversionVersion: conversionVersionForUnit(reading.unit),
    syncState: 'pending',
  };
  const canonicalValueMgDl = toCanonicalMgDl(reading.value, reading.unit);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO glucose_readings (id, value, unit, value_mg_dl, conversion_version, context, source, meal_offset_minutes, recorded_at, timezone, utc_offset_minutes, time_edited, symptoms, note, sync_state, risk_classification)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      stored.id, stored.value, stored.unit, canonicalValueMgDl, conversionVersionForUnit(stored.unit), stored.context, stored.source ?? 'manual', stored.mealOffsetMinutes ?? null, stored.recordedAt, stored.timezone ?? null, stored.utcOffsetMinutes ?? null, stored.timeEdited ? 1 : 0, stored.symptoms ?? null, stored.note ?? null, stored.syncState, stored.riskClassification ?? null,
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

export async function updateGlucoseReading(db: SQLiteDatabase, before: GlucoseReading, next: GlucoseReading, reason = 'user_corrected') {
  const occurredAt = new Date().toISOString();
  const canonicalValueMgDl = toCanonicalMgDl(next.value, next.unit);
  const conversionVersion = conversionVersionForUnit(next.unit);
  const normalizedNext: GlucoseReading = { ...next, valueMgDl: canonicalValueMgDl, conversionVersion };
  const audit = {
    id: newId(),
    readingId: next.id,
    occurredAt,
    action: 'corrected' as const,
    reason,
    before,
    after: normalizedNext,
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE glucose_readings SET value = ?, unit = ?, value_mg_dl = ?, conversion_version = ?, context = ?, source = ?, meal_offset_minutes = ?, recorded_at = ?, timezone = ?, utc_offset_minutes = ?, time_edited = ?, symptoms = ?, note = ?, sync_state = ?, risk_classification = ? WHERE id = ?`,
      normalizedNext.value, normalizedNext.unit, canonicalValueMgDl, conversionVersion, normalizedNext.context, normalizedNext.source ?? 'manual', normalizedNext.mealOffsetMinutes ?? null, normalizedNext.recordedAt, normalizedNext.timezone ?? null, normalizedNext.utcOffsetMinutes ?? null, normalizedNext.timeEdited ? 1 : 0, normalizedNext.symptoms ?? null, normalizedNext.note ?? null, normalizedNext.syncState, normalizedNext.riskClassification ?? null, normalizedNext.id,
    );
    await insertGlucoseAuditEvent(db, audit);
    await enqueueOutbox(db, { id: newId(), entityType: 'glucose_reading', entityId: next.id, eventType: 'glucose.reading.corrected.v1', payload: audit as unknown as Record<string, unknown> });
  });
  try {
    await completeNearestMeasurementOccurrence(db, next.id, next.recordedAt);
  } catch {
    // Measurement tracking remains an optional projection and must not block a correction.
  }
  return normalizedNext;
}
