import type { GlucoseRiskClassification } from './carePlan';

export type GlucoseUnit = 'mg/dL' | 'mmol/L';
export type GlucoseContext = 'fasting' | 'before_meal' | 'after_meal' | 'bedtime' | 'exercise' | 'illness' | 'symptoms' | 'other';
export type GlucoseSource = 'manual' | 'import' | 'cgm' | 'glucometer';
export type KetoneResult = 'not_checked' | 'negative' | 'trace' | 'small' | 'moderate' | 'large' | 'unknown';

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
  ketoneResult?: KetoneResult;
  riskClassification?: GlucoseRiskClassification;
  riskRuleId?: string;
  riskPlanUpdatedAt?: string;
  syncState: 'local' | 'pending' | 'synced' | 'failed';
};

export const glucoseContextLabel: Record<GlucoseContext, string> = {
  fasting: 'En ayunas',
  before_meal: 'Antes de comer',
  after_meal: 'Después de comer',
  bedtime: 'Antes de dormir',
  exercise: 'Después de ejercicio',
  illness: 'Durante enfermedad',
  symptoms: 'Con síntomas',
  other: 'Otro momento',
};

export const ketoneResultLabel: Record<KetoneResult, string> = {
  not_checked: 'No revisadas',
  negative: 'Negativas',
  trace: 'Trazas',
  small: 'Pequeñas',
  moderate: 'Moderadas',
  large: 'Grandes',
  unknown: 'Resultado no claro',
};
