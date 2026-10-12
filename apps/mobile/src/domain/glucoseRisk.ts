import type { CarePlan, GlucoseRiskClassification } from '../types/carePlan';
import type { GlucoseUnit } from '../types/domain';

const MG_DL_PER_MMOL_L = 18.0182;

export function validateCarePlanThresholds(plan: Pick<CarePlan, 'lowThreshold' | 'urgentLowThreshold' | 'highThreshold' | 'urgentHighThreshold'>) {
  const values = [plan.urgentLowThreshold, plan.lowThreshold, plan.highThreshold, plan.urgentHighThreshold].filter((value): value is number => value !== undefined);
  if (values.some((value) => !Number.isFinite(value) || value <= 0 || value > 1000)) return false;
  return values.every((value, index) => index === 0 || value > values[index - 1]);
}

export function classifyGlucose(value: number, unit: GlucoseUnit, plan: CarePlan | null): GlucoseRiskClassification {
  if (!plan || !validateCarePlanThresholds(plan)) return 'unclassified';
  const valueMgDl = unit === 'mmol/L' ? value * MG_DL_PER_MMOL_L : value;
  if (plan.urgentLowThreshold !== undefined && valueMgDl <= plan.urgentLowThreshold) return 'urgent_low';
  if (plan.lowThreshold !== undefined && valueMgDl <= plan.lowThreshold) return 'low';
  if (plan.urgentHighThreshold !== undefined && valueMgDl >= plan.urgentHighThreshold) return 'urgent_high';
  if (plan.highThreshold !== undefined && valueMgDl >= plan.highThreshold) return 'high';
  return 'in_range';
}
