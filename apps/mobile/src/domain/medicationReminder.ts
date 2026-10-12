import type { MealEvent } from '../types/meals';
import type { Medication } from '../types/care';
import { isMedicationActive, isValidMedicationDate } from './medication';
import { isValidMedicationTime, legacyMedicationSchedule, parseMedicationSchedule, validateMedicationSchedule } from './medicationSchedule';

/**
 * Keep the native queue bounded; the app rebuilds this rolling window on
 * resume. The schedule generator supports fixed, interval, weekday-filtered,
 * and meal-relative routines without changing the prescribed dose.
 */
export const MEDICATION_REMINDER_HORIZON_DAYS = 14;

function localDateOnly(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function localDateAt(day: Date, time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
}

function localWeekday(value: Date) {
  const day = value.getDay();
  return day === 0 ? 7 : day;
}

function allowsWeekday(schedule: { weekdays?: number[] }, value: Date) {
  return !schedule.weekdays?.length || schedule.weekdays.includes(localWeekday(value));
}

function validTimes(values: string[]) {
  return [...new Set(values)].filter(isValidMedicationTime).sort();
}

function scheduleFor(medication: Pick<Medication, 'schedule' | 'times' | 'hour' | 'minute'>) {
  return medication.schedule ?? legacyMedicationSchedule(medication);
}

/** Returns future local instants for the rolling notification window. */
export function medicationReminderDates(
  medication: Pick<Medication, 'enabled' | 'startDate' | 'endDate' | 'times' | 'hour' | 'minute' | 'schedule'>,
  now = new Date(),
  horizonDays = MEDICATION_REMINDER_HORIZON_DAYS,
  meals: MealEvent[] = [],
) {
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(horizonDays) || horizonDays < 1) return [];
  if (!medication.enabled) return [];
  if (medication.startDate && !isValidMedicationDate(medication.startDate)) return [];
  if (medication.endDate && !isValidMedicationDate(medication.endDate)) return [];
  if (medication.startDate && medication.endDate && medication.startDate > medication.endDate) return [];
  if (!isMedicationActive(medication, now) && !(medication.startDate && localDateOnly(now) < medication.startDate)) return [];

  const schedule = parseMedicationSchedule(undefined, scheduleFor(medication));
  if (!validateMedicationSchedule(schedule)) return [];
  const today = localDateOnly(now);
  const firstDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (medication.startDate && medication.startDate > today) {
    const [year, month, day] = medication.startDate.split('-').map(Number);
    firstDay.setFullYear(year, month - 1, day);
  }
  const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + horizonDays - 1, 23, 59, 59, 999);
  if (medication.endDate && medication.endDate < localDateOnly(lastDay)) {
    const [year, month, day] = medication.endDate.split('-').map(Number);
    lastDay.setFullYear(year, month - 1, day);
    lastDay.setHours(23, 59, 59, 999);
  }
  const startMs = firstDay.getTime();
  const endMs = lastDay.getTime();
  const dates: Date[] = [];
  const add = (candidate: Date) => {
    if (!Number.isFinite(candidate.getTime()) || candidate.getTime() <= now.getTime() || candidate.getTime() < startMs || candidate.getTime() > endMs) return;
    if (!allowsWeekday(schedule, candidate)) return;
    dates.push(candidate);
  };

  if (schedule.kind === 'fixed') {
    const times = validTimes(schedule.times ?? []);
    for (const day = new Date(firstDay); day <= lastDay; day.setDate(day.getDate() + 1)) {
      if (!allowsWeekday(schedule, day)) continue;
      for (const time of times) add(localDateAt(day, time));
    }
  } else if (schedule.kind === 'interval') {
    const anchor = localDateAt(firstDay, schedule.anchorTime ?? '00:00');
    const intervalMs = (schedule.intervalHours ?? 0) * 60 * 60 * 1000;
    if (intervalMs > 0) {
      for (let candidate = anchor; candidate.getTime() <= endMs; candidate = new Date(candidate.getTime() + intervalMs)) add(candidate);
    }
  } else {
    for (const meal of meals) {
      if (meal.mealType !== schedule.meal) continue;
      const mealTime = new Date(meal.occurredAt);
      if (!Number.isFinite(mealTime.getTime())) continue;
      add(new Date(mealTime.getTime() + (schedule.offsetMinutes ?? 0) * 60 * 1000));
    }
  }
  return [...new Map(dates.map((date) => [date.toISOString(), date])).values()].sort((a, b) => a.getTime() - b.getTime());
}

/** Includes all schedule instants for one local day, including already-due ones. */
export function medicationOccurrenceDatesForDay(
  medication: Pick<Medication, 'enabled' | 'startDate' | 'endDate' | 'times' | 'hour' | 'minute' | 'schedule'>,
  meals: MealEvent[],
  now: Date,
) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return medicationReminderDates(medication, new Date(start.getTime() - 1), 1, meals);
}
