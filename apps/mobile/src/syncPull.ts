import type { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from './supabase';
import type { GlucoseContext, GlucoseSource, GlucoseUnit } from './types/domain';
import type { GlucoseRiskClassification, CarePlan } from './types/carePlan';
import type { MedicationRoute } from './types/care';
import type { AppointmentStatus } from './types/appointments';
import type { MealType } from './types/meals';
import { setLastPulledAt } from './db/syncMetadataRepository';
import { listPendingSyncEntities } from './db/outboxRepository';
import { recordSyncConflict } from './db/syncConflictRepository';

function localUnit(unit: string): GlucoseUnit {
  return unit === 'mmol_l' ? 'mmol/L' : 'mg/dL';
}

function localContext(context: string): GlucoseContext {
  return ['fasting', 'before_meal', 'after_meal', 'bedtime'].includes(context) ? context as GlucoseContext : 'other';
}

function localSource(source: string | null): GlucoseSource {
  return ['manual', 'import', 'cgm', 'glucometer'].includes(String(source)) ? source as GlucoseSource : 'manual';
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

function localMealType(value: string): MealType {
  return ['breakfast', 'lunch', 'dinner', 'snack'].includes(value) ? value as MealType : 'snack';
}

function jsonArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function jsonValueArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function localDateOnly(value: string | null | undefined) {
  return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : undefined;
}

export async function pullCloudData(db: SQLiteDatabase, patientId: string, since: string) {
  if (!supabase) return 0;
  // Freeze the pull window before querying so records committed while this pull
  // is in flight are picked up by the next run instead of being skipped.
  const until = new Date().toISOString();
  const [glucoseResult, medicationsResult, schedulesResult, medicationOccurrencesResult, appointmentsResult, measurementOccurrencesResult, mealEventsResult, planResult, carePlanResult, cardResult, contactsResult] = await Promise.all([
    supabase.from('glucose_readings').select('id,value_original,unit_original,measured_at,context,source,meal_offset_minutes,symptoms,note,classification,timezone,utc_offset_minutes,time_edited,updated_at').eq('patient_id', patientId).gte('updated_at', since).lte('updated_at', until),
    supabase.from('medications').select('id,name,dose_text,route,prescriber_name,instructions,start_date,end_date,enabled,created_at').eq('patient_id', patientId).gte('updated_at', since).lte('updated_at', until),
    supabase.from('medication_schedule_revisions').select('medication_id,times_json,revision_number').eq('patient_id', patientId).order('revision_number', { ascending: false }),
    supabase.from('medication_occurrences').select('id,medication_id,scheduled_at,status,acted_at,created_at,updated_at').eq('patient_id', patientId).gte('updated_at', since).lte('updated_at', until),
    supabase.from('appointments').select('id,title,provider,specialty,insurer,authorization_number,facility,scheduled_at,requested_at,status,location,virtual_url,preparation_notes,created_at').eq('patient_id', patientId).gte('updated_at', since).lte('updated_at', until),
    supabase.from('measurement_occurrences').select('id,plan_revision_id,scheduled_at,window_index,meal_event_id,status,completed_reading_id,completed_at,created_at,updated_at').eq('patient_id', patientId).gte('updated_at', since).lte('updated_at', until),
    supabase.from('meal_events').select('id,meal_type,occurred_at,note,created_at,updated_at').eq('patient_id', patientId).gte('updated_at', since).lte('updated_at', until),
    supabase.from('measurement_plan_revisions').select('revision_number,readings_per_day,times_json,timings_json,windows_json,weekdays_json,effective_from,effective_to,instructions,created_at').eq('patient_id', patientId).order('revision_number', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('care_plan_revisions').select('revision_number,target_bands,symptom_actions,clinician_verified,created_at,effective_from,effective_to,source').eq('patient_id', patientId).order('revision_number', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('emergency_cards').select('patient_id,full_name,birth_date,diabetes_type,diagnosis_year,insulin_use,allergies,critical_conditions,care_provider,care_facility,insurer,policy_number,emergency_number,emergency_region,emergency_notes,updated_at').eq('patient_id', patientId).maybeSingle(),
    supabase.from('trusted_contacts').select('id,name,relationship,phone,email,consent_status,created_at').eq('patient_id', patientId).gte('updated_at', since).lte('updated_at', until),
  ]);
  const errors = [glucoseResult, medicationsResult, schedulesResult, medicationOccurrencesResult, appointmentsResult, measurementOccurrencesResult, mealEventsResult, planResult, carePlanResult, cardResult, contactsResult].filter((result) => result.error);
  if (errors.length) throw errors[0].error;

  const pending = await listPendingSyncEntities(db);
  const pendingByEntity = new Map(pending.map((event) => [`${event.entityType}:${event.entityId}`, event]));
  async function preserveLocalChange(entityType: string, entityId: string, remotePayload: Record<string, unknown>) {
    const localEvent = pendingByEntity.get(`${entityType}:${entityId}`);
    if (!localEvent) return false;
    await recordSyncConflict(db, {
      entityType,
      entityId,
      localEventId: localEvent.eventId,
      localPayload: localEvent.payload,
      remotePayload,
    });
    return true;
  }

  const schedules = new Map<string, { hour: number; minute: number; times: string[] }>();
  for (const schedule of schedulesResult.data ?? []) {
    if (schedules.has(schedule.medication_id)) continue;
    const firstTime = jsonArray(schedule.times_json)[0];
    const match = firstTime?.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) schedules.set(schedule.medication_id, { hour, minute, times: jsonArray(schedule.times_json) });
    }
  }

  let downloaded = 0;
  await db.withTransactionAsync(async () => {
    for (const reading of glucoseResult.data ?? []) {
      if (await preserveLocalChange('glucose_reading', reading.id, reading as unknown as Record<string, unknown>)) continue;
      await db.runAsync(`INSERT INTO glucose_readings (id, value, unit, context, source, meal_offset_minutes, recorded_at, timezone, utc_offset_minutes, time_edited, symptoms, note, sync_state, risk_classification)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?)
        ON CONFLICT(id) DO UPDATE SET value = excluded.value, unit = excluded.unit, context = excluded.context, source = excluded.source, meal_offset_minutes = excluded.meal_offset_minutes, recorded_at = excluded.recorded_at, timezone = excluded.timezone, utc_offset_minutes = excluded.utc_offset_minutes, time_edited = excluded.time_edited, symptoms = excluded.symptoms, note = excluded.note, sync_state = 'synced', risk_classification = excluded.risk_classification`,
        reading.id, Number(reading.value_original), localUnit(reading.unit_original), localContext(reading.context), localSource(reading.source), reading.meal_offset_minutes, reading.measured_at, reading.timezone, reading.utc_offset_minutes, reading.time_edited ? 1 : 0, reading.symptoms?.join(', ') ?? null, reading.note ?? null, localRisk(reading.classification) ?? null);
      downloaded += 1;
    }
    for (const medication of medicationsResult.data ?? []) {
      const time = schedules.get(medication.id) ?? { hour: 8, minute: 0, times: ['08:00'] };
      if (await preserveLocalChange('medication', medication.id, { ...(medication as unknown as Record<string, unknown>), times: time.times })) continue;
      await db.runAsync(`INSERT INTO medications (id, name, dose_text, route, prescriber_name, instructions, start_date, end_date, hour, minute, times_json, enabled, reminder_state, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unavailable', ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, dose_text = excluded.dose_text, route = excluded.route, prescriber_name = excluded.prescriber_name, instructions = excluded.instructions, start_date = excluded.start_date, end_date = excluded.end_date, hour = excluded.hour, minute = excluded.minute, times_json = excluded.times_json, enabled = excluded.enabled`,
        medication.id, medication.name, medication.dose_text, localRoute(medication.route), medication.prescriber_name, medication.instructions, medication.start_date, medication.end_date, time.hour, time.minute, JSON.stringify(time.times), medication.enabled ? 1 : 0, medication.created_at);
      downloaded += 1;
    }
    const plan = planResult.data;
    if (plan) {
      if (await preserveLocalChange('measurement_plan', 'default', plan as unknown as Record<string, unknown>)) {
        // Keep the user's local plan until its pending event is acknowledged.
      } else {
      await db.runAsync(`INSERT INTO measurement_plans (id, readings_per_day, times_json, timings_json, windows_json, weekdays_json, effective_from, effective_to, instructions, updated_at)
        VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET readings_per_day = excluded.readings_per_day, times_json = excluded.times_json, timings_json = excluded.timings_json, windows_json = excluded.windows_json, weekdays_json = excluded.weekdays_json, effective_from = excluded.effective_from, effective_to = excluded.effective_to, instructions = excluded.instructions, updated_at = excluded.updated_at`,
        plan.readings_per_day, JSON.stringify(jsonArray(plan.times_json)), JSON.stringify(jsonArray(plan.timings_json)), JSON.stringify(jsonValueArray(plan.windows_json)), JSON.stringify(jsonArray(plan.weekdays_json)), localDateOnly(plan.effective_from) ?? null, localDateOnly(plan.effective_to) ?? null, plan.instructions, plan.created_at);
      downloaded += 1;
      }
    }
    for (const occurrence of medicationOccurrencesResult.data ?? []) {
      if (await preserveLocalChange('medication_occurrence', occurrence.id, occurrence as unknown as Record<string, unknown>)) continue;
      await db.runAsync(`INSERT INTO medication_occurrences (id, medication_id, scheduled_at, status, acted_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET scheduled_at = excluded.scheduled_at, status = excluded.status, acted_at = excluded.acted_at`,
        occurrence.id, occurrence.medication_id, occurrence.scheduled_at, occurrence.status, occurrence.acted_at, occurrence.created_at);
      downloaded += 1;
    }
    for (const appointment of appointmentsResult.data ?? []) {
      if (await preserveLocalChange('appointment', appointment.id, appointment as unknown as Record<string, unknown>)) continue;
      await db.runAsync(`INSERT INTO appointments (id, title, provider, specialty, insurer, authorization_number, facility, scheduled_at, requested_at, status, location, virtual_url, preparation_notes, notes, reminder_state, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'unavailable', ?)
        ON CONFLICT(id) DO UPDATE SET title = excluded.title, provider = excluded.provider, specialty = excluded.specialty, insurer = excluded.insurer, authorization_number = excluded.authorization_number, facility = excluded.facility, scheduled_at = excluded.scheduled_at, requested_at = excluded.requested_at, status = excluded.status, location = excluded.location, virtual_url = excluded.virtual_url, preparation_notes = excluded.preparation_notes`,
        appointment.id, appointment.title, appointment.provider, appointment.specialty, appointment.insurer, appointment.authorization_number, appointment.facility, appointment.scheduled_at ?? new Date().toISOString(), appointment.requested_at ?? appointment.created_at, localAppointmentStatus(appointment.status), appointment.location, appointment.virtual_url, appointment.preparation_notes, appointment.created_at);
      downloaded += 1;
    }
    for (const meal of mealEventsResult.data ?? []) {
      if (await preserveLocalChange('meal_event', meal.id, meal as unknown as Record<string, unknown>)) continue;
      await db.runAsync(`INSERT INTO meal_events (id, meal_type, occurred_at, note, created_at, sync_state)
        VALUES (?, ?, ?, ?, ?, 'synced')
        ON CONFLICT(id) DO UPDATE SET meal_type = excluded.meal_type, occurred_at = excluded.occurred_at, note = excluded.note, sync_state = 'synced'`,
        meal.id, localMealType(meal.meal_type), meal.occurred_at, meal.note, meal.created_at);
      downloaded += 1;
    }
    for (const occurrence of measurementOccurrencesResult.data ?? []) {
      if (await preserveLocalChange('measurement_occurrence', occurrence.id, occurrence as unknown as Record<string, unknown>)) continue;
      await db.runAsync(`INSERT INTO measurement_occurrences (id, plan_id, scheduled_at, window_index, meal_event_id, status, completed_reading_id, completed_at, created_at)
        VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET scheduled_at = excluded.scheduled_at, window_index = excluded.window_index, meal_event_id = excluded.meal_event_id, status = excluded.status, completed_reading_id = excluded.completed_reading_id, completed_at = excluded.completed_at`,
        occurrence.id, occurrence.scheduled_at, occurrence.window_index, occurrence.meal_event_id, occurrence.status, occurrence.completed_reading_id, occurrence.completed_at, occurrence.created_at);
      downloaded += 1;
    }
    const carePlan = carePlanResult.data;
    if (carePlan) {
      if (await preserveLocalChange('care_plan', 'default', carePlan as unknown as Record<string, unknown>)) {
        // Keep the user's local plan until its pending event is acknowledged.
      } else {
      const bands = jsonObject(carePlan.target_bands);
      const actions = jsonArray(carePlan.symptom_actions);
      const localPlan: CarePlan = {
        id: 'default',
        urgentLowThreshold: typeof bands.urgent_low === 'number' ? bands.urgent_low : undefined,
        lowThreshold: typeof bands.low === 'number' ? bands.low : undefined,
        highThreshold: typeof bands.high === 'number' ? bands.high : undefined,
        urgentHighThreshold: typeof bands.urgent_high === 'number' ? bands.urgent_high : undefined,
        instructions: actions.join('\n') || undefined,
        source: carePlan.source ?? undefined,
        effectiveFrom: carePlan.effective_from,
        effectiveTo: carePlan.effective_to ?? undefined,
        clinicianVerified: carePlan.clinician_verified,
        updatedAt: carePlan.created_at,
      };
      await db.runAsync(`INSERT INTO care_plan (id, low_threshold, urgent_low_threshold, high_threshold, urgent_high_threshold, instructions, source, effective_from, effective_to, clinician_verified, updated_at)
        VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET low_threshold = excluded.low_threshold, urgent_low_threshold = excluded.urgent_low_threshold, high_threshold = excluded.high_threshold, urgent_high_threshold = excluded.urgent_high_threshold, instructions = excluded.instructions, source = excluded.source, effective_from = excluded.effective_from, effective_to = excluded.effective_to, clinician_verified = excluded.clinician_verified, updated_at = excluded.updated_at`,
        localPlan.lowThreshold ?? null, localPlan.urgentLowThreshold ?? null, localPlan.highThreshold ?? null, localPlan.urgentHighThreshold ?? null, localPlan.instructions ?? null, localPlan.source ?? null, localPlan.effectiveFrom ?? null, localPlan.effectiveTo ?? null, localPlan.clinicianVerified ? 1 : 0, localPlan.updatedAt);
      downloaded += 1;
      }
    }
    const card = cardResult.data;
    if (card) {
      if (await preserveLocalChange('emergency_card', 'default', card as unknown as Record<string, unknown>)) {
        // Keep the user's local card until its pending event is acknowledged.
      } else {
      await db.runAsync(`INSERT INTO emergency_card (id, full_name, birth_date, diabetes_type, diagnosis_year, insulin_use, allergies, critical_conditions, care_provider, care_facility, insurer, policy_number, emergency_number, emergency_region, emergency_notes, updated_at)
        VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET full_name = excluded.full_name, birth_date = excluded.birth_date, diabetes_type = excluded.diabetes_type, diagnosis_year = excluded.diagnosis_year, insulin_use = excluded.insulin_use, allergies = excluded.allergies, critical_conditions = excluded.critical_conditions, care_provider = excluded.care_provider, care_facility = excluded.care_facility, insurer = excluded.insurer, policy_number = excluded.policy_number, emergency_number = excluded.emergency_number, emergency_region = excluded.emergency_region, emergency_notes = excluded.emergency_notes, updated_at = excluded.updated_at`,
        card.full_name, card.birth_date, card.diabetes_type, card.diagnosis_year, card.insulin_use, card.allergies, card.critical_conditions, card.care_provider, card.care_facility, card.insurer, card.policy_number, card.emergency_number, card.emergency_region, card.emergency_notes, card.updated_at);
      downloaded += 1;
      }
    }
    for (const contact of contactsResult.data ?? []) {
      if (await preserveLocalChange('trusted_contact', contact.id, contact as unknown as Record<string, unknown>)) continue;
      if (contact.consent_status === 'revoked') {
        await db.runAsync('DELETE FROM trusted_contacts WHERE id = ?', contact.id);
        downloaded += 1;
        continue;
      }
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
