import type { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from './supabase';
import type { GlucoseContext, GlucoseUnit } from './types/domain';
import type { GlucoseRiskClassification, CarePlan } from './types/carePlan';
import type { MedicationRoute } from './types/care';
import type { AppointmentStatus } from './types/appointments';
import { setLastPulledAt } from './db/syncMetadataRepository';

function localUnit(unit: string): GlucoseUnit {
  return unit === 'mmol_l' ? 'mmol/L' : 'mg/dL';
}

function localContext(context: string): GlucoseContext {
  return ['fasting', 'before_meal', 'after_meal', 'bedtime'].includes(context) ? context as GlucoseContext : 'other';
}

function localRisk(value: string | null): GlucoseRiskClassification | undefined {
  return value && ['unclassified', 'in_range', 'low', 'urgent_low', 'high', 'urgent_high'].includes(value) ? value as GlucoseRiskClassification : undefined;
}

function localRoute(route: string): MedicationRoute {
  return ['oral', 'injection', 'inhaled', 'topical'].includes(route) ? route as MedicationRoute : 'other';
}

function localAppointmentStatus(status: string): AppointmentStatus {
  return ['requested', 'pending_authorization', 'authorized', 'scheduled', 'completed', 'cancelled'].includes(status) ? status as AppointmentStatus : 'requested';
}

function jsonArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function pullCloudData(db: SQLiteDatabase, patientId: string, since: string) {
  if (!supabase) return 0;
  // Freeze the pull window before querying so records committed while this pull
  // is in flight are picked up by the next run instead of being skipped.
  const until = new Date().toISOString();
  const [glucoseResult, medicationsResult, schedulesResult, appointmentsResult, planResult, carePlanResult, cardResult, contactsResult] = await Promise.all([
    supabase.from('glucose_readings').select('id,value_original,unit_original,measured_at,context,symptoms,note,classification,updated_at').eq('patient_id', patientId).gte('updated_at', since).lte('updated_at', until),
    supabase.from('medications').select('id,name,dose_text,route,enabled,created_at').eq('patient_id', patientId).gte('updated_at', since).lte('updated_at', until),
    supabase.from('medication_schedule_revisions').select('medication_id,times_json,revision_number').eq('patient_id', patientId).order('revision_number', { ascending: false }),
    supabase.from('appointments').select('id,title,provider,scheduled_at,status,location,preparation_notes,created_at').eq('patient_id', patientId).gte('updated_at', since).lte('updated_at', until),
    supabase.from('measurement_plan_revisions').select('revision_number,readings_per_day,times_json,instructions,created_at').eq('patient_id', patientId).order('revision_number', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('care_plan_revisions').select('revision_number,target_bands,symptom_actions,clinician_verified,created_at').eq('patient_id', patientId).order('revision_number', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('emergency_cards').select('patient_id,full_name,birth_date,diabetes_type,allergies,care_provider,emergency_notes,updated_at').eq('patient_id', patientId).maybeSingle(),
    supabase.from('trusted_contacts').select('id,name,relationship,phone,email,consent_status,created_at').eq('patient_id', patientId).gte('updated_at', since).lte('updated_at', until),
  ]);
  const errors = [glucoseResult, medicationsResult, schedulesResult, appointmentsResult, planResult, carePlanResult, cardResult, contactsResult].filter((result) => result.error);
  if (errors.length) throw errors[0].error;

  const schedules = new Map<string, { hour: number; minute: number }>();
  for (const schedule of schedulesResult.data ?? []) {
    if (schedules.has(schedule.medication_id)) continue;
    const firstTime = jsonArray(schedule.times_json)[0];
    const match = firstTime?.match(/^(\d{1,2}):(\d{2})$/);
    if (match) schedules.set(schedule.medication_id, { hour: Number(match[1]), minute: Number(match[2]) });
  }

  let downloaded = 0;
  await db.withTransactionAsync(async () => {
    for (const reading of glucoseResult.data ?? []) {
      await db.runAsync(`INSERT INTO glucose_readings (id, value, unit, context, recorded_at, symptoms, note, sync_state, risk_classification)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'synced', ?)
        ON CONFLICT(id) DO UPDATE SET value = excluded.value, unit = excluded.unit, context = excluded.context, recorded_at = excluded.recorded_at, symptoms = excluded.symptoms, note = excluded.note, sync_state = 'synced', risk_classification = excluded.risk_classification`,
        reading.id, Number(reading.value_original), localUnit(reading.unit_original), localContext(reading.context), reading.measured_at, reading.symptoms?.join(', ') ?? null, reading.note ?? null, localRisk(reading.classification) ?? null);
      downloaded += 1;
    }
    for (const medication of medicationsResult.data ?? []) {
      const time = schedules.get(medication.id) ?? { hour: 8, minute: 0 };
      await db.runAsync(`INSERT INTO medications (id, name, dose_text, route, hour, minute, enabled, reminder_state, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'unavailable', ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, dose_text = excluded.dose_text, route = excluded.route, hour = excluded.hour, minute = excluded.minute, enabled = excluded.enabled`,
        medication.id, medication.name, medication.dose_text, localRoute(medication.route), time.hour, time.minute, medication.enabled ? 1 : 0, medication.created_at);
      downloaded += 1;
    }
    for (const appointment of appointmentsResult.data ?? []) {
      await db.runAsync(`INSERT INTO appointments (id, title, provider, scheduled_at, status, location, notes, reminder_state, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'unavailable', ?)
        ON CONFLICT(id) DO UPDATE SET title = excluded.title, provider = excluded.provider, scheduled_at = excluded.scheduled_at, status = excluded.status, location = excluded.location, notes = excluded.notes`,
        appointment.id, appointment.title, appointment.provider, appointment.scheduled_at ?? new Date().toISOString(), localAppointmentStatus(appointment.status), appointment.location, appointment.preparation_notes, appointment.created_at);
      downloaded += 1;
    }
    const plan = planResult.data;
    if (plan) {
      await db.runAsync(`INSERT INTO measurement_plans (id, readings_per_day, times_json, instructions, updated_at)
        VALUES ('default', ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET readings_per_day = excluded.readings_per_day, times_json = excluded.times_json, instructions = excluded.instructions, updated_at = excluded.updated_at`,
        plan.readings_per_day, JSON.stringify(jsonArray(plan.times_json)), plan.instructions, plan.created_at);
      downloaded += 1;
    }
    const carePlan = carePlanResult.data;
    if (carePlan) {
      const bands = jsonObject(carePlan.target_bands);
      const actions = jsonArray(carePlan.symptom_actions);
      const localPlan: CarePlan = {
        id: 'default',
        urgentLowThreshold: typeof bands.urgent_low === 'number' ? bands.urgent_low : undefined,
        lowThreshold: typeof bands.low === 'number' ? bands.low : undefined,
        highThreshold: typeof bands.high === 'number' ? bands.high : undefined,
        urgentHighThreshold: typeof bands.urgent_high === 'number' ? bands.urgent_high : undefined,
        instructions: actions.join('\n') || undefined,
        clinicianVerified: carePlan.clinician_verified,
        updatedAt: carePlan.created_at,
      };
      await db.runAsync(`INSERT INTO care_plan (id, low_threshold, urgent_low_threshold, high_threshold, urgent_high_threshold, instructions, clinician_verified, updated_at)
        VALUES ('default', ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET low_threshold = excluded.low_threshold, urgent_low_threshold = excluded.urgent_low_threshold, high_threshold = excluded.high_threshold, urgent_high_threshold = excluded.urgent_high_threshold, instructions = excluded.instructions, clinician_verified = excluded.clinician_verified, updated_at = excluded.updated_at`,
        localPlan.lowThreshold ?? null, localPlan.urgentLowThreshold ?? null, localPlan.highThreshold ?? null, localPlan.urgentHighThreshold ?? null, localPlan.instructions ?? null, localPlan.clinicianVerified ? 1 : 0, localPlan.updatedAt);
      downloaded += 1;
    }
    const card = cardResult.data;
    if (card) {
      await db.runAsync(`INSERT INTO emergency_card (id, full_name, birth_date, diabetes_type, allergies, care_provider, emergency_notes, updated_at)
        VALUES ('default', ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET full_name = excluded.full_name, birth_date = excluded.birth_date, diabetes_type = excluded.diabetes_type, allergies = excluded.allergies, care_provider = excluded.care_provider, emergency_notes = excluded.emergency_notes, updated_at = excluded.updated_at`,
        card.full_name, card.birth_date, card.diabetes_type, card.allergies, card.care_provider, card.emergency_notes, card.updated_at);
      downloaded += 1;
    }
    for (const contact of contactsResult.data ?? []) {
      await db.runAsync(`INSERT INTO trusted_contacts (id, name, relationship, phone, email, consent_granted, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, relationship = excluded.relationship, phone = excluded.phone, email = excluded.email, consent_granted = excluded.consent_granted`,
        contact.id, contact.name, contact.relationship, contact.phone, contact.email, contact.consent_status === 'accepted' ? 1 : 0, contact.created_at);
      downloaded += 1;
    }
  });
  await setLastPulledAt(db, until);
  return downloaded;
}
