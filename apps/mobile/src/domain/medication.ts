import type { Medication } from '../types/care';

function localIsoDate(now: Date) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isValidMedicationDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Medication validity dates are descriptive clinical metadata, but they also
 * define whether a local reminder/occurrence may be generated. This keeps an
 * expired prescription from continuing to appear as an active task.
 */
export function isMedicationActive(medication: Pick<Medication, 'enabled' | 'startDate' | 'endDate'>, now = new Date()) {
  if (!medication.enabled) return false;
  if (medication.startDate && !isValidMedicationDate(medication.startDate)) return false;
  if (medication.endDate && !isValidMedicationDate(medication.endDate)) return false;
  const date = localIsoDate(now);
  if (medication.startDate && date < medication.startDate) return false;
  if (medication.endDate && date > medication.endDate) return false;
  return true;
}
