export type MedicationOccurrenceStatus = 'due' | 'taken' | 'skipped' | 'snoozed' | 'expired' | 'not_recorded';

export type MedicationOccurrence = {
  id: string;
  medicationId: string;
  scheduledAt: string;
  status: MedicationOccurrenceStatus;
  actedAt?: string;
  createdAt: string;
};

export const medicationOccurrenceStatusLabel: Record<MedicationOccurrenceStatus, string> = {
  due: 'Pendiente',
  taken: 'Tomado',
  skipped: 'Omitido',
  snoozed: 'Pospuesto',
  expired: 'Vencido',
  not_recorded: 'Sin registrar',
};
