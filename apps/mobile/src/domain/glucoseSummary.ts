import type { GlucoseReading, GlucoseUnit } from '../types/domain';

export const MG_DL_PER_MMOL_L = 18.0182;
export const GLUCOSE_CONVERSION_VERSION = 'fixed-18.0182-v1';
export const GLUCOSE_IDENTITY_VERSION = 'identity-mgdl-v1';

export function conversionVersionForUnit(unit: GlucoseUnit) {
  return unit === 'mmol/L' ? GLUCOSE_CONVERSION_VERSION : GLUCOSE_IDENTITY_VERSION;
}

export type GlucoseTrend = 'higher' | 'lower' | 'stable' | 'none';

export type GlucoseSummary = {
  count: number;
  averageMgDl?: number;
  minimumMgDl?: number;
  maximumMgDl?: number;
  trend: GlucoseTrend;
  points: { id: string; recordedAt: string; mgDl: number }[];
};

export function toMgDl(value: number, unit: GlucoseUnit) {
  return unit === 'mmol/L' ? value * MG_DL_PER_MMOL_L : value;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarizeGlucose(readings: GlucoseReading[], now = new Date(), windowDays = 7): GlucoseSummary {
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const points = readings
    .map((reading) => ({ ...reading, timestamp: new Date(reading.recordedAt).getTime() }))
    .filter((reading) => Number.isFinite(reading.timestamp) && reading.timestamp >= cutoff && reading.timestamp <= now.getTime())
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((reading) => ({ id: reading.id, recordedAt: reading.recordedAt, mgDl: toMgDl(reading.value, reading.unit) }));

  if (points.length === 0) return { count: 0, trend: 'none', points: [] };

  const values = points.map((point) => point.mgDl);
  let trend: GlucoseTrend = 'stable';
  if (points.length > 1) {
    const split = Math.max(1, Math.floor(points.length / 2));
    const older = average(values.slice(0, split));
    const newer = average(values.slice(split));
    const difference = newer - older;
    trend = difference > 5 ? 'higher' : difference < -5 ? 'lower' : 'stable';
  }

  return {
    count: points.length,
    averageMgDl: average(values),
    minimumMgDl: Math.min(...values),
    maximumMgDl: Math.max(...values),
    trend,
    points,
  };
}
