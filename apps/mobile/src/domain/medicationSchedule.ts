import type { MealType } from '../types/meals';
import type { Medication, MedicationSchedule } from '../types/care';

const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const mealLabels: Record<MealType, string> = { breakfast: 'desayuno', lunch: 'almuerzo', dinner: 'cena', snack: 'merienda' };

export function isValidMedicationTime(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(':').map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function legacyMedicationSchedule(medication: Pick<Medication, 'times' | 'hour' | 'minute'>): MedicationSchedule {
  const fallback = `${String(medication.hour).padStart(2, '0')}:${String(medication.minute).padStart(2, '0')}`;
  const times = medication.times?.length ? medication.times : [fallback];
  return { kind: 'fixed', times: [...new Set(times)].filter(isValidMedicationTime).sort() };
}

export function parseMedicationSchedule(value: string | null | undefined, fallback: MedicationSchedule): MedicationSchedule {
  if (!value) return fallback;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    const candidate = parsed as Record<string, unknown>;
    const kind = candidate.kind;
    if (kind !== 'fixed' && kind !== 'interval' && kind !== 'meal_relative') return fallback;
    const schedule: MedicationSchedule = { kind };
    if (Array.isArray(candidate.times)) schedule.times = candidate.times.filter((item): item is string => typeof item === 'string');
    if (typeof candidate.intervalHours === 'number') schedule.intervalHours = candidate.intervalHours;
    if (typeof candidate.anchorTime === 'string') schedule.anchorTime = candidate.anchorTime;
    if (mealTypes.includes(candidate.meal as MealType)) schedule.meal = candidate.meal as MealType;
    if (typeof candidate.offsetMinutes === 'number') schedule.offsetMinutes = candidate.offsetMinutes;
    if (Array.isArray(candidate.weekdays)) schedule.weekdays = candidate.weekdays.filter((item): item is number => typeof item === 'number');
    return schedule;
  } catch {
    return fallback;
  }
}

export function validMedicationWeekdays(weekdays: number[] | undefined) {
  return !weekdays || (weekdays.every((day) => Number.isInteger(day) && day >= 1 && day <= 7) && new Set(weekdays).size === weekdays.length);
}

export function validateMedicationSchedule(schedule: MedicationSchedule) {
  if (!validMedicationWeekdays(schedule.weekdays)) return false;
  if (schedule.kind === 'fixed') {
    const times = schedule.times ?? [];
    return times.length >= 1 && times.length <= 8 && times.every(isValidMedicationTime);
  }
  if (schedule.kind === 'interval') return isValidMedicationTime(schedule.anchorTime ?? '') && Number.isInteger(schedule.intervalHours) && (schedule.intervalHours ?? 0) >= 1 && (schedule.intervalHours ?? 0) <= 24;
  return schedule.meal !== undefined && mealTypes.includes(schedule.meal) && Number.isInteger(schedule.offsetMinutes) && (schedule.offsetMinutes ?? -1) >= -240 && (schedule.offsetMinutes ?? 0) <= 1440;
}

export function medicationScheduleLabel(schedule: MedicationSchedule) {
  if (schedule.kind === 'interval') return `Cada ${schedule.intervalHours ?? '?'} h desde ${schedule.anchorTime ?? '—'}`;
  if (schedule.kind === 'meal_relative') {
    const offset = schedule.offsetMinutes ?? 0;
    return `${offset >= 0 ? '+' : ''}${offset} min ${mealLabels[schedule.meal ?? 'snack']}`;
  }
  return (schedule.times ?? []).join(' · ');
}
