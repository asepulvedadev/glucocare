import type { MealEvent } from '../types/meals';
import type { MeasurementPlan } from '../types/measurement';
import { isMeasurementPlanActive, isValidMeasurementTime, legacyMeasurementWindows } from './measurementPlan';

export const MEASUREMENT_REMINDER_HORIZON_DAYS = 14;

export type MeasurementReminderDate = {
  scheduledAt: Date;
  windowIndex: number;
  mealEventId?: string;
};

function localDateAt(day: Date, time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
}

/** Returns future glucose-check reminders for fixed and meal-relative windows. */
export function measurementReminderDates(
  plan: MeasurementPlan | null,
  meals: MealEvent[],
  now = new Date(),
  horizonDays = MEASUREMENT_REMINDER_HORIZON_DAYS,
): MeasurementReminderDate[] {
  if (!plan || !Number.isFinite(now.getTime()) || !Number.isInteger(horizonDays) || horizonDays < 1) return [];
  const windows = legacyMeasurementWindows(plan);
  const firstDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + horizonDays - 1, 23, 59, 59, 999);
  const result: MeasurementReminderDate[] = [];

  for (const day = new Date(firstDay); day <= lastDay; day.setDate(day.getDate() + 1)) {
    if (!isMeasurementPlanActive(plan, day)) continue;
    windows.forEach((window, windowIndex) => {
      if (window.kind !== 'fixed' || !isValidMeasurementTime(window.time)) return;
      const scheduledAt = localDateAt(day, window.time);
      if (scheduledAt > now && scheduledAt <= lastDay) result.push({ scheduledAt, windowIndex });
    });
  }

  windows.forEach((window, windowIndex) => {
    if (window.kind !== 'meal_relative') return;
    for (const meal of meals) {
      if (meal.mealType !== window.meal) continue;
      const mealTime = new Date(meal.occurredAt);
      const scheduledAt = new Date(mealTime.getTime() + window.offsetMinutes * 60 * 1000);
      if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt <= now || scheduledAt > lastDay || !isMeasurementPlanActive(plan, scheduledAt)) continue;
      result.push({ scheduledAt, windowIndex, mealEventId: meal.id });
    }
  });

  return result.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}
