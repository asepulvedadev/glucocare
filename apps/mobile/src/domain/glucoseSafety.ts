/** Stored phrase used when a person explicitly reports severe symptoms. */
export const URGENT_SYMPTOM_NOTICE = 'Síntomas de alarma reportados';

/**
 * Flags values that are unusually high for a home meter entry. This is a
 * data-entry confirmation, not a medical threshold or a risk classification.
 */
export function isImplausibleGlucoseValue(value: number, unit: 'mg/dL' | 'mmol/L') {
  return unit === 'mg/dL' ? value > 600 : value > 33.3;
}

export function hasUrgentSymptoms(symptoms?: string) {
  return Boolean(symptoms?.includes(URGENT_SYMPTOM_NOTICE));
}
