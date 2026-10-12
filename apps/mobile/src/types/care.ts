import type { MealType } from './meals';

export type MedicationRoute = 'oral' | 'injection' | 'inhaled' | 'topical' | 'other';
export type MedicationScheduleKind = 'fixed' | 'interval' | 'meal_relative';

/** User-entered schedule metadata; it never changes the prescribed dose. */
export type MedicationSchedule = {
  kind: MedicationScheduleKind;
  times?: string[];
  intervalHours?: number;
  anchorTime?: string;
  meal?: MealType;
  offsetMinutes?: number;
  /** ISO weekday numbers: 1 = Monday … 7 = Sunday. Empty means every day. */
  weekdays?: number[];
};
export type ReminderState = 'scheduled' | 'scheduled_limited' | 'permission_denied' | 'unavailable';

export type Medication = {
  id: string;
  name: string;
  /** Optional presentation supplied by the prescription or care team (e.g. tablet, vial). */
  presentation?: string;
  doseText: string;
  route: MedicationRoute;
  prescriberName?: string;
  instructions?: string;
  startDate?: string;
  endDate?: string;
  hour: number;
  minute: number;
  times?: string[];
  schedule?: MedicationSchedule;
  enabled: boolean;
  notificationId?: string;
  notificationIds?: string[];
  reminderState: ReminderState;
  createdAt: string;
};

export type NewMedication = Omit<Medication, 'id' | 'notificationId' | 'createdAt' | 'reminderState'>;

export const medicationRouteLabel: Record<MedicationRoute, string> = {
  oral: 'Oral',
  injection: 'Inyección',
  inhaled: 'Inhalado',
  topical: 'Tópico',
  other: 'Otro',
};
