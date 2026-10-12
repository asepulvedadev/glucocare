export type MedicationRoute = 'oral' | 'injection' | 'inhaled' | 'topical' | 'other';
export type ReminderState = 'scheduled' | 'permission_denied' | 'unavailable';

export type Medication = {
  id: string;
  name: string;
  doseText: string;
  route: MedicationRoute;
  hour: number;
  minute: number;
  enabled: boolean;
  notificationId?: string;
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
