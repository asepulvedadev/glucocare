import { describe, expect, it } from 'vitest';
import { canTransitionAppointment, transitionAppointment } from '../src/domain/appointmentState';
import { isValidMeasurementTime, validateMeasurementPlan } from '../src/domain/measurementPlan';
import { newId } from '../src/ids';
import { canTransitionMedicationOccurrence, transitionMedicationOccurrence } from '../src/domain/medicationOccurrenceState';
import { canTransitionMeasurementOccurrence, transitionMeasurementOccurrence } from '../src/domain/measurementOccurrenceState';

describe('appointment state machine', () => {
  it('allows the requested-to-scheduled path through authorization', () => {
    expect(canTransitionAppointment('requested', 'pending_authorization')).toBe(true);
    expect(canTransitionAppointment('pending_authorization', 'authorized')).toBe(true);
    expect(canTransitionAppointment('authorized', 'scheduled')).toBe(true);
    expect(transitionAppointment('scheduled', 'completed')).toBe('completed');
  });

  it('rejects reopening a completed appointment', () => {
    expect(canTransitionAppointment('completed', 'scheduled')).toBe(false);
    expect(() => transitionAppointment('completed', 'scheduled')).toThrow('Invalid appointment transition');
  });
});

describe('measurement plan validation', () => {
  it('accepts bounded 24-hour times', () => {
    expect(isValidMeasurementTime('00:00')).toBe(true);
    expect(isValidMeasurementTime('23:59')).toBe(true);
    expect(isValidMeasurementTime('24:00')).toBe(false);
    expect(isValidMeasurementTime('12:60')).toBe(false);
    expect(validateMeasurementPlan(3, ['07:30', '13:00', '20:30'])).toBe(true);
    expect(validateMeasurementPlan(3, ['07:30'])).toBe(false);
  });
});

describe('local identifiers', () => {
  it('generates UUID-shaped identifiers for cloud idempotency', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});

describe('medication occurrence state machine', () => {
  it('allows a due occurrence to be acknowledged or skipped', () => {
    expect(canTransitionMedicationOccurrence('due', 'taken')).toBe(true);
    expect(canTransitionMedicationOccurrence('due', 'skipped')).toBe(true);
    expect(transitionMedicationOccurrence('due', 'taken')).toBe('taken');
  });

  it('does not allow a completed occurrence to be changed silently', () => {
    expect(canTransitionMedicationOccurrence('taken', 'skipped')).toBe(false);
    expect(() => transitionMedicationOccurrence('taken', 'skipped')).toThrow('Invalid medication occurrence transition');
  });
});

describe('measurement occurrence state machine', () => {
  it('moves a planned measurement to due or completed', () => {
    expect(canTransitionMeasurementOccurrence('planned', 'due')).toBe(true);
    expect(transitionMeasurementOccurrence('planned', 'completed')).toBe('completed');
  });

  it('keeps completed measurements immutable', () => {
    expect(canTransitionMeasurementOccurrence('completed', 'skipped')).toBe(false);
    expect(() => transitionMeasurementOccurrence('completed', 'skipped')).toThrow('Invalid measurement occurrence transition');
  });
});
