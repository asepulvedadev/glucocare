import type { GlucoseRiskClassification } from './carePlan';

export type GlucoseUnit = 'mg/dL' | 'mmol/L';
export type GlucoseContext = 'fasting' | 'before_meal' | 'after_meal' | 'bedtime' | 'other';
export type GlucoseSource = 'manual' | 'import' | 'cgm' | 'glucometer';

export type GlucoseReading = {
  id: string;
  value: number;
  unit: GlucoseUnit;
  valueMgDl?: number;
  conversionVersion?: string;
  context: GlucoseContext;
  source?: GlucoseSource;
  mealOffsetMinutes?: number;
  recordedAt: string;
  timezone?: string;
  utcOffsetMinutes?: number;
  timeEdited?: boolean;
  symptoms?: string;
  note?: string;
  riskClassification?: GlucoseRiskClassification;
  syncState: 'local' | 'pending' | 'synced' | 'failed';
};

export const glucoseContextLabel: Record<GlucoseContext, string> = {
  fasting: 'En ayunas',
  before_meal: 'Antes de comer',
  after_meal: 'Después de comer',
  bedtime: 'Antes de dormir',
  other: 'Otro momento',
};
