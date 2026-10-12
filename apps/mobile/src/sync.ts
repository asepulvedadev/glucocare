import type { Session } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';
import { markOutboxAcked, markOutboxBlocked, markOutboxFailed, listPendingOutbox, unblockOutboxByEntityType } from './db/outboxRepository';
import { supabase } from './supabase';
import type { Json } from './types/supabase';
import { getLastPulledAt } from './db/syncMetadataRepository';
import { pullCloudData } from './syncPull';
import { resolveSyncConflictsForEntity } from './db/syncConflictRepository';
import { getPrivacyConsent } from './db/privacyRepository';
import { canUploadEventForConsent, cloudTrustedContactConsentStatus } from './syncConsent';

type SyncResult = {
  state: 'synced' | 'disabled' | 'signed_out' | 'consent_required' | 'failed';
  uploaded: number;
  failed: number;
  downloaded: number;
};

function toUnit(unit: unknown) {
  return unit === 'mmol/L' ? 'mmol_l' : 'mg_dl';
}

function toContext(context: unknown) {
  return ['fasting', 'before_meal', 'after_meal', 'bedtime'].includes(String(context)) ? String(context) : 'other';
}

function toSource(source: unknown) {
  return ['manual', 'import', 'cgm', 'glucometer'].includes(String(source)) ? String(source) : 'manual';
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

async function uploadEvent(event: Awaited<ReturnType<typeof listPendingOutbox>>[number], patientId: string) {
  if (!supabase) throw new Error('Cloud sync is not configured.');
  const payload = event.payload;
  switch (event.entityType) {
    case 'glucose_reading': {
      if (!isUuid(event.entityId)) throw new Error('Legacy local id cannot be synced.');
      const glucosePayload = payload.after && typeof payload.after === 'object' && !Array.isArray(payload.after) ? payload.after as Record<string, unknown> : payload;
      const { error } = await supabase.from('glucose_readings').upsert({
        id: event.entityId, patient_id: patientId, value_original: Number(glucosePayload.value), unit_original: toUnit(glucosePayload.unit),
        measured_at: stringValue(glucosePayload.recordedAt, new Date().toISOString()), recorded_at: stringValue(glucosePayload.recordedAt, new Date().toISOString()),
        timezone: stringValue(glucosePayload.timezone, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'), utc_offset_minutes: typeof glucosePayload.utcOffsetMinutes === 'number' ? glucosePayload.utcOffsetMinutes : null, time_edited: glucosePayload.timeEdited === true, context: toContext(glucosePayload.context), source: toSource(glucosePayload.source), meal_offset_minutes: typeof glucosePayload.mealOffsetMinutes === 'number' ? glucosePayload.mealOffsetMinutes : null,
        symptoms: glucosePayload.symptoms ? [String(glucosePayload.symptoms)] : [], note: glucosePayload.note ? String(glucosePayload.note) : null,
        classification: glucosePayload.riskClassification ? String(glucosePayload.riskClassification) : null,
      });
      if (error) throw error;
      if (event.eventType === 'glucose.reading.corrected.v1') {
        const { error: auditError } = await supabase.functions.invoke('record-glucose-audit', {
          body: {
            eventId: event.id,
            readingId: event.entityId,
            occurredAt: payload.occurredAt,
            action: payload.action,
            reason: payload.reason,
            before: payload.before,
            after: payload.after,
          },
        });
        if (auditError) throw auditError;
      }
      return;
    }
    case 'medication': {
      if (!isUuid(event.entityId)) throw new Error('Legacy local id cannot be synced.');
      const { error } = await supabase.from('medications').upsert({
        id: event.entityId, patient_id: patientId, name: stringValue(payload.name), dose_text: stringValue(payload.doseText),
        route: stringValue(payload.route, 'other'), prescriber_name: payload.prescriberName ? String(payload.prescriberName) : null,
        instructions: payload.instructions ? String(payload.instructions) : null, start_date: payload.startDate ? String(payload.startDate) : null,
        end_date: payload.endDate ? String(payload.endDate) : null, enabled: payload.enabled !== false, created_at: stringValue(payload.createdAt, new Date().toISOString()),
      });
      if (error) throw error;
      const timesJson = Array.isArray(payload.times) && payload.times.length
        ? payload.times.map(String)
        : [`${String(payload.hour ?? 0).padStart(2, '0')}:${String(payload.minute ?? 0).padStart(2, '0')}`];
      const schedule = await supabase.from('medication_schedule_revisions').upsert({
        id: event.id, medication_id: event.entityId, patient_id: patientId, revision_number: 1, times_json: timesJson,
      }, { onConflict: 'medication_id,revision_number' });
      if (schedule.error) throw schedule.error;
      return;
    }
    case 'medication_occurrence': {
      if (!isUuid(event.entityId)) throw new Error('Legacy local id cannot be synced.');
      const medicationId = stringValue(payload.medicationId);
      if (!isUuid(medicationId)) throw new Error('Medication occurrence has no valid medication id.');
      const schedule = await supabase.from('medication_schedule_revisions').select('id').eq('medication_id', medicationId).order('revision_number', { ascending: false }).limit(1).maybeSingle();
      if (schedule.error) throw schedule.error;
      if (!schedule.data) throw new Error('Medication schedule has not synced yet.');
      const { error } = await supabase.from('medication_occurrences').upsert({
        id: event.entityId, patient_id: patientId, medication_id: medicationId, schedule_revision_id: schedule.data.id,
        scheduled_at: stringValue(payload.scheduledAt, new Date().toISOString()),
        status: stringValue(payload.status, 'due') as 'due' | 'taken' | 'skipped' | 'snoozed' | 'expired' | 'not_recorded',
        acted_at: payload.actedAt ? String(payload.actedAt) : null,
      }, { onConflict: 'id' });
      if (error) throw error;
      return;
    }
    case 'appointment': {
      if (!isUuid(event.entityId)) throw new Error('Legacy local id cannot be synced.');
      const scheduledAt = payload.scheduledAt ? String(payload.scheduledAt) : null;
      const { error } = await supabase.from('appointments').upsert({
        id: event.entityId, patient_id: patientId, title: stringValue(payload.title), provider: stringValue(payload.provider),
        specialty: payload.specialty ? String(payload.specialty) : null,
        insurer: payload.insurer ? String(payload.insurer) : null,
        authorization_number: payload.authorizationNumber ? String(payload.authorizationNumber) : null,
        facility: payload.facility ? String(payload.facility) : null,
        status: stringValue(payload.status, 'requested') as 'requested' | 'pending_authorization' | 'authorized' | 'scheduled' | 'completed' | 'missed' | 'denied' | 'cancelled',
        requested_at: payload.requestedAt ? String(payload.requestedAt) : stringValue(payload.createdAt, new Date().toISOString()),
        scheduled_at: scheduledAt, location: payload.location ? String(payload.location) : null, virtual_url: payload.virtualUrl ? String(payload.virtualUrl) : null,
        preparation_notes: payload.preparationNotes ? String(payload.preparationNotes) : payload.notes ? String(payload.notes) : null,
        created_at: stringValue(payload.createdAt, new Date().toISOString()),
      });
      if (error) throw error;
      return;
    }
    case 'measurement_plan': {
      const times = Array.isArray(payload.times) ? payload.times.map(String) : [];
      const { error } = await supabase.from('measurement_plan_revisions').upsert({
        patient_id: patientId, revision_number: 1, readings_per_day: Number(payload.readingsPerDay), times_json: times,
        timings_json: Array.isArray(payload.timings) ? payload.timings.map(String) : [], windows_json: Array.isArray(payload.windows) ? payload.windows as Json : [], weekdays_json: Array.isArray(payload.weekdays) ? payload.weekdays.map(Number) : [1, 2, 3, 4, 5, 6, 7], effective_from: payload.effectiveFrom ? String(payload.effectiveFrom) : undefined, effective_to: payload.effectiveTo ? String(payload.effectiveTo) : null, instructions: payload.instructions ? String(payload.instructions) : null, source: 'patient_entered',
      }, { onConflict: 'patient_id,revision_number' });
      if (error) throw error;
      return;
    }
    case 'meal_event': {
      if (!isUuid(event.entityId)) throw new Error('Legacy local id cannot be synced.');
      const { error } = await supabase.from('meal_events').upsert({
        id: event.entityId,
        patient_id: patientId,
        meal_type: stringValue(payload.mealType, 'snack') as 'breakfast' | 'lunch' | 'dinner' | 'snack',
        occurred_at: stringValue(payload.occurredAt, new Date().toISOString()),
        note: payload.note ? String(payload.note) : null,
        created_at: stringValue(payload.createdAt, new Date().toISOString()),
      }, { onConflict: 'id' });
      if (error) throw error;
      return;
    }
    case 'measurement_occurrence': {
      if (!isUuid(event.entityId)) throw new Error('Legacy local id cannot be synced.');
      const plan = await supabase.from('measurement_plan_revisions').select('id').eq('patient_id', patientId).order('revision_number', { ascending: false }).limit(1).maybeSingle();
      if (plan.error) throw plan.error;
      if (!plan.data) throw new Error('Measurement plan has not synced yet.');
      const { error } = await supabase.from('measurement_occurrences').upsert({
        id: event.entityId, patient_id: patientId, plan_revision_id: plan.data.id,
        scheduled_at: stringValue(payload.scheduledAt, new Date().toISOString()),
        window_index: typeof payload.windowIndex === 'number' ? payload.windowIndex : null,
        meal_event_id: payload.mealEventId ? String(payload.mealEventId) : null,
        status: stringValue(payload.status, 'planned') as 'planned' | 'due' | 'completed' | 'skipped' | 'expired',
        completed_reading_id: payload.completedReadingId ? String(payload.completedReadingId) : null,
        completed_at: payload.completedAt ? String(payload.completedAt) : null,
      }, { onConflict: 'id' });
      if (error) throw error;
      return;
    }
    case 'care_plan': {
      const { error } = await supabase.from('care_plan_revisions').upsert({
        patient_id: patientId,
        revision_number: 1,
        effective_from: stringValue(payload.updatedAt, new Date().toISOString()),
        target_bands: {
          low: payload.lowThreshold ?? null,
          urgent_low: payload.urgentLowThreshold ?? null,
          high: payload.highThreshold ?? null,
          urgent_high: payload.urgentHighThreshold ?? null,
        } as Json,
        symptom_actions: payload.instructions ? [String(payload.instructions)] : [],
        source: payload.clinicianVerified ? 'clinician_verified' : 'patient_entered',
        effective_to: payload.effectiveTo ? String(payload.effectiveTo) : null,
        clinician_verified: payload.clinicianVerified === true,
      }, { onConflict: 'patient_id,revision_number' });
      if (error) throw error;
      return;
    }
    case 'emergency_card': {
      const { error } = await supabase.from('emergency_cards').upsert({
        patient_id: patientId, full_name: stringValue(payload.fullName), birth_date: payload.birthDate ? String(payload.birthDate) : null,
        diabetes_type: payload.diabetesType ? String(payload.diabetesType) : null, diagnosis_year: payload.diagnosisYear ? String(payload.diagnosisYear) : null, insulin_use: payload.insulinUse ? String(payload.insulinUse) : null, allergies: payload.allergies ? String(payload.allergies) : null, critical_conditions: payload.criticalConditions ? String(payload.criticalConditions) : null,
        care_provider: payload.careProvider ? String(payload.careProvider) : null, care_facility: payload.careFacility ? String(payload.careFacility) : null, insurer: payload.insurer ? String(payload.insurer) : null, policy_number: payload.policyNumber ? String(payload.policyNumber) : null, emergency_number: payload.emergencyNumber ? String(payload.emergencyNumber) : null, emergency_region: payload.emergencyRegion ? String(payload.emergencyRegion) : null, emergency_notes: payload.emergencyNotes ? String(payload.emergencyNotes) : null,
      }, { onConflict: 'patient_id' });
      if (error) throw error;
      return;
    }
    case 'trusted_contact': {
      if (!isUuid(event.entityId)) throw new Error('Legacy local id cannot be synced.');
      const { error } = await supabase.from('trusted_contacts').upsert({
        id: event.entityId, patient_id: patientId, name: stringValue(payload.name), relationship: payload.relationship ? String(payload.relationship) : null,
        phone: payload.phone ? String(payload.phone) : null, email: payload.email ? String(payload.email) : null,
        // The client can request or revoke consent, but cannot self-assert an
        // accepted invitation. Only the private invitation function may
        // transition a remote contact to `accepted`.
        consent_status: cloudTrustedContactConsentStatus(payload),
      }, { onConflict: 'id' });
      if (error) throw error;
      return;
    }
    case 'emergency_incident': {
      const { error } = await supabase.from('emergency_incidents').upsert({
        id: event.entityId, patient_id: patientId, occurred_at: stringValue(payload.createdAt, new Date().toISOString()), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', trigger: 'manual',
      }, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
      return;
    }
    default: throw new Error(`Unsupported sync entity: ${event.entityType}`);
  }
}

export async function syncPendingData(db: SQLiteDatabase, session: Session | null): Promise<SyncResult> {
  if (!supabase) return { state: 'disabled', uploaded: 0, failed: 0, downloaded: 0 };
  if (!session?.user.id) return { state: 'signed_out', uploaded: 0, failed: 0, downloaded: 0 };
  const consent = await getPrivacyConsent(db);
  if (!consent?.localDataConsent || !consent.cloudSyncConsent) return { state: 'consent_required', uploaded: 0, failed: 0, downloaded: 0 };
  if (consent.emergencySharingConsent) await unblockOutboxByEntityType(db, 'trusted_contact');

  const { error: patientError } = await supabase.from('patients').upsert({ id: session.user.id, display_name: session.user.email ?? '' }, { onConflict: 'id', ignoreDuplicates: true });
  if (patientError) throw patientError;

  let downloaded = 0;
  let failed = 0;

  // Pull before upload so an existing remote edit is surfaced as a conflict
  // while the local event is still pending. The local event remains the
  // deterministic winner and is uploaded only after the user-visible record
  // has been preserved locally.
  try {
    downloaded += await pullCloudData(db, session.user.id, await getLastPulledAt(db));
  } catch {
    failed += 1;
  }

  const pending = await listPendingOutbox(db);
  let uploaded = 0;
  for (const event of pending) {
    if (!canUploadEventForConsent(event, consent)) {
      await markOutboxBlocked(db, event.id);
      continue;
    }
    try {
      await uploadEvent(event, session.user.id);

      const { error: eventError } = await supabase.from('outbox_events').upsert({
        id: event.id,
        patient_id: session.user.id,
        aggregate_type: event.entityType,
        aggregate_id: event.entityId,
        event_type: event.eventType,
        schema_version: 1,
        payload: event.payload as unknown as Json,
        status: 'acked',
        acknowledged_at: new Date().toISOString(),
      });
      if (eventError) throw eventError;

      if (event.entityType === 'glucose_reading') {
        await db.runAsync(`UPDATE glucose_readings SET sync_state = 'synced' WHERE id = ?`, event.entityId);
      }
      await markOutboxAcked(db, event.id);
      await resolveSyncConflictsForEntity(db, event.entityType, event.entityId, 'local');
      uploaded += 1;
    } catch {
      await markOutboxFailed(db, event.id, event.attemptCount + 1);
      if (event.entityType === 'glucose_reading') {
        await db.runAsync(`UPDATE glucose_readings SET sync_state = 'failed' WHERE id = ?`, event.entityId);
      }
      failed += 1;
    }
  }
  try {
    downloaded += await pullCloudData(db, session.user.id, await getLastPulledAt(db));
  } catch {
    failed += 1;
  }
  return { state: failed > 0 ? 'failed' : 'synced', uploaded, failed, downloaded };
}
