/** Stored phrase used when a person explicitly reports severe symptoms. */
export const URGENT_SYMPTOM_NOTICE = 'Síntomas de alarma reportados';

export function hasUrgentSymptoms(symptoms?: string) {
  return Boolean(symptoms?.includes(URGENT_SYMPTOM_NOTICE));
}
