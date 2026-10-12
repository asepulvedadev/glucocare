import type { SQLiteDatabase } from 'expo-sqlite';
import { cloudApi, type AuthSession } from './cloudApi';
import type { GlucoseContext, GlucoseSource, GlucoseUnit } from './types/domain';
import type { GlucoseRiskClassification, CarePlan } from './types/carePlan';
import type { MedicationRoute } from './types/care';
import type { AppointmentStatus } from './types/appointments';
import type { MealType } from './types/meals';
import { setLastPulledAt } from './db/syncMetadataRepository';
import { listPendingSyncEntities } from './db/outboxRepository';
import { recordSyncConflict } from './db/syncConflictRepository';
import { conversionVersionForUnit, toCanonicalMgDl } from './domain/glucoseSummary';

type LegacyRecord = Record<string, any>;

function localUnit(unit: string): GlucoseUnit {
  return unit === 'mmol_l' ? 'mmol/L' : 'mg/dL';
}

function localContext(context: string): GlucoseContext {
  return ['fasting', 'before_meal', 'after_meal', 'bedtime', 'exercise', 'illness', 'symptoms'].includes(context) ? context as GlucoseContext : 'other';
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
  return ['requested', 'pending_authorization', 'authorized', 'scheduled', 'completed', 'missed', 'denied', 'cancelled'].includes(status) ? status as AppointmentStatus : 'requested';
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

export async function pullCloudData(db: SQLiteDatabase, patientId: string, since: string, session: AuthSession) {
  const snapshot = await cloudApi.pull(since, session);
  const records = snapshot.records;
  const collect = (entityType: string): LegacyRecord[] => records.filter((record) => record.entity_type === entityType).map((record) => ({ ...record.payload, id: record.entity_id, updated_at: record.updated_at }));
  const glucoseResult = { data: collect('glucose_reading').map((record) => {
    const payload = record.after && typeof record.after === 'object' && !Array.isArray(record.after) ? record.after as Record<string, unknown> : record;
    return {
      id: record.id, value_original: payload.value, value_mg_dl: payload.valueMgDl, conversion_version: payload.conversionVersion,
      unit_original: payload.unit === 'mmol/L' ? 'mmol_l' : 'mg_dl', measured_at: payload.recordedAt, context: payload.context,
      source: payload.source, meal_offset_minutes: payload.mealOffsetMinutes, symptoms: payload.symptoms ? [String(payload.symptoms)] : [],
      note: payload.note ?? null, ketone_result: payload.ketoneResult, classification: payload.riskClassification,
      risk_rule_id: payload.riskRuleId, risk_plan_updated_at: payload.riskPlanUpdatedAt,
      timezone: payload.timezone, utc_offset_minutes: payload.utcOffsetMinutes, time_edited: payload.timeEdited, updated_at: record.updated_at,
    };
  }) };
  const medicationRecords = collect('medication');
  const medicationsResult = { data: medicationRecords.map((record) => ({
    id: record.id, name: record.name, presentation: record.presentation ?? null, dose_text: record.doseText, route: record.route, prescriber_name: record.prescriberName ?? null,
    instructions: record.instructions ?? null, start_date: record.startDate ?? null, end_date: record.endDate ?? null,
    enabled: record.enabled !== false, created_at: record.createdAt ?? record.updated_at,
  })) };
  const schedulesResult = { data: medicationRecords.map((record) => ({ medication_id: record.id, times_json: record.times ?? [], schedule: record.schedule ?? null, revision_number: 1 })) };
  const medicationOccurrencesResult = { data: collect('medication_occurrence').map((record) => ({ id: record.id, medication_id: record.medicationId, scheduled_at: record.scheduledAt, status: record.status, acted_at: record.actedAt ?? null, created_at: record.createdAt ?? record.updated_at, updated_at: record.updated_at })) };
  const appointmentsResult = { data: collect('appointment').map((record) => ({ id: record.id, title: record.title, provider: record.provider, specialty: record.specialty ?? null, insurer: record.insurer ?? null, authorization_number: record.authorizationNumber ?? null, facility: record.facility ?? null, scheduled_at: record.scheduledAt, requested_at: record.requestedAt ?? record.createdAt, status: record.status, location: record.location ?? null, virtual_url: record.virtualUrl ?? null, preparation_notes: record.preparationNotes ?? record.notes ?? null, created_at: record.createdAt ?? record.updated_at, updated_at: record.updated_at })) };
  const measurementOccurrencesResult = { data: collect('measurement_occurrence').map((record) => ({ id: record.id, plan_revision_id: record.planId ?? 'default', scheduled_at: record.scheduledAt, window_index: record.windowIndex ?? null, meal_event_id: record.mealEventId ?? null, status: record.status, completed_reading_id: record.completedReadingId ?? null, completed_at: record.completedAt ?? null, created_at: record.createdAt ?? record.updated_at, updated_at: record.updated_at })) };
  const mealEventsResult = { data: collect('meal_event').map((record) => ({ id: record.id, meal_type: record.mealType, occurred_at: record.occurredAt, note: record.note ?? null, created_at: record.createdAt ?? record.updated_at, updated_at: record.updated_at })) };
  const planRecords = collect('measurement_plan');
  const planResult = { data: planRecords.length ? { revision_number: 1, readings_per_day: planRecords[0].readingsPerDay, times_json: planRecords[0].times ?? [], timings_json: planRecords[0].timings ?? [], windows_json: planRecords[0].windows ?? [], weekdays_json: planRecords[0].weekdays ?? [1, 2, 3, 4, 5, 6, 7], effective_from: planRecords[0].effectiveFrom ?? null, effective_to: planRecords[0].effectiveTo ?? null, instructions: planRecords[0].instructions ?? null, created_at: planRecords[0].updatedAt ?? planRecords[0].updated_at } : null };
  const careRecords = collect('care_plan');
  const carePlanResult = { data: careRecords.length ? { revision_number: 1, target_bands: { low: careRecords[0].lowThreshold ?? null, urgent_low: careRecords[0].urgentLowThreshold ?? null, high: careRecords[0].highThreshold ?? null, urgent_high: careRecords[0].urgentHighThreshold ?? null }, symptom_actions: careRecords[0].instructions ? [careRecords[0].instructions] : [], clinician_verified: careRecords[0].clinicianVerified === true, created_at: careRecords[0].updatedAt ?? careRecords[0].updated_at, effective_from: careRecords[0].effectiveFrom ?? null, effective_to: careRecords[0].effectiveTo ?? null, source: careRecords[0].source ?? null } : null };
  const cardRecords = collect('emergency_card');
  const cardResult = { data: cardRecords.length ? { patient_id: patientId, full_name: cardRecords[0].fullName, birth_date: cardRecords[0].birthDate ?? null, diabetes_type: cardRecords[0].diabetesType ?? null, diagnosis_year: cardRecords[0].diagnosisYear ?? null, insulin_use: cardRecords[0].insulinUse ?? null, allergies: cardRecords[0].allergies ?? null, critical_conditions: cardRecords[0].criticalConditions ?? null, care_provider: cardRecords[0].careProvider ?? null, care_facility: cardRecords[0].careFacility ?? null, insurer: cardRecords[0].insurer ?? null, policy_number: cardRecords[0].policyNumber ?? null, emergency_number: cardRecords[0].emergencyNumber ?? null, emergency_region: cardRecords[0].emergencyRegion ?? null, emergency_notes: cardRecords[0].emergencyNotes ?? null, updated_at: cardRecords[0].updatedAt ?? cardRecords[0].updated_at } : null };
  const contactsResult = { data: collect('trusted_contact').map((record) => ({ id: record.id, name: record.name, relationship: record.relationship ?? null, phone: record.phone ?? null, email: record.email ?? null, consent_status: record.revoked ? 'revoked' : record.consentGranted ? 'accepted' : 'pending', created_at: record.createdAt ?? record.updated_at, updated_at: record.updated_at })) };
  const incidentResult = { data: collect('emergency_incident').map((record) => ({
    id: record.id,
    // Accept both the mobile camelCase event shape and the snake_case shape
    // emitted by reviewed API/import clients. The local projection remains
    // deliberately limited to incident history fields.
    created_at: record.createdAt ?? record.created_at ?? record.updated_at,
    reason: record.reason ?? 'user_requested_help',
    contact_state: record.contactState ?? record.contact_state ?? 'queued_local',
    updated_at: record.updated_at,
  })) };
  const until = snapshot.until;

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

  const schedules = new Map<string, { hour: number; minute: number; times: string[]; schedule?: unknown }>();
  for (const schedule of schedulesResult.data ?? []) {
    if (schedules.has(schedule.medication_id)) continue;
    const times = jsonArray(schedule.times_json);
    const schedulePayload = jsonObject(schedule.schedule);
    const firstTime = times[0] ?? (typeof schedulePayload.anchorTime === 'string' ? schedulePayload.anchorTime : schedulePayload.kind === 'meal_relative' ? '00:00' : undefined);
    const match = firstTime?.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) schedules.set(schedule.medication_id, { hour, minute, times, schedule: schedule.schedule });
    }
  }

  let downloaded = 0;
  await db.withTransactionAsync(async () => {
    for (const reading of glucoseResult.data ?? []) {
      if (await preserveLocalChange('glucose_reading', reading.id, reading as unknown as Record<string, unknown>)) continue;
      const unit = localUnit(reading.unit_original);
      const value = Number(reading.value_original);
      await db.runAsync(`INSERT INTO glucose_readings (id, value, unit, value_mg_dl, conversion_version, context, source, meal_offset_minutes, recorded_at, timezone, utc_offset_minutes, time_edited, symptoms, note, ketone_result, sync_state, risk_classification, risk_rule_id, risk_plan_updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET value = excluded.value, unit = excluded.unit, value_mg_dl = excluded.value_mg_dl, conversion_version = excluded.conversion_version, context = excluded.context, source = excluded.source, meal_offset_minutes = excluded.meal_offset_minutes, recorded_at = excluded.recorded_at, timezone = excluded.timezone, utc_offset_minutes = excluded.utc_offset_minutes, time_edited = excluded.time_edited, symptoms = excluded.symptoms, note = excluded.note, ketone_result = excluded.ketone_result, sync_state = 'synced', risk_classification = excluded.risk_classification, risk_rule_id = excluded.risk_rule_id, risk_plan_updated_at = excluded.risk_plan_updated_at`,
        reading.id, value, unit, typeof reading.value_mg_dl === 'number' ? reading.value_mg_dl : toCanonicalMgDl(value, unit), reading.conversion_version ?? conversionVersionForUnit(unit), localContext(reading.context), localSource(reading.source), reading.meal_offset_minutes, reading.measured_at, reading.timezone, reading.utc_offset_minutes, reading.time_edited ? 1 : 0, reading.symptoms?.join(', ') ?? null, reading.note ?? null, ['not_checked', 'negative', 'trace', 'small', 'moderate', 'large', 'unknown'].includes(String(reading.ketone_result)) ? String(reading.ketone_result) : 'unknown', localRisk(reading.classification) ?? null, typeof reading.risk_rule_id === 'string' ? reading.risk_rule_id : null, typeof reading.risk_plan_updated_at === 'string' ? reading.risk_plan_updated_at : null);
      downloaded += 1;
    }
    for (const medication of medicationsResult.data ?? []) {
      const time = schedules.get(medication.id) ?? { hour: 8, minute: 0, times: ['08:00'], schedule: null };
      if (await preserveLocalChange('medication', medication.id, { ...(medication as unknown as Record<string, unknown>), times: time.times, schedule: time.schedule })) continue;
      await db.runAsync(`INSERT INTO medications (id, name, presentation, dose_text, route, prescriber_name, instructions, start_date, end_date, hour, minute, times_json, schedule_json, enabled, reminder_state, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unavailable', ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, presentation = excluded.presentation, dose_text = excluded.dose_text, route = excluded.route, prescriber_name = excluded.prescriber_name, instructions = excluded.instructions, start_date = excluded.start_date, end_date = excluded.end_date, hour = excluded.hour, minute = excluded.minute, times_json = excluded.times_json, schedule_json = excluded.schedule_json, enabled = excluded.enabled`,
        medication.id, medication.name, medication.presentation, medication.dose_text, localRoute(medication.route), medication.prescriber_name, medication.instructions, medication.start_date, medication.end_date, time.hour, time.minute, JSON.stringify(time.times), JSON.stringify(time.schedule ?? { kind: 'fixed', times: time.times }), medication.enabled ? 1 : 0, medication.created_at);
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
    for (const incident of incidentResult.data ?? []) {
      if (await preserveLocalChange('emergency_incident', incident.id, incident as unknown as Record<string, unknown>)) continue;
      await db.runAsync(`INSERT INTO help_events (id, created_at, reason, contact_state)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET created_at = excluded.created_at, reason = excluded.reason, contact_state = excluded.contact_state`,
        incident.id, incident.created_at, incident.reason, incident.contact_state);
      downloaded += 1;
    }
  });
  await setLastPulledAt(db, until);
  return downloaded;
}
