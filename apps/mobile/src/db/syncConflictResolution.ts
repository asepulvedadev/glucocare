import type { SQLiteDatabase } from 'expo-sqlite';
import { discardPendingOutboxForEntity } from './outboxRepository';
import { resolveSyncConflictsForEntity, type SyncConflict } from './syncConflictRepository';

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

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function localUnit(value: unknown) {
  return value === 'mmol_l' ? 'mmol/L' : 'mg/dL';
}

function localContext(value: unknown) {
  return ['fasting', 'before_meal', 'after_meal', 'bedtime'].includes(String(value)) ? String(value) : 'other';
}

function localRoute(value: unknown) {
  return ['oral', 'injection', 'inhaled', 'topical'].includes(String(value)) ? String(value) : 'other';
}

function localAppointmentStatus(value: unknown) {
  return ['requested', 'pending_authorization', 'authorized', 'scheduled', 'completed', 'cancelled'].includes(String(value)) ? String(value) : 'requested';
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
        await db.runAsync(
          `INSERT INTO glucose_readings (id, value, unit, context, recorded_at, symptoms, note, sync_state, risk_classification)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'synced', ?)
           ON CONFLICT(id) DO UPDATE SET value = excluded.value, unit = excluded.unit, context = excluded.context, recorded_at = excluded.recorded_at, symptoms = excluded.symptoms, note = excluded.note, sync_state = 'synced', risk_classification = excluded.risk_classification`,
          conflict.entityId, numberValue(payload.value_original, 'value'), localUnit(payload.unit_original), localContext(payload.context), requiredString(payload.measured_at, 'measured_at'), Array.isArray(payload.symptoms) ? payload.symptoms.map(String).join(', ') : null, payload.note ? String(payload.note) : null, payload.classification ? String(payload.classification) : null,
        );
        break;
      case 'medication':
        {
          const times = Array.isArray(payload.times) ? payload.times.map(String).filter((time) => /^\d{2}:\d{2}$/.test(time)) : [];
          const firstTime = times[0]?.match(/^(\d{2}):(\d{2})$/);
          if (firstTime) {
            await db.runAsync(
              `UPDATE medications SET name = ?, dose_text = ?, route = ?, hour = ?, minute = ?, times_json = ?, enabled = ?, created_at = ? WHERE id = ?`,
              requiredString(payload.name, 'name'), requiredString(payload.dose_text, 'dose_text'), localRoute(payload.route), Number(firstTime[1]), Number(firstTime[2]), JSON.stringify(times), payload.enabled === false ? 0 : 1, requiredString(payload.created_at, 'created_at'), conflict.entityId,
            );
          } else {
            await db.runAsync(
              `UPDATE medications SET name = ?, dose_text = ?, route = ?, enabled = ?, created_at = ? WHERE id = ?`,
              requiredString(payload.name, 'name'), requiredString(payload.dose_text, 'dose_text'), localRoute(payload.route), payload.enabled === false ? 0 : 1, requiredString(payload.created_at, 'created_at'), conflict.entityId,
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
        await db.runAsync(
          `INSERT INTO measurement_plans (id, readings_per_day, times_json, instructions, updated_at)
           VALUES ('default', ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET readings_per_day = excluded.readings_per_day, times_json = excluded.times_json, instructions = excluded.instructions, updated_at = excluded.updated_at`,
          Number(payload.readings_per_day), times, payload.instructions ? String(payload.instructions) : null, requiredString(payload.created_at, 'created_at'),
        );
        break;
      }
      case 'measurement_occurrence':
        await db.runAsync(
          `UPDATE measurement_occurrences SET scheduled_at = ?, status = ?, completed_reading_id = ?, completed_at = ? WHERE id = ?`,
          requiredString(payload.scheduled_at, 'scheduled_at'), stringValue(payload.status, 'planned'), payload.completed_reading_id ? String(payload.completed_reading_id) : null, payload.completed_at ? String(payload.completed_at) : null, conflict.entityId,
        );
        break;
      case 'appointment':
        await db.runAsync(
          `UPDATE appointments SET title = ?, provider = ?, scheduled_at = ?, status = ?, location = ?, notes = ? WHERE id = ?`,
          requiredString(payload.title, 'title'), requiredString(payload.provider, 'provider'), requiredString(payload.scheduled_at, 'scheduled_at'), localAppointmentStatus(payload.status), payload.location ? String(payload.location) : null, payload.preparation_notes ? String(payload.preparation_notes) : null, conflict.entityId,
        );
        break;
      case 'care_plan': {
        const bands = jsonObject(payload.target_bands);
        const actions = Array.isArray(payload.symptom_actions) ? payload.symptom_actions.map(String).join('\n') : null;
        await db.runAsync(
          `INSERT INTO care_plan (id, low_threshold, urgent_low_threshold, high_threshold, urgent_high_threshold, instructions, clinician_verified, updated_at)
           VALUES ('default', ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET low_threshold = excluded.low_threshold, urgent_low_threshold = excluded.urgent_low_threshold, high_threshold = excluded.high_threshold, urgent_high_threshold = excluded.urgent_high_threshold, instructions = excluded.instructions, clinician_verified = excluded.clinician_verified, updated_at = excluded.updated_at`,
          typeof bands.low === 'number' ? bands.low : null, typeof bands.urgent_low === 'number' ? bands.urgent_low : null, typeof bands.high === 'number' ? bands.high : null, typeof bands.urgent_high === 'number' ? bands.urgent_high : null, actions, payload.clinician_verified === true ? 1 : 0, requiredString(payload.created_at, 'created_at'),
        );
        break;
      }
      case 'emergency_card':
        await db.runAsync(
          `INSERT INTO emergency_card (id, full_name, birth_date, diabetes_type, allergies, care_provider, care_facility, emergency_notes, updated_at)
           VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET full_name = excluded.full_name, birth_date = excluded.birth_date, diabetes_type = excluded.diabetes_type, allergies = excluded.allergies, care_provider = excluded.care_provider, care_facility = excluded.care_facility, emergency_notes = excluded.emergency_notes, updated_at = excluded.updated_at`,
          requiredString(payload.full_name, 'full_name'), payload.birth_date ? String(payload.birth_date) : null, payload.diabetes_type ? String(payload.diabetes_type) : null, payload.allergies ? String(payload.allergies) : null, payload.care_provider ? String(payload.care_provider) : null, payload.care_facility ? String(payload.care_facility) : null, payload.emergency_notes ? String(payload.emergency_notes) : null, requiredString(payload.updated_at, 'updated_at'),
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
      default:
        throw new Error(`Remote conflict resolution is not supported for ${conflict.entityType}.`);
    }
    await discardPendingOutboxForEntity(db, conflict.entityType, conflict.entityId);
    await resolveSyncConflictsForEntity(db, conflict.entityType, conflict.entityId, 'remote');
  });
}
