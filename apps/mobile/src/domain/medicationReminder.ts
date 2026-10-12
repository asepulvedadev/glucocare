import type { Medication } from '../types/care';
import { isMedicationActive, isValidMedicationDate } from './medication';

/**
 * Keep the native queue bounded; the app rebuilds this rolling window on
 * resume. Fourteen days × three configured times stays below iOS' pending
 * notification limit while leaving room for appointment and safety notices.
 */
export const MEDICATION_REMINDER_HORIZON_DAYS = 14;

function localDateOnly(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function localDateAt(day: Date, time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
}

function medicationTimes(medication: Pick<Medication, 'times' | 'hour' | 'minute'>) {
  const values = medication.times?.length
    ? medication.times
    : [`${String(medication.hour).padStart(2, '0')}:${String(medication.minute).padStart(2, '0')}`];
  return [...new Set(values)].filter((value) => {
    if (!/^\d{2}:\d{2}$/.test(value)) return false;
    const [hour, minute] = value.split(':').map(Number);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
  }).sort();
}

/** Returns future local instants for the rolling notification window. */
export function medicationReminderDates(
  medication: Pick<Medication, 'enabled' | 'startDate' | 'endDate' | 'times' | 'hour' | 'minute'>,
  now = new Date(),
  horizonDays = MEDICATION_REMINDER_HORIZON_DAYS,
) {
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(horizonDays) || horizonDays < 1) return [];
  if (!medication.enabled) return [];
  if (medication.startDate && !isValidMedicationDate(medication.startDate)) return [];
  if (medication.endDate && !isValidMedicationDate(medication.endDate)) return [];
  if (medication.startDate && medication.endDate && medication.startDate > medication.endDate) return [];
  if (!isMedicationActive(medication, now) && !(medication.startDate && localDateOnly(now) < medication.startDate)) return [];

  const today = localDateOnly(now);
  const firstDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (medication.startDate && medication.startDate > today) {
    const [year, month, day] = medication.startDate.split('-').map(Number);
    firstDay.setFullYear(year, month - 1, day);
  }
  const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + horizonDays - 1);
  if (medication.endDate && medication.endDate < localDateOnly(lastDay)) {
    const [year, month, day] = medication.endDate.split('-').map(Number);
    lastDay.setFullYear(year, month - 1, day);
  }

  const dates: Date[] = [];
  for (const day = new Date(firstDay); day <= lastDay; day.setDate(day.getDate() + 1)) {
    for (const time of medicationTimes(medication)) {
      const candidate = localDateAt(day, time);
      if (candidate.getTime() > now.getTime()) dates.push(candidate);
    }
  }
  return dates.sort((a, b) => a.getTime() - b.getTime());
}
