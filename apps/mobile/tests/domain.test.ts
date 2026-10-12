import { describe, expect, it } from 'vitest';
import { availableAppointmentTransitions, canTransitionAppointment, transitionAppointment } from '../src/domain/appointmentState';
import { isValidMeasurementTime, validateMeasurementPlan } from '../src/domain/measurementPlan';
import { newId } from '../src/ids';
import { canTransitionMedicationOccurrence, transitionMedicationOccurrence } from '../src/domain/medicationOccurrenceState';
import { canTransitionMeasurementOccurrence, transitionMeasurementOccurrence } from '../src/domain/measurementOccurrenceState';
import { classifyGlucose, validateCarePlanThresholds } from '../src/domain/glucoseRisk';
import { summarizeGlucose, toMgDl } from '../src/domain/glucoseSummary';
import { hasUrgentSymptoms, URGENT_SYMPTOM_NOTICE } from '../src/domain/glucoseSafety';

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

  it('exposes only valid next actions for the appointment UI', () => {
    expect(availableAppointmentTransitions('authorized')).toEqual(['scheduled', 'cancelled']);
    expect(availableAppointmentTransitions('completed')).toEqual([]);
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

describe('clinician-provided glucose risk plan', () => {
  const plan = { urgentLowThreshold: 54, lowThreshold: 70, highThreshold: 180, urgentHighThreshold: 250 };

  it('requires strictly ordered thresholds and classifies without inventing defaults', () => {
    expect(validateCarePlanThresholds(plan)).toBe(true);
    expect(classifyGlucose(50, 'mg/dL', { id: 'default', ...plan, clinicianVerified: true, updatedAt: new Date().toISOString() })).toBe('urgent_low');
    expect(classifyGlucose(10, 'mg/dL', null)).toBe('unclassified');
  });

  it('converts mmol/L using an explicit fixed conversion for comparison', () => {
    expect(classifyGlucose(10.5, 'mmol/L', { id: 'default', ...plan, clinicianVerified: true, updatedAt: new Date().toISOString() })).toBe('high');
  });
});

describe('symptom safety escalation', () => {
  it('preserves an explicit severe-symptom signal independently of glucose value', () => {
    expect(hasUrgentSymptoms(URGENT_SYMPTOM_NOTICE)).toBe(true);
    expect(hasUrgentSymptoms(`${URGENT_SYMPTOM_NOTICE}. Me siento confundido`)).toBe(true);
    expect(hasUrgentSymptoms('Cansancio leve')).toBe(false);
  });
});

describe('glucose history summary', () => {
  const now = new Date('2026-10-12T12:00:00.000Z');

  it('normalizes mmol/L and summarizes only the selected window', () => {
    expect(toMgDl(10, 'mmol/L')).toBeCloseTo(180.182);
    const summary = summarizeGlucose([
      { id: 'old', value: 100, unit: 'mg/dL', context: 'fasting', recordedAt: '2026-10-01T12:00:00.000Z', syncState: 'synced' },
      { id: 'one', value: 5, unit: 'mmol/L', context: 'fasting', recordedAt: '2026-10-09T12:00:00.000Z', syncState: 'local' },
      { id: 'two', value: 7, unit: 'mmol/L', context: 'after_meal', recordedAt: '2026-10-12T10:00:00.000Z', syncState: 'pending' },
    ], now);
    expect(summary.count).toBe(2);
    expect(summary.minimumMgDl).toBeCloseTo(90.091);
    expect(summary.maximumMgDl).toBeCloseTo(126.1274);
    expect(summary.trend).toBe('higher');
  });

  it('returns an explicit empty state instead of inventing an average', () => {
    expect(summarizeGlucose([], now)).toEqual({ count: 0, trend: 'none', points: [] });
  });
});
