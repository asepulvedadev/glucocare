import type { Session } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';
import { markOutboxAcked, markOutboxFailed, listPendingOutbox } from './db/outboxRepository';
import { supabase } from './supabase';
import type { Json } from './types/supabase';
import { getLastPulledAt } from './db/syncMetadataRepository';
import { pullCloudData } from './syncPull';
import { resolveSyncConflictsForEntity } from './db/syncConflictRepository';
import { getPrivacyConsent } from './db/privacyRepository';

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
      const { error } = await supabase.from('glucose_readings').upsert({
        id: event.entityId, patient_id: patientId, value_original: Number(payload.value), unit_original: toUnit(payload.unit),
        measured_at: stringValue(payload.recordedAt, new Date().toISOString()), recorded_at: stringValue(payload.recordedAt, new Date().toISOString()),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', context: toContext(payload.context),
        symptoms: payload.symptoms ? [String(payload.symptoms)] : [], note: payload.note ? String(payload.note) : null,
        classification: payload.riskClassification ? String(payload.riskClassification) : null,
      });
      if (error) throw error;
      return;
    }
    case 'medication': {
      if (!isUuid(event.entityId)) throw new Error('Legacy local id cannot be synced.');
      const { error } = await supabase.from('medications').upsert({
        id: event.entityId, patient_id: patientId, name: stringValue(payload.name), dose_text: stringValue(payload.doseText),
        route: stringValue(payload.route, 'other'), enabled: payload.enabled !== false, created_at: stringValue(payload.createdAt, new Date().toISOString()),
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
        status: stringValue(payload.status, 'requested') as 'requested' | 'pending_authorization' | 'authorized' | 'scheduled' | 'completed' | 'missed' | 'denied' | 'cancelled',
        scheduled_at: scheduledAt, location: payload.location ? String(payload.location) : null, preparation_notes: payload.notes ? String(payload.notes) : null,
        created_at: stringValue(payload.createdAt, new Date().toISOString()),
      });
      if (error) throw error;
      return;
    }
    case 'measurement_plan': {
      const times = Array.isArray(payload.times) ? payload.times.map(String) : [];
      const { error } = await supabase.from('measurement_plan_revisions').upsert({
        patient_id: patientId, revision_number: 1, readings_per_day: Number(payload.readingsPerDay), times_json: times,
        instructions: payload.instructions ? String(payload.instructions) : null, source: 'patient_entered',
      }, { onConflict: 'patient_id,revision_number' });
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
      const revoked = payload.revoked === true;
      const { error } = await supabase.from('trusted_contacts').upsert({
        id: event.entityId, patient_id: patientId, name: stringValue(payload.name), relationship: payload.relationship ? String(payload.relationship) : null,
        phone: payload.phone ? String(payload.phone) : null, email: payload.email ? String(payload.email) : null,
        consent_status: revoked ? 'revoked' : payload.consentGranted ? 'accepted' : 'pending',
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
