import type { MeasurementOccurrenceStatus } from '../types/measurementOccurrences';

const transitions: Record<MeasurementOccurrenceStatus, MeasurementOccurrenceStatus[]> = {
  planned: ['due', 'expired'],
  due: ['completed', 'skipped', 'expired'],
  completed: [],
  skipped: [],
  expired: [],
};

export function canTransitionMeasurementOccurrence(from: MeasurementOccurrenceStatus, to: MeasurementOccurrenceStatus) {
  return transitions[from].includes(to);
}

export function transitionMeasurementOccurrence(from: MeasurementOccurrenceStatus, to: MeasurementOccurrenceStatus) {
  if (!canTransitionMeasurementOccurrence(from, to)) {
    throw new Error(`Invalid measurement occurrence transition: ${from} -> ${to}`);
  }
  return to;
}
