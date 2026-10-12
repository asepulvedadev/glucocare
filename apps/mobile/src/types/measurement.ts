import type { MealType } from './meals';

export type MeasurementTiming = 'fasting' | 'before_meal' | 'after_meal' | 'bedtime' | 'other';

export type MeasurementWindow =
  | { kind: 'fixed'; time: string; timing: MeasurementTiming }
  | { kind: 'meal_relative'; meal: MealType; offsetMinutes: number; timing: MeasurementTiming };

export type MeasurementPlan = {
  id: 'default';
  readingsPerDay: 1 | 2 | 3;
  times: string[];
  timings?: MeasurementTiming[];
  /** Canonical slot definitions. Missing on legacy plans, which use times/timings. */
  windows?: MeasurementWindow[];
  /** ISO weekday numbers: 1 = Monday … 7 = Sunday. Empty means every day. */
  weekdays?: number[];
  effectiveFrom?: string;
  effectiveTo?: string;
  instructions?: string;
  updatedAt: string;
};

export type NewMeasurementPlan = Omit<MeasurementPlan, 'id' | 'updatedAt'>;

export const measurementTimingLabel: Record<MeasurementTiming, string> = {
  fasting: 'En ayunas',
  before_meal: 'Antes de comer',
  after_meal: 'Después de comer',
  bedtime: 'Antes de dormir',
  other: 'Otro momento',
};
