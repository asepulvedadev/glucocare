import { ketoneResultLabel } from './types/domain';
import { medicationScheduleLabel, parseMedicationSchedule } from './domain/medicationSchedule';

export type ClinicianReportReading = {
  value: number;
  unit: string;
  context: string;
  source?: string | null;
  meal_offset_minutes?: number | null;
  recorded_at: string;
  symptoms: string | null;
  note: string | null;
  ketone_result?: string | null;
  risk_classification: string | null;
  risk_rule_id?: string | null;
  risk_plan_updated_at?: string | null;
};
export type ClinicianReportMedication = { name: string; presentation?: string | null; dose_text: string; route: string; prescriber_name?: string | null; instructions?: string | null; inventory_quantity?: number | null; inventory_unit?: string | null; refill_threshold?: number | null; start_date?: string | null; end_date?: string | null; times_json: string | null; schedule_json?: string | null; enabled: number };
export type ClinicianReportAppointment = { title: string; provider: string; specialty?: string | null; insurer?: string | null; authorization_number?: string | null; facility?: string | null; scheduled_at: string; status: string; location: string | null; virtual_url?: string | null; preparation_notes?: string | null };
export type ClinicianReportCard = { full_name: string; birth_date: string | null; document_type?: string | null; document_number?: string | null; diabetes_type: string | null; diagnosis_year?: string | null; insulin_use?: string | null; blood_type?: string | null; rh_factor?: string | null; allergies: string | null; critical_conditions?: string | null; care_provider: string | null; care_facility: string | null; care_address?: string | null; insurer?: string | null; policy_number?: string | null; emergency_number?: string | null; emergency_region?: string | null; emergency_notes: string | null };
export type ClinicianReportMeal = { meal_type: string; occurred_at: string; note: string | null };
export type ClinicianReportMedicationOccurrence = { medication_name: string; dose_text: string; scheduled_at: string; status: string; acted_at: string | null };
export type ClinicianReportHelpEvent = { created_at: string; reason: string; contact_state: string };
export type ClinicianReportCorrection = { occurred_at: string; reason: string | null; before_value: number | null; before_unit: string | null; after_value: number | null; after_unit: string | null };

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function reportDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : escapeHtml(value);
}

/** Builds a user-initiated, local-only report. It is informational and does not diagnose or change treatment. */
export function buildClinicianReportHtml(input: {
  generatedAt?: string;
  periodLabel?: string;
  card: ClinicianReportCard | null;
  readings: ClinicianReportReading[];
  medications: ClinicianReportMedication[];
  appointments: ClinicianReportAppointment[];
  meals?: ClinicianReportMeal[];
  medicationOccurrences?: ClinicianReportMedicationOccurrence[];
  helpEvents?: ClinicianReportHelpEvent[];
  corrections?: ClinicianReportCorrection[];
}) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const readingRows = input.readings.length ? input.readings.map((reading) => {
    const provenance = [reading.risk_rule_id ? `Regla: ${escapeHtml(reading.risk_rule_id)}` : '', reading.risk_plan_updated_at ? `Plan: ${escapeHtml(reportDate(reading.risk_plan_updated_at))}` : ''].filter(Boolean).join('<br>');
    return `<tr><td>${reportDate(reading.recorded_at)}</td><td><strong>${escapeHtml(reading.value)} ${escapeHtml(reading.unit)}</strong></td><td>${escapeHtml(reading.context)}${reading.meal_offset_minutes !== null && reading.meal_offset_minutes !== undefined ? `<br>${escapeHtml(reading.meal_offset_minutes)} min después` : ''}</td><td>${escapeHtml(reading.source || 'manual')}</td><td>${escapeHtml(reading.risk_classification || 'Sin clasificación')}${provenance ? `<br><span class="meta">${provenance}</span>` : ''}</td><td>${escapeHtml(reading.ketone_result && reading.ketone_result in ketoneResultLabel ? ketoneResultLabel[reading.ketone_result as keyof typeof ketoneResultLabel] : 'No revisadas')}</td><td>${escapeHtml(reading.symptoms || reading.note || '—')}</td></tr>`;
  }).join('') : '<tr><td colspan="7" class="muted">Sin lecturas registradas.</td></tr>';
  const medicationRows = input.medications.length ? input.medications.map((medication) => {
    let times = '—';
    try {
      const parsed: unknown = medication.times_json ? JSON.parse(medication.times_json) : [];
      const legacyTimes = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
      const schedule = parseMedicationSchedule(medication.schedule_json, { kind: 'fixed', times: legacyTimes });
      times = medicationScheduleLabel(schedule) || '—';
    } catch { /* Keep the report readable if a legacy schedule is malformed. */ }
    const validity = medication.start_date || medication.end_date ? `${medication.start_date || '—'} → ${medication.end_date || '—'}` : '—';
    const inventory = medication.inventory_quantity !== null && medication.inventory_quantity !== undefined
      ? `Inventario de referencia: ${medication.inventory_quantity} ${medication.inventory_unit || 'unidades'}${medication.refill_threshold !== null && medication.refill_threshold !== undefined ? ` · reposición al llegar a ${medication.refill_threshold}` : ''}`
      : '';
    const details = [medication.prescriber_name ? `Indicó: ${medication.prescriber_name}` : '', medication.instructions || '', inventory].filter(Boolean).join(' · ') || '—';
    return `<tr><td>${escapeHtml(medication.name)}</td><td>${escapeHtml(medication.presentation || '—')}</td><td>${escapeHtml(medication.dose_text)}</td><td>${escapeHtml(medication.route)}</td><td>${escapeHtml(times)}</td><td>${escapeHtml(validity)}</td><td>${escapeHtml(details)}</td><td>${medication.enabled ? 'Activa' : 'Inactiva'}</td></tr>`;
  }).join('') : '<tr><td colspan="8" class="muted">Sin medicamentos registrados.</td></tr>';
  const appointmentRows = input.appointments.length ? input.appointments.map((appointment) => `<tr><td>${reportDate(appointment.scheduled_at)}</td><td>${escapeHtml(appointment.title)}</td><td>${escapeHtml(appointment.provider)}${appointment.specialty ? `<br>${escapeHtml(appointment.specialty)}` : ''}${appointment.facility ? `<br>${escapeHtml(appointment.facility)}` : ''}</td><td>${escapeHtml(appointment.status)}</td><td>${escapeHtml(appointment.location || appointment.virtual_url || '—')}${appointment.authorization_number ? `<br>Autorización: ${escapeHtml(appointment.authorization_number)}` : ''}${appointment.preparation_notes ? `<br>Preparación: ${escapeHtml(appointment.preparation_notes)}` : ''}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">Sin citas registradas.</td></tr>';
  const meals = input.meals ?? [];
  const mealRows = meals.length ? meals.map((meal) => `<tr><td>${reportDate(meal.occurred_at)}</td><td>${escapeHtml(meal.meal_type)}</td><td>${escapeHtml(meal.note || '—')}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">Sin comidas registradas.</td></tr>';
  const medicationOccurrences = input.medicationOccurrences ?? [];
  const medicationOccurrenceRows = medicationOccurrences.length ? medicationOccurrences.map((occurrence) => `<tr><td>${reportDate(occurrence.scheduled_at)}</td><td>${escapeHtml(occurrence.medication_name)}</td><td>${escapeHtml(occurrence.dose_text)}</td><td>${escapeHtml(occurrence.status)}</td><td>${reportDate(occurrence.acted_at)}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">Sin tomas registradas.</td></tr>';
  const helpEvents = input.helpEvents ?? [];
  const helpRows = helpEvents.length ? helpEvents.map((event) => `<tr><td>${reportDate(event.created_at)}</td><td>${escapeHtml(event.reason)}</td><td>${escapeHtml(event.contact_state)}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">Sin solicitudes de ayuda registradas.</td></tr>';
  const corrections = input.corrections ?? [];
  const correctionRows = corrections.length ? corrections.map((correction) => `<tr><td>${reportDate(correction.occurred_at)}</td><td>${correction.before_value === null ? '—' : `${escapeHtml(correction.before_value)} ${escapeHtml(correction.before_unit || '')}`}</td><td>${correction.after_value === null ? '—' : `${escapeHtml(correction.after_value)} ${escapeHtml(correction.after_unit || '')}`}</td><td>${escapeHtml(correction.reason || '—')}</td></tr>`).join('') : '<tr><td colspan="4" class="muted">Sin correcciones registradas.</td></tr>';
  const card = input.card;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reporte GlucoCare</title><style>
    @page{size:letter;margin:18mm}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#1d1d1b;font-size:11px;line-height:1.45}h1{font-size:24px;margin:0 0 2px}h2{font-size:15px;margin:22px 0 7px;border-bottom:2px solid #ffbe55;padding-bottom:3px}p{margin:4px 0}.muted{color:#68635b}table{width:100%;border-collapse:collapse;margin-top:6px;page-break-inside:auto}th,td{border:1px solid #d8d2c8;padding:5px;text-align:left;vertical-align:top}th{background:#f5efe6;font-size:10px}tr{page-break-inside:avoid}.meta{color:#68635b;font-size:10px}.warning{background:#fff4df;border-left:4px solid #ffbe55;padding:8px;margin:12px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px}.label{font-weight:700;color:#68635b;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
  </style></head><body><h1>Reporte de seguimiento — GlucoCare</h1><p class="meta">Generado el ${reportDate(generatedAt)} · Periodo: ${escapeHtml(input.periodLabel || 'Todo el historial')} · Información proporcionada por la persona usuaria</p><div class="warning">Este documento organiza registros para conversar con el equipo de salud. No es un diagnóstico, no calcula dosis y no reemplaza una atención médica.</div>
  <h2>Datos de la persona</h2><div class="grid"><p><span class="label">Nombre</span><br>${escapeHtml(card?.full_name || '—')}</p><p><span class="label">Fecha de nacimiento</span><br>${escapeHtml(card?.birth_date || '—')}</p><p><span class="label">Documento</span><br>${escapeHtml(card?.document_type || '—')} · ${escapeHtml(card?.document_number || '—')}</p><p><span class="label">Tipo de diabetes</span><br>${escapeHtml(card?.diabetes_type || '—')}</p><p><span class="label">Año de diagnóstico</span><br>${escapeHtml(card?.diagnosis_year || '—')}</p><p><span class="label">Uso de insulina</span><br>${escapeHtml(card?.insulin_use || '—')}</p><p><span class="label">Sangre / RH</span><br>${escapeHtml(card?.blood_type || '—')} ${card?.rh_factor === 'positive' ? '+' : card?.rh_factor === 'negative' ? '−' : ''}</p><p><span class="label">Alergias</span><br>${escapeHtml(card?.allergies || '—')}</p><p><span class="label">Condiciones críticas</span><br>${escapeHtml(card?.critical_conditions || '—')}</p><p><span class="label">Profesional</span><br>${escapeHtml(card?.care_provider || '—')}</p><p><span class="label">Centro de atención</span><br>${escapeHtml(card?.care_facility || '—')}</p><p><span class="label">Dirección de atención</span><br>${escapeHtml(card?.care_address || '—')}</p><p><span class="label">EPS/asegurador</span><br>${escapeHtml(card?.insurer || '—')}</p><p><span class="label">Póliza/afiliación</span><br>${escapeHtml(card?.policy_number || '—')}</p><p><span class="label">Emergencias</span><br>${escapeHtml(card?.emergency_number || '—')}</p><p><span class="label">Región de emergencias</span><br>${escapeHtml(card?.emergency_region || '—')}</p></div>${card?.emergency_notes ? `<p><span class="label">Notas para emergencia</span><br>${escapeHtml(card.emergency_notes)}</p>` : ''}
  <h2>Lecturas de glucosa</h2><table><thead><tr><th>Fecha/hora</th><th>Valor</th><th>Contexto</th><th>Origen</th><th>Clasificación registrada</th><th>Cetonas registradas</th><th>Síntomas/nota</th></tr></thead><tbody>${readingRows}</tbody></table>
  <h2>Medicamentos y horarios</h2><table><thead><tr><th>Medicamento</th><th>Presentación</th><th>Dosis indicada</th><th>Vía</th><th>Horarios</th><th>Vigencia</th><th>Origen/instrucciones</th><th>Estado</th></tr></thead><tbody>${medicationRows}</tbody></table>
  <h2>Registro de comidas</h2><table><thead><tr><th>Fecha/hora</th><th>Tipo</th><th>Nota</th></tr></thead><tbody>${mealRows}</tbody></table>
  <h2>Historial de tomas</h2><table><thead><tr><th>Programada</th><th>Medicamento</th><th>Dosis</th><th>Estado</th><th>Registrada</th></tr></thead><tbody>${medicationOccurrenceRows}</tbody></table>
  <h2>Citas</h2><table><thead><tr><th>Fecha/hora</th><th>Motivo</th><th>Profesional/centro</th><th>Estado</th><th>Ubicación</th></tr></thead><tbody>${appointmentRows}</tbody></table>
  <h2>Solicitudes de ayuda</h2><table><thead><tr><th>Fecha/hora</th><th>Motivo</th><th>Estado local</th></tr></thead><tbody>${helpRows}</tbody></table>
  <h2>Correcciones de lecturas</h2><table><thead><tr><th>Fecha/hora</th><th>Antes</th><th>Después</th><th>Motivo</th></tr></thead><tbody>${correctionRows}</tbody></table>
  <p class="meta" style="margin-top:24px">Comparte este archivo solo con personas autorizadas. Revisa los datos antes de entregarlo.</p></body></html>`;
}
