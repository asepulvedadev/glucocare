import type { MeasurementPlan, MeasurementTiming, MeasurementWindow } from '../types/measurement';
import type { MealType } from '../types/meals';

export function isValidMeasurementTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

const validWeekdays = [1, 2, 3, 4, 5, 6, 7];
const validMeals: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateMeasurementPlan(readingsPerDay: 1 | 2 | 3, times: string[], timings?: MeasurementTiming[], options?: { weekdays?: number[]; effectiveFrom?: string; effectiveTo?: string }) {
  const weekdays = options?.weekdays ?? [];
  return times.length === readingsPerDay
    && times.every(isValidMeasurementTime)
    && (timings === undefined || (timings.length === readingsPerDay && timings.every((timing) => ['fasting', 'before_meal', 'after_meal', 'bedtime', 'other'].includes(timing))))
    && weekdays.every((weekday) => validWeekdays.includes(weekday))
    && new Set(weekdays).size === weekdays.length
    && (!options?.effectiveFrom || isValidDateOnly(options.effectiveFrom))
    && (!options?.effectiveTo || isValidDateOnly(options.effectiveTo))
    && (!options?.effectiveFrom || !options?.effectiveTo || options.effectiveFrom <= options.effectiveTo);
}

export function isValidMeasurementWindow(window: MeasurementWindow) {
  if (window.kind === 'fixed') return isValidMeasurementTime(window.time) && ['fasting', 'before_meal', 'after_meal', 'bedtime', 'other'].includes(window.timing);
  return validMeals.includes(window.meal)
    && Number.isInteger(window.offsetMinutes)
    && window.offsetMinutes >= -240
    && window.offsetMinutes <= 1440
    && ['fasting', 'before_meal', 'after_meal', 'bedtime', 'other'].includes(window.timing);
}

export function validateMeasurementWindows(readingsPerDay: 1 | 2 | 3, windows: MeasurementWindow[]) {
  return windows.length === readingsPerDay && windows.every(isValidMeasurementWindow);
}

export function legacyMeasurementWindows(plan: Pick<MeasurementPlan, 'times' | 'timings' | 'windows'>): MeasurementWindow[] {
  if (plan.windows?.length) return plan.windows;
  return plan.times.map((time, index) => ({ kind: 'fixed' as const, time, timing: plan.timings?.[index] ?? 'other' }));
}

export function localIsoDate(now: Date) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function localIsoWeekday(now: Date) {
  const day = now.getDay();
  return day === 0 ? 7 : day;
}

export function isMeasurementPlanActive(plan: Pick<MeasurementPlan, 'weekdays' | 'effectiveFrom' | 'effectiveTo'>, now = new Date()) {
  const date = localIsoDate(now);
  if (plan.effectiveFrom && date < plan.effectiveFrom) return false;
  if (plan.effectiveTo && date > plan.effectiveTo) return false;
  const weekdays = plan.weekdays ?? [];
  return weekdays.length === 0 || weekdays.includes(localIsoWeekday(now));
}
