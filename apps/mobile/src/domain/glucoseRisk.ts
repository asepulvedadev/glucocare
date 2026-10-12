import type { CarePlan, GlucoseRiskAssessment, GlucoseRiskClassification } from '../types/carePlan';
import type { GlucoseUnit } from '../types/domain';
import { toMgDl } from './glucoseSummary';

export function validateCarePlanThresholds(plan: Pick<CarePlan, 'lowThreshold' | 'urgentLowThreshold' | 'highThreshold' | 'urgentHighThreshold'>) {
  const values = [plan.urgentLowThreshold, plan.lowThreshold, plan.highThreshold, plan.urgentHighThreshold].filter((value): value is number => value !== undefined);
  if (values.some((value) => !Number.isFinite(value) || value <= 0 || value > 1000)) return false;
  return values.every((value, index) => index === 0 || value > values[index - 1]);
}

export function isCarePlanExpired(plan: Pick<CarePlan, 'effectiveTo'> | null, now = new Date()) {
  if (!plan?.effectiveTo) return false;
  const expiry = Date.parse(plan.effectiveTo);
  return Number.isFinite(expiry) && expiry <= now.getTime();
}

export function classifyGlucose(value: number, unit: GlucoseUnit, plan: CarePlan | null): GlucoseRiskClassification {
  return assessGlucose(value, unit, plan).classification;
}

/** Returns the classification plus the exact rule and plan revision used. */
export function assessGlucose(value: number, unit: GlucoseUnit, plan: CarePlan | null): GlucoseRiskAssessment {
  if (!plan) return { classification: 'unclassified', ruleId: 'no-care-plan' };
  if (isCarePlanExpired(plan)) return { classification: 'unclassified', ruleId: 'care-plan-expired', carePlanUpdatedAt: plan.updatedAt };
  if (!validateCarePlanThresholds(plan)) return { classification: 'unclassified', ruleId: 'care-plan-invalid', carePlanUpdatedAt: plan.updatedAt };
  const valueMgDl = toMgDl(value, unit);
  if (plan.urgentLowThreshold !== undefined && valueMgDl <= plan.urgentLowThreshold) return { classification: 'urgent_low', ruleId: 'care-plan.urgent-low', carePlanUpdatedAt: plan.updatedAt };
  if (plan.lowThreshold !== undefined && valueMgDl <= plan.lowThreshold) return { classification: 'low', ruleId: 'care-plan.low', carePlanUpdatedAt: plan.updatedAt };
  if (plan.urgentHighThreshold !== undefined && valueMgDl >= plan.urgentHighThreshold) return { classification: 'urgent_high', ruleId: 'care-plan.urgent-high', carePlanUpdatedAt: plan.updatedAt };
  if (plan.highThreshold !== undefined && valueMgDl >= plan.highThreshold) return { classification: 'high', ruleId: 'care-plan.high', carePlanUpdatedAt: plan.updatedAt };
  return { classification: 'in_range', ruleId: 'care-plan.in-range', carePlanUpdatedAt: plan.updatedAt };
}
