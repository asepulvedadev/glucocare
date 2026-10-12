export type GlucoseRiskClassification = 'unclassified' | 'in_range' | 'low' | 'urgent_low' | 'high' | 'urgent_high';

/** Immutable explanation metadata stored with each classification. */
export type GlucoseRiskAssessment = {
  classification: GlucoseRiskClassification;
  ruleId: string;
  carePlanUpdatedAt?: string;
};

export type CarePlan = {
  id: 'default';
  lowThreshold?: number;
  urgentLowThreshold?: number;
  highThreshold?: number;
  urgentHighThreshold?: number;
  instructions?: string;
  source?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  clinicianVerified: boolean;
  updatedAt: string;
};

export type NewCarePlan = Omit<CarePlan, 'id' | 'updatedAt'>;

export const glucoseRiskLabel: Record<GlucoseRiskClassification, string> = {
  unclassified: 'Sin clasificación',
  in_range: 'Dentro del plan guardado',
  low: 'Bajo según el plan guardado',
  urgent_low: 'Urgente bajo según el plan guardado',
  high: 'Alto según el plan guardado',
  urgent_high: 'Urgente alto según el plan guardado',
};
