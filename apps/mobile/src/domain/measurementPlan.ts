export function isValidMeasurementTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function validateMeasurementPlan(readingsPerDay: 1 | 2 | 3, times: string[]) {
  return times.length === readingsPerDay && times.every(isValidMeasurementTime);
}
