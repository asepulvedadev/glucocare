import type { MedicationOccurrenceStatus } from '../types/medicationOccurrences';

const transitions: Record<MedicationOccurrenceStatus, MedicationOccurrenceStatus[]> = {
  planned: ['due', 'expired'],
  due: ['taken', 'skipped', 'snoozed', 'expired', 'not_recorded'],
  snoozed: ['taken', 'skipped', 'expired', 'not_recorded'],
  taken: [],
  skipped: [],
  expired: [],
  not_recorded: [],
};

export function canTransitionMedicationOccurrence(from: MedicationOccurrenceStatus, to: MedicationOccurrenceStatus) {
  return transitions[from].includes(to);
}

export function transitionMedicationOccurrence(from: MedicationOccurrenceStatus, to: MedicationOccurrenceStatus) {
  if (!canTransitionMedicationOccurrence(from, to)) {
    throw new Error(`Invalid medication occurrence transition: ${from} -> ${to}`);
  }
  return to;
}
