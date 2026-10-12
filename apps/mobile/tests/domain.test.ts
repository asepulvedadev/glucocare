import { describe, expect, it } from 'vitest';
import { availableAppointmentTransitions, canTransitionAppointment, isTerminalAppointmentStatus, transitionAppointment } from '../src/domain/appointmentState';
import { isMeasurementPlanActive, isValidMeasurementTime, validateMeasurementPlan, validateMeasurementWindows } from '../src/domain/measurementPlan';
import { isMedicationActive, isValidMedicationDate } from '../src/domain/medication';
import { newId } from '../src/ids';
import { canTransitionMedicationOccurrence, transitionMedicationOccurrence } from '../src/domain/medicationOccurrenceState';
import { canTransitionMeasurementOccurrence, transitionMeasurementOccurrence } from '../src/domain/measurementOccurrenceState';
import { classifyGlucose, isCarePlanExpired, validateCarePlanThresholds } from '../src/domain/glucoseRisk';
import { conversionVersionForUnit, summarizeGlucose, toCanonicalMgDl, toMgDl } from '../src/domain/glucoseSummary';
import { hasUrgentSymptoms, isImplausibleGlucoseValue, URGENT_SYMPTOM_NOTICE } from '../src/domain/glucoseSafety';
import { getEmergencyConfig } from '../src/config';
import { canUploadEventForConsent, cloudTrustedContactConsentStatus } from '../src/syncConsent';
import { medicationReminderDates } from '../src/domain/medicationReminder';
import { measurementReminderDates } from '../src/domain/measurementReminder';
import { MAX_PENDING_LOCAL_REMINDERS, selectNotificationCandidates } from '../src/domain/notificationSchedule';

describe('appointment state machine', () => {
  it('allows the requested-to-scheduled path through authorization', () => {
    expect(canTransitionAppointment('requested', 'pending_authorization')).toBe(true);
    expect(canTransitionAppointment('requested', 'authorized')).toBe(true);
    expect(canTransitionAppointment('pending_authorization', 'authorized')).toBe(true);
    expect(canTransitionAppointment('authorized', 'scheduled')).toBe(true);
    expect(transitionAppointment('scheduled', 'completed')).toBe('completed');
  });

  it('preserves denied and missed outcomes without silently reopening care', () => {
    expect(transitionAppointment('pending_authorization', 'denied')).toBe('denied');
    expect(transitionAppointment('scheduled', 'missed')).toBe('missed');
    expect(canTransitionAppointment('denied', 'requested')).toBe(true);
    expect(canTransitionAppointment('missed', 'requested')).toBe(true);
  });

  it('identifies states that must not keep reminders scheduled', () => {
    expect(isTerminalAppointmentStatus('completed')).toBe(true);
    expect(isTerminalAppointmentStatus('missed')).toBe(true);
    expect(isTerminalAppointmentStatus('denied')).toBe(true);
    expect(isTerminalAppointmentStatus('requested')).toBe(false);
  });

  it('rejects reopening a completed appointment', () => {
    expect(canTransitionAppointment('completed', 'scheduled')).toBe(false);
    expect(() => transitionAppointment('completed', 'scheduled')).toThrow('Invalid appointment transition');
  });

  it('exposes only valid next actions for the appointment UI', () => {
    expect(availableAppointmentTransitions('requested')).toEqual(['pending_authorization', 'authorized', 'cancelled']);
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
    expect(validateMeasurementPlan(3, ['07:30', '13:00', '20:30'], ['fasting', 'after_meal', 'after_meal'])).toBe(true);
    expect(validateMeasurementPlan(3, ['07:30'])).toBe(false);
    expect(validateMeasurementPlan(2, ['07:30', '20:30'], ['fasting'])).toBe(false);
    expect(validateMeasurementPlan(1, ['08:00'], ['fasting'], { weekdays: [1, 3, 5], effectiveFrom: '2026-10-01', effectiveTo: '2026-10-31' })).toBe(true);
    expect(validateMeasurementPlan(1, ['08:00'], ['fasting'], { weekdays: [1, 1] })).toBe(false);
    expect(isMeasurementPlanActive({ weekdays: [1, 3, 5], effectiveFrom: '2026-10-01', effectiveTo: '2026-10-31' }, new Date('2026-10-05T12:00:00-05:00'))).toBe(true);
    expect(isMeasurementPlanActive({ weekdays: [1, 3, 5], effectiveFrom: '2026-10-01', effectiveTo: '2026-10-31' }, new Date('2026-10-06T12:00:00-05:00'))).toBe(false);
  });

  it('validates explicit meal-relative windows without inferring a meal', () => {
    expect(validateMeasurementWindows(2, [
      { kind: 'fixed', time: '07:30', timing: 'fasting' },
      { kind: 'meal_relative', meal: 'lunch', offsetMinutes: 120, timing: 'after_meal' },
    ])).toBe(true);
    expect(validateMeasurementWindows(1, [
      { kind: 'meal_relative', meal: 'dinner', offsetMinutes: 1441, timing: 'after_meal' },
    ])).toBe(false);
    expect(validateMeasurementWindows(1, [
      { kind: 'meal_relative', meal: 'breakfast', offsetMinutes: 60.5, timing: 'after_meal' },
    ])).toBe(false);
  });
});

describe('local identifiers', () => {
  it('generates UUID-shaped identifiers for cloud idempotency', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});

describe('medication occurrence state machine', () => {
  it('honors medication validity windows before generating reminders', () => {
    const medication = { enabled: true, startDate: '2026-10-10', endDate: '2026-10-12' };
    expect(isMedicationActive(medication, new Date('2026-10-09T12:00:00-05:00'))).toBe(false);
    expect(isMedicationActive(medication, new Date('2026-10-12T12:00:00-05:00'))).toBe(true);
    expect(isMedicationActive(medication, new Date('2026-10-13T12:00:00-05:00'))).toBe(false);
    expect(isMedicationActive({ ...medication, enabled: false }, new Date('2026-10-11T12:00:00-05:00'))).toBe(false);
    expect(isValidMedicationDate('2026-02-28')).toBe(true);
    expect(isValidMedicationDate('2026-02-29')).toBe(false);
  });

  it('allows a due occurrence to be acknowledged or skipped', () => {
    expect(canTransitionMedicationOccurrence('due', 'taken')).toBe(true);
    expect(canTransitionMedicationOccurrence('due', 'skipped')).toBe(true);
    expect(transitionMedicationOccurrence('due', 'taken')).toBe('taken');
  });

  it('expires due and snoozed occurrences without reopening terminal records', () => {
    expect(transitionMedicationOccurrence('due', 'expired')).toBe('expired');
    expect(transitionMedicationOccurrence('snoozed', 'expired')).toBe('expired');
    expect(canTransitionMedicationOccurrence('expired', 'due')).toBe(false);
  });

  it('does not allow a planned dose to be acknowledged before it is due', () => {
    expect(transitionMedicationOccurrence('planned', 'due')).toBe('due');
    expect(canTransitionMedicationOccurrence('planned', 'taken')).toBe(false);
    expect(canTransitionMedicationOccurrence('planned', 'snoozed')).toBe(false);
  });

  it('does not allow a completed occurrence to be changed silently', () => {
    expect(canTransitionMedicationOccurrence('taken', 'skipped')).toBe(false);
    expect(() => transitionMedicationOccurrence('taken', 'skipped')).toThrow('Invalid medication occurrence transition');
  });
});

describe('bounded medication reminder schedule', () => {
  it('does not schedule before the start date or after the end date', () => {
    const dates = medicationReminderDates({ enabled: true, startDate: '2026-10-15', endDate: '2026-10-16', hour: 8, minute: 0, times: ['08:00', '20:00'] }, new Date('2026-10-12T12:00:00-05:00'), 90);
    expect(dates).toHaveLength(4);
    expect(dates.every((date) => date.getFullYear() === 2026 && date.getMonth() === 9 && [15, 16].includes(date.getDate()))).toBe(true);
  });

  it('skips a time already passed today and caps an open-ended plan', () => {
    const dates = medicationReminderDates({ enabled: true, hour: 8, minute: 0, times: ['08:00', '20:00'] }, new Date('2026-10-12T12:00:00-05:00'), 3);
    expect(dates).toHaveLength(5);
    expect(dates[0].getHours()).toBe(20);
    expect(dates.at(-1)?.getDate()).toBe(14);
  });

  it('returns no schedule for disabled or invalid medication dates', () => {
    expect(medicationReminderDates({ enabled: false, hour: 8, minute: 0 }, new Date('2026-10-12T12:00:00-05:00'))).toEqual([]);
    expect(medicationReminderDates({ enabled: true, startDate: '2026-02-30', hour: 8, minute: 0 }, new Date('2026-10-12T12:00:00-05:00'))).toEqual([]);
  });
});

describe('measurement reminder schedule', () => {
  it('schedules fixed windows only on active weekdays within the horizon', () => {
    const dates = measurementReminderDates({ id: 'default', readingsPerDay: 1, times: ['08:00'], timings: ['fasting'], weekdays: [1], updatedAt: '2026-10-12T00:00:00.000Z' }, [], new Date('2026-10-12T06:00:00-05:00'), 3);
    expect(dates).toHaveLength(1);
    expect(dates[0].windowIndex).toBe(0);
    expect(dates[0].scheduledAt.getDay()).toBe(1);
  });

  it('anchors meal-relative reminders to explicit meal events', () => {
    const dates = measurementReminderDates({ id: 'default', readingsPerDay: 1, times: ['08:00'], windows: [{ kind: 'meal_relative', meal: 'lunch', offsetMinutes: 120, timing: 'after_meal' }], weekdays: [1, 2, 3, 4, 5, 6, 7], updatedAt: '2026-10-12T00:00:00.000Z' }, [{ id: 'meal-1', mealType: 'lunch', occurredAt: '2026-10-12T12:00:00-05:00', createdAt: '2026-10-12T12:00:00-05:00', syncState: 'local' }], new Date('2026-10-12T12:30:00-05:00'), 3);
    expect(dates).toHaveLength(1);
    expect(dates[0].mealEventId).toBe('meal-1');
    expect(dates[0].scheduledAt.getHours()).toBe(14);
  });
});

describe('shared native notification budget', () => {
  it('deduplicates candidates and keeps the earliest reminders within the device budget', () => {
    const first = new Date('2026-10-12T08:00:00-05:00');
    const candidates = Array.from({ length: MAX_PENDING_LOCAL_REMINDERS + 5 }, (_, index) => ({
      key: `medication:one:${index < 2 ? first.toISOString() : index}`,
      kind: 'medication' as const,
      ownerId: 'one',
      scheduledAt: new Date(first.getTime() + index * 60_000),
    }));
    const selected = selectNotificationCandidates(candidates);
    expect(selected).toHaveLength(MAX_PENDING_LOCAL_REMINDERS);
    expect(selected[0].scheduledAt).toEqual(first);
    expect(new Set(selected.map((candidate) => candidate.key)).size).toBe(MAX_PENDING_LOCAL_REMINDERS);
    expect(selectNotificationCandidates(candidates, 0)).toEqual([]);
  });
});

describe('measurement occurrence state machine', () => {
  it('moves a planned measurement to due or completed', () => {
    expect(canTransitionMeasurementOccurrence('planned', 'due')).toBe(true);
    expect(canTransitionMeasurementOccurrence('planned', 'completed')).toBe(false);
    expect(transitionMeasurementOccurrence('due', 'completed')).toBe('completed');
  });

  it('does not allow acknowledging a future measurement window early', () => {
    expect(canTransitionMeasurementOccurrence('planned', 'skipped')).toBe(false);
    expect(() => transitionMeasurementOccurrence('planned', 'skipped')).toThrow('Invalid measurement occurrence transition');
  });

  it('expires planned and due measurements when their window is no longer valid', () => {
    expect(transitionMeasurementOccurrence('planned', 'expired')).toBe('expired');
    expect(transitionMeasurementOccurrence('due', 'expired')).toBe('expired');
    expect(canTransitionMeasurementOccurrence('expired', 'planned')).toBe(false);
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

  it('stops applying thresholds after the plan expiry date', () => {
    const expired = { id: 'default' as const, ...plan, clinicianVerified: true, updatedAt: '2026-01-01T00:00:00.000Z', effectiveTo: '2026-01-31T23:59:59.000Z' };
    expect(isCarePlanExpired(expired, new Date('2026-02-01T00:00:00.000Z'))).toBe(true);
    expect(classifyGlucose(50, 'mg/dL', expired)).toBe('unclassified');
  });
});

describe('symptom safety escalation', () => {
  it('preserves an explicit severe-symptom signal independently of glucose value', () => {
    expect(hasUrgentSymptoms(URGENT_SYMPTOM_NOTICE)).toBe(true);
    expect(hasUrgentSymptoms(`${URGENT_SYMPTOM_NOTICE}. Me siento confundido`)).toBe(true);
    expect(hasUrgentSymptoms('Cansancio leve')).toBe(false);
  });

  it('asks for confirmation instead of silently accepting an implausibly high entry', () => {
    expect(isImplausibleGlucoseValue(600, 'mg/dL')).toBe(false);
    expect(isImplausibleGlucoseValue(601, 'mg/dL')).toBe(true);
    expect(isImplausibleGlucoseValue(33.3, 'mmol/L')).toBe(false);
    expect(isImplausibleGlucoseValue(33.31, 'mmol/L')).toBe(true);
  });
});

describe('emergency configuration', () => {
  it('prefers a patient-verified number and region over the launch default', () => {
    expect(getEmergencyConfig({ emergencyNumber: '911', emergencyRegion: 'Ciudad demo' })).toEqual({ number: '911', region: 'Ciudad demo' });
  });

  it('keeps the reviewed launch fallback when the card is incomplete', () => {
    const config = getEmergencyConfig({ emergencyNumber: '  ', emergencyRegion: '' });
    expect(config.number).toBeTruthy();
    expect(config.region).toBeTruthy();
  });
});

describe('consent-aware cloud sync', () => {
  const consent = { id: 'default' as const, policyVersion: '2026-10-12', localDataConsent: true, cloudSyncConsent: true, emergencySharingConsent: false, updatedAt: '2026-10-12T00:00:00.000Z' };

  it('blocks trusted-contact data while emergency sharing is disabled', () => {
    expect(canUploadEventForConsent({ entityType: 'trusted_contact', payload: { name: 'Support' } }, consent)).toBe(false);
    expect(canUploadEventForConsent({ entityType: 'glucose_reading', payload: { value: 100 } }, consent)).toBe(true);
  });

  it('allows a contact revocation to reach the cloud even after consent is withdrawn', () => {
    expect(canUploadEventForConsent({ entityType: 'trusted_contact', payload: { revoked: true } }, consent)).toBe(true);
  });

  it('never lets a client self-assert accepted remote consent', () => {
    expect(cloudTrustedContactConsentStatus({ consentGranted: true })).toBe('pending');
    expect(cloudTrustedContactConsentStatus({ revoked: true })).toBe('revoked');
  });
});

describe('glucose history summary', () => {
  const now = new Date('2026-10-12T12:00:00.000Z');

  it('normalizes mmol/L and summarizes only the selected window', () => {
    expect(toMgDl(10, 'mmol/L')).toBeCloseTo(180.182);
    expect(toCanonicalMgDl(10, 'mmol/L')).toBe(180.18);
    expect(conversionVersionForUnit('mmol/L')).toBe('fixed-18.0182-v1');
    expect(conversionVersionForUnit('mg/dL')).toBe('identity-mgdl-v1');
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
