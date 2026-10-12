export type MedicationOccurrenceStatus = 'planned' | 'due' | 'taken' | 'skipped' | 'snoozed' | 'expired' | 'not_recorded';

export type MedicationOccurrence = {
  id: string;
  medicationId: string;
  scheduledAt: string;
  status: MedicationOccurrenceStatus;
  actedAt?: string;
  createdAt: string;
};

export const medicationOccurrenceStatusLabel: Record<MedicationOccurrenceStatus, string> = {
  planned: 'Programado',
  due: 'Pendiente',
  taken: 'Tomado',
  skipped: 'Omitido',
  snoozed: 'Pospuesto',
  expired: 'Vencido',
  not_recorded: 'Sin registrar',
};
