export type MeasurementOccurrenceStatus = 'planned' | 'due' | 'completed' | 'skipped' | 'expired';

export type MeasurementOccurrence = {
  id: string;
  planId: 'default';
  scheduledAt: string;
  status: MeasurementOccurrenceStatus;
  completedReadingId?: string;
  completedAt?: string;
  createdAt: string;
};

export const measurementOccurrenceStatusLabel: Record<MeasurementOccurrenceStatus, string> = {
  planned: 'Planificada',
  due: 'Pendiente',
  completed: 'Completada',
  skipped: 'Omitida',
  expired: 'Vencida',
};
