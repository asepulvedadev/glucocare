import type { SQLiteDatabase } from 'expo-sqlite';
import { discardPendingOutboxForEntity } from './outboxRepository';
import { resolveSyncConflictsForEntity, type SyncConflict } from './syncConflictRepository';
import type { GlucoseUnit } from '../types/domain';
import { conversionVersionForUnit, toCanonicalMgDl } from '../domain/glucoseSummary';

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Remote conflict is missing ${field}.`);
  return value;
}

function numberValue(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Remote conflict has an invalid ${field}.`);
  return value;
}

function jsonArray(value: unknown) {
  return JSON.stringify(Array.isArray(value) ? value.map(String) : []);
}

function jsonValueArray(value: unknown) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function dateOnly(value: unknown) {
  return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : null;
}

function localUnit(value: unknown): GlucoseUnit {
  return value === 'mmol_l' ? 'mmol/L' : 'mg/dL';
}

function localSource(value: unknown) {
  return ['manual', 'import', 'cgm', 'glucometer'].includes(String(value)) ? String(value) : 'manual';
}

function localContext(value: unknown) {
  return ['fasting', 'before_meal', 'after_meal', 'bedtime', 'exercise', 'illness', 'symptoms'].includes(String(value)) ? String(value) : 'other';
}

function localRoute(value: unknown) {
  return ['oral', 'injection', 'inhaled', 'topical'].includes(String(value)) ? String(value) : 'other';
}

function localAppointmentStatus(value: unknown) {
  return ['requested', 'pending_authorization', 'authorized', 'scheduled', 'completed', 'missed', 'denied', 'cancelled'].includes(String(value)) ? String(value) : 'requested';
}

function localHelpEventState(value: unknown) {
  const state = String(value);
  return ['queued_local', 'remote_queued', 'call_opened', 'call_unavailable'].includes(state) ? state : 'queued_local';
}

/**
 * Applies the remote side of a user-reviewed conflict and discards only the
 * pending local events for that entity. The caller must obtain explicit user
 * confirmation before invoking this function.
 */
export async function applyRemoteSyncConflict(db: SQLiteDatabase, conflict: SyncConflict) {
  const payload = conflict.remotePayload;
  await db.withTransactionAsync(async () => {
    switch (conflict.entityType) {
      case 'glucose_reading':
        {
        const value = numberValue(payload.value_original, 'value');
        const unit = localUnit(payload.unit_original);
        const canonicalValue = typeof payload.value_mg_dl === 'number' && Number.isFinite(payload.value_mg_dl)
          ? payload.value_mg_dl
          : toCanonicalMgDl(value, unit);
        const conversionVersion = typeof payload.conversion_version === 'string'
          ? payload.conversion_version
          : conversionVersionForUnit(unit);
        await db.runAsync(
          `INSERT INTO glucose_readings (id, value, unit, value_mg_dl, conversion_version, context, source, meal_offset_minutes, recorded_at, timezone, utc_offset_minutes, time_edited, symptoms, note, ketone_result, sync_state, risk_classification)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?)
           ON CONFLICT(id) DO UPDATE SET value = excluded.value, unit = excluded.unit, value_mg_dl = excluded.value_mg_dl, conversion_version = excluded.conversion_version, context = excluded.context, source = excluded.source, meal_offset_minutes = excluded.meal_offset_minutes, recorded_at = excluded.recorded_at, timezone = excluded.timezone, utc_offset_minutes = excluded.utc_offset_minutes, time_edited = excluded.time_edited, symptoms = excluded.symptoms, note = excluded.note, ketone_result = excluded.ketone_result, sync_state = 'synced', risk_classification = excluded.risk_classification`,
          conflict.entityId, value, unit, canonicalValue, conversionVersion, localContext(payload.context), localSource(payload.source), typeof payload.meal_offset_minutes === 'number' ? payload.meal_offset_minutes : null, requiredString(payload.measured_at, 'measured_at'), payload.timezone ? String(payload.timezone) : null, typeof payload.utc_offset_minutes === 'number' ? payload.utc_offset_minutes : null, payload.time_edited === true, Array.isArray(payload.symptoms) ? payload.symptoms.map(String).join(', ') : null, payload.note ? String(payload.note) : null, ['not_checked', 'negative', 'trace', 'small', 'moderate', 'large', 'unknown'].includes(String(payload.ketone_result)) ? String(payload.ketone_result) : 'unknown', payload.classification ? String(payload.classification) : null,
        );
        }
        break;
      case 'medication':
        {
          const times = Array.isArray(payload.times) ? payload.times.map(String).filter((time) => /^\d{2}:\d{2}$/.test(time)) : [];
          const schedule = jsonObject(payload.schedule);
          const scheduleJson = Object.keys(schedule).length ? JSON.stringify(schedule) : JSON.stringify({ kind: 'fixed', times });
          const firstTime = times[0]?.match(/^(\d{2}):(\d{2})$/);
          if (firstTime) {
            await db.runAsync(
              `UPDATE medications SET name = ?, presentation = ?, dose_text = ?, route = ?, prescriber_name = ?, instructions = ?, start_date = ?, end_date = ?, hour = ?, minute = ?, times_json = ?, schedule_json = ?, enabled = ?, created_at = ? WHERE id = ?`,
              requiredString(payload.name, 'name'), payload.presentation ? String(payload.presentation) : null, requiredString(payload.dose_text, 'dose_text'), localRoute(payload.route), payload.prescriber_name ? String(payload.prescriber_name) : null, payload.instructions ? String(payload.instructions) : null, payload.start_date ? String(payload.start_date) : null, payload.end_date ? String(payload.end_date) : null, Number(firstTime[1]), Number(firstTime[2]), JSON.stringify(times), scheduleJson, payload.enabled === false ? 0 : 1, requiredString(payload.created_at, 'created_at'), conflict.entityId,
            );
          } else {
            await db.runAsync(
              `UPDATE medications SET name = ?, presentation = ?, dose_text = ?, route = ?, prescriber_name = ?, instructions = ?, start_date = ?, end_date = ?, schedule_json = ?, enabled = ?, created_at = ? WHERE id = ?`,
              requiredString(payload.name, 'name'), payload.presentation ? String(payload.presentation) : null, requiredString(payload.dose_text, 'dose_text'), localRoute(payload.route), payload.prescriber_name ? String(payload.prescriber_name) : null, payload.instructions ? String(payload.instructions) : null, payload.start_date ? String(payload.start_date) : null, payload.end_date ? String(payload.end_date) : null, scheduleJson, payload.enabled === false ? 0 : 1, requiredString(payload.created_at, 'created_at'), conflict.entityId,
            );
          }
        }
        break;
      case 'medication_occurrence':
        await db.runAsync(
          `UPDATE medication_occurrences SET scheduled_at = ?, status = ?, acted_at = ? WHERE id = ?`,
          requiredString(payload.scheduled_at, 'scheduled_at'), stringValue(payload.status, 'due'), payload.acted_at ? String(payload.acted_at) : null, conflict.entityId,
        );
        break;
      case 'measurement_plan': {
        const times = jsonArray(payload.times_json);
        const timings = jsonArray(payload.timings_json);
        const weekdays = jsonArray(payload.weekdays_json);
        const windows = jsonValueArray(payload.windows_json);
        await db.runAsync(
          `INSERT INTO measurement_plans (id, readings_per_day, times_json, timings_json, windows_json, weekdays_json, effective_from, effective_to, instructions, updated_at)
           VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET readings_per_day = excluded.readings_per_day, times_json = excluded.times_json, timings_json = excluded.timings_json, windows_json = excluded.windows_json, weekdays_json = excluded.weekdays_json, effective_from = excluded.effective_from, effective_to = excluded.effective_to, instructions = excluded.instructions, updated_at = excluded.updated_at`,
          Number(payload.readings_per_day), times, timings, windows, weekdays, dateOnly(payload.effective_from), dateOnly(payload.effective_to), payload.instructions ? String(payload.instructions) : null, requiredString(payload.created_at, 'created_at'),
        );
        break;
      }
      case 'measurement_occurrence':
        await db.runAsync(
          `UPDATE measurement_occurrences SET scheduled_at = ?, window_index = ?, meal_event_id = ?, status = ?, completed_reading_id = ?, completed_at = ? WHERE id = ?`,
          requiredString(payload.scheduled_at, 'scheduled_at'), typeof payload.window_index === 'number' ? payload.window_index : null, payload.meal_event_id ? String(payload.meal_event_id) : null, stringValue(payload.status, 'planned'), payload.completed_reading_id ? String(payload.completed_reading_id) : null, payload.completed_at ? String(payload.completed_at) : null, conflict.entityId,
        );
        break;
      case 'meal_event':
        await db.runAsync(
          `INSERT INTO meal_events (id, meal_type, occurred_at, note, created_at, sync_state)
           VALUES (?, ?, ?, ?, ?, 'synced')
           ON CONFLICT(id) DO UPDATE SET meal_type = excluded.meal_type, occurred_at = excluded.occurred_at, note = excluded.note, sync_state = 'synced'`,
          conflict.entityId, ['breakfast', 'lunch', 'dinner', 'snack'].includes(String(payload.meal_type)) ? String(payload.meal_type) : 'snack', requiredString(payload.occurred_at, 'occurred_at'), payload.note ? String(payload.note) : null, requiredString(payload.created_at, 'created_at'),
        );
        break;
      case 'appointment':
        await db.runAsync(
          `UPDATE appointments SET title = ?, provider = ?, specialty = ?, insurer = ?, authorization_number = ?, facility = ?, scheduled_at = ?, requested_at = ?, status = ?, location = ?, virtual_url = ?, preparation_notes = ? WHERE id = ?`,
          requiredString(payload.title, 'title'), requiredString(payload.provider, 'provider'), payload.specialty ? String(payload.specialty) : null, payload.insurer ? String(payload.insurer) : null, payload.authorization_number ? String(payload.authorization_number) : null, payload.facility ? String(payload.facility) : null, requiredString(payload.scheduled_at, 'scheduled_at'), payload.requested_at ? String(payload.requested_at) : null, localAppointmentStatus(payload.status), payload.location ? String(payload.location) : null, payload.virtual_url ? String(payload.virtual_url) : null, payload.preparation_notes ? String(payload.preparation_notes) : null, conflict.entityId,
        );
        break;
      case 'care_plan': {
        const bands = jsonObject(payload.target_bands);
        const actions = Array.isArray(payload.symptom_actions) ? payload.symptom_actions.map(String).join('\n') : null;
        await db.runAsync(
          `INSERT INTO care_plan (id, low_threshold, urgent_low_threshold, high_threshold, urgent_high_threshold, instructions, source, effective_from, effective_to, clinician_verified, updated_at)
           VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET low_threshold = excluded.low_threshold, urgent_low_threshold = excluded.urgent_low_threshold, high_threshold = excluded.high_threshold, urgent_high_threshold = excluded.urgent_high_threshold, instructions = excluded.instructions, source = excluded.source, effective_from = excluded.effective_from, effective_to = excluded.effective_to, clinician_verified = excluded.clinician_verified, updated_at = excluded.updated_at`,
          typeof bands.low === 'number' ? bands.low : null, typeof bands.urgent_low === 'number' ? bands.urgent_low : null, typeof bands.high === 'number' ? bands.high : null, typeof bands.urgent_high === 'number' ? bands.urgent_high : null, actions, payload.source ? String(payload.source) : null, dateOnly(payload.effective_from), dateOnly(payload.effective_to), payload.clinician_verified === true ? 1 : 0, requiredString(payload.created_at, 'created_at'),
        );
        break;
      }
      case 'emergency_card':
        await db.runAsync(
          `INSERT INTO emergency_card (id, full_name, birth_date, diabetes_type, diagnosis_year, insulin_use, allergies, critical_conditions, care_provider, care_facility, insurer, policy_number, emergency_number, emergency_region, emergency_notes, updated_at)
           VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET full_name = excluded.full_name, birth_date = excluded.birth_date, diabetes_type = excluded.diabetes_type, diagnosis_year = excluded.diagnosis_year, insulin_use = excluded.insulin_use, allergies = excluded.allergies, critical_conditions = excluded.critical_conditions, care_provider = excluded.care_provider, care_facility = excluded.care_facility, insurer = excluded.insurer, policy_number = excluded.policy_number, emergency_number = excluded.emergency_number, emergency_region = excluded.emergency_region, emergency_notes = excluded.emergency_notes, updated_at = excluded.updated_at`,
          requiredString(payload.full_name, 'full_name'), payload.birth_date ? String(payload.birth_date) : null, payload.diabetes_type ? String(payload.diabetes_type) : null, payload.diagnosis_year ? String(payload.diagnosis_year) : null, ['yes', 'no', 'unknown'].includes(String(payload.insulin_use)) ? String(payload.insulin_use) : null, payload.allergies ? String(payload.allergies) : null, payload.critical_conditions ? String(payload.critical_conditions) : null, payload.care_provider ? String(payload.care_provider) : null, payload.care_facility ? String(payload.care_facility) : null, payload.insurer ? String(payload.insurer) : null, payload.policy_number ? String(payload.policy_number) : null, payload.emergency_number ? String(payload.emergency_number) : null, payload.emergency_region ? String(payload.emergency_region) : null, payload.emergency_notes ? String(payload.emergency_notes) : null, requiredString(payload.updated_at, 'updated_at'),
        );
        break;
      case 'trusted_contact':
        if (payload.consent_status === 'revoked') {
          await db.runAsync('DELETE FROM trusted_contacts WHERE id = ?', conflict.entityId);
        } else {
          await db.runAsync(
            `INSERT INTO trusted_contacts (id, name, relationship, phone, email, consent_granted, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, relationship = excluded.relationship, phone = excluded.phone, email = excluded.email, consent_granted = excluded.consent_granted`,
            conflict.entityId, requiredString(payload.name, 'name'), payload.relationship ? String(payload.relationship) : null, payload.phone ? String(payload.phone) : null, payload.email ? String(payload.email) : null, payload.consent_status === 'accepted' ? 1 : 0, requiredString(payload.created_at, 'created_at'),
          );
        }
        break;
      case 'emergency_incident':
        // Incident history is user-visible safety data. Apply a reviewed
        // remote projection instead of dropping the conflict or exposing
        // provider delivery details in the local history.
        await db.runAsync(
          `INSERT INTO help_events (id, created_at, reason, contact_state)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET created_at = excluded.created_at, reason = excluded.reason, contact_state = excluded.contact_state`,
          conflict.entityId,
          requiredString(payload.createdAt ?? payload.created_at, 'createdAt'),
          requiredString(payload.reason, 'reason'),
          localHelpEventState(payload.contactState ?? payload.contact_state),
        );
        break;
      default:
        throw new Error(`Remote conflict resolution is not supported for ${conflict.entityType}.`);
    }
    await discardPendingOutboxForEntity(db, conflict.entityType, conflict.entityId);
    await resolveSyncConflictsForEntity(db, conflict.entityType, conflict.entityId, 'remote');
  });
}
