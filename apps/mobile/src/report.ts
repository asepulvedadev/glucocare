export type ClinicianReportReading = {
  value: number;
  unit: string;
  context: string;
  recorded_at: string;
  symptoms: string | null;
  note: string | null;
  risk_classification: string | null;
};
export type ClinicianReportMedication = { name: string; dose_text: string; route: string; prescriber_name?: string | null; instructions?: string | null; start_date?: string | null; end_date?: string | null; times_json: string | null; enabled: number };
export type ClinicianReportAppointment = { title: string; provider: string; scheduled_at: string; status: string; location: string | null };
export type ClinicianReportCard = { full_name: string; birth_date: string | null; diabetes_type: string | null; diagnosis_year?: string | null; insulin_use?: string | null; allergies: string | null; critical_conditions?: string | null; care_provider: string | null; care_facility: string | null; insurer?: string | null; policy_number?: string | null; emergency_notes: string | null };

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
  card: ClinicianReportCard | null;
  readings: ClinicianReportReading[];
  medications: ClinicianReportMedication[];
  appointments: ClinicianReportAppointment[];
}) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const readingRows = input.readings.length ? input.readings.map((reading) => `<tr><td>${reportDate(reading.recorded_at)}</td><td><strong>${escapeHtml(reading.value)} ${escapeHtml(reading.unit)}</strong></td><td>${escapeHtml(reading.context)}</td><td>${escapeHtml(reading.risk_classification || 'Sin clasificación')}</td><td>${escapeHtml(reading.symptoms || reading.note || '—')}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">Sin lecturas registradas.</td></tr>';
  const medicationRows = input.medications.length ? input.medications.map((medication) => {
    let times = '—';
    try {
      const parsed: unknown = medication.times_json ? JSON.parse(medication.times_json) : [];
      if (Array.isArray(parsed)) times = parsed.filter((item): item is string => typeof item === 'string').join(', ') || '—';
    } catch { /* Keep the report readable if a legacy schedule is malformed. */ }
    const validity = medication.start_date || medication.end_date ? `${medication.start_date || '—'} → ${medication.end_date || '—'}` : '—';
    const details = [medication.prescriber_name ? `Indicó: ${medication.prescriber_name}` : '', medication.instructions || ''].filter(Boolean).join(' · ') || '—';
    return `<tr><td>${escapeHtml(medication.name)}</td><td>${escapeHtml(medication.dose_text)}</td><td>${escapeHtml(medication.route)}</td><td>${escapeHtml(times)}</td><td>${escapeHtml(validity)}</td><td>${escapeHtml(details)}</td><td>${medication.enabled ? 'Activa' : 'Inactiva'}</td></tr>`;
  }).join('') : '<tr><td colspan="7" class="muted">Sin medicamentos registrados.</td></tr>';
  const appointmentRows = input.appointments.length ? input.appointments.map((appointment) => `<tr><td>${reportDate(appointment.scheduled_at)}</td><td>${escapeHtml(appointment.title)}</td><td>${escapeHtml(appointment.provider)}</td><td>${escapeHtml(appointment.status)}</td><td>${escapeHtml(appointment.location || '—')}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">Sin citas registradas.</td></tr>';
  const card = input.card;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reporte GlucoCare</title><style>
    @page{size:letter;margin:18mm}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#1d1d1b;font-size:11px;line-height:1.45}h1{font-size:24px;margin:0 0 2px}h2{font-size:15px;margin:22px 0 7px;border-bottom:2px solid #ffbe55;padding-bottom:3px}p{margin:4px 0}.muted{color:#68635b}table{width:100%;border-collapse:collapse;margin-top:6px;page-break-inside:auto}th,td{border:1px solid #d8d2c8;padding:5px;text-align:left;vertical-align:top}th{background:#f5efe6;font-size:10px}tr{page-break-inside:avoid}.meta{color:#68635b;font-size:10px}.warning{background:#fff4df;border-left:4px solid #ffbe55;padding:8px;margin:12px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px}.label{font-weight:700;color:#68635b;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
  </style></head><body><h1>Reporte de seguimiento — GlucoCare</h1><p class="meta">Generado el ${reportDate(generatedAt)} · Información proporcionada por la persona usuaria</p><div class="warning">Este documento organiza registros para conversar con el equipo de salud. No es un diagnóstico, no calcula dosis y no reemplaza una atención médica.</div>
  <h2>Datos de la persona</h2><div class="grid"><p><span class="label">Nombre</span><br>${escapeHtml(card?.full_name || '—')}</p><p><span class="label">Fecha de nacimiento</span><br>${escapeHtml(card?.birth_date || '—')}</p><p><span class="label">Tipo de diabetes</span><br>${escapeHtml(card?.diabetes_type || '—')}</p><p><span class="label">Año de diagnóstico</span><br>${escapeHtml(card?.diagnosis_year || '—')}</p><p><span class="label">Uso de insulina</span><br>${escapeHtml(card?.insulin_use || '—')}</p><p><span class="label">Alergias</span><br>${escapeHtml(card?.allergies || '—')}</p><p><span class="label">Condiciones críticas</span><br>${escapeHtml(card?.critical_conditions || '—')}</p><p><span class="label">Profesional</span><br>${escapeHtml(card?.care_provider || '—')}</p><p><span class="label">Centro de atención</span><br>${escapeHtml(card?.care_facility || '—')}</p><p><span class="label">EPS/asegurador</span><br>${escapeHtml(card?.insurer || '—')}</p><p><span class="label">Póliza/afiliación</span><br>${escapeHtml(card?.policy_number || '—')}</p></div>${card?.emergency_notes ? `<p><span class="label">Notas para emergencia</span><br>${escapeHtml(card.emergency_notes)}</p>` : ''}
  <h2>Lecturas de glucosa</h2><table><thead><tr><th>Fecha/hora</th><th>Valor</th><th>Contexto</th><th>Clasificación registrada</th><th>Síntomas/nota</th></tr></thead><tbody>${readingRows}</tbody></table>
  <h2>Medicamentos y horarios</h2><table><thead><tr><th>Medicamento</th><th>Dosis indicada</th><th>Vía</th><th>Horarios</th><th>Vigencia</th><th>Origen/instrucciones</th><th>Estado</th></tr></thead><tbody>${medicationRows}</tbody></table>
  <h2>Citas</h2><table><thead><tr><th>Fecha/hora</th><th>Motivo</th><th>Profesional/centro</th><th>Estado</th><th>Ubicación</th></tr></thead><tbody>${appointmentRows}</tbody></table>
  <p class="meta" style="margin-top:24px">Comparte este archivo solo con personas autorizadas. Revisa los datos antes de entregarlo.</p></body></html>`;
}
