import { describe, expect, it } from 'vitest';

import { buildClinicianReportHtml } from '../src/report';

describe('clinician report', () => {
  it('renders the safety disclaimer and escapes user-provided values', () => {
    const html = buildClinicianReportHtml({
      generatedAt: '2026-10-12T12:00:00.000Z',
      periodLabel: 'Últimos 7 días',
      card: { full_name: '<Ana>', birth_date: null, diabetes_type: 'Tipo 2', allergies: null, care_provider: null, care_facility: null, emergency_number: '123', emergency_region: 'Bogotá', emergency_notes: null },
      readings: [{ value: 120, unit: 'mg/dL', context: 'fasting', recorded_at: '2026-10-12T10:00:00.000Z', symptoms: '<script>', note: null, ketone_result: 'moderate', risk_classification: 'high', risk_rule_id: '<rule>', risk_plan_updated_at: '2026-10-01T12:00:00.000Z' }],
      medications: [{ name: 'Metformin', presentation: 'tableta', dose_text: '500 mg', route: 'oral', times_json: '["08:00"]', enabled: 1 }],
      appointments: [],
      meals: [{ meal_type: 'lunch', occurred_at: '2026-10-12T12:00:00.000Z', note: '<note>' }],
      medicationOccurrences: [{ medication_name: 'Metformin', dose_text: '500 mg', scheduled_at: '2026-10-12T08:00:00.000Z', status: 'taken', acted_at: '2026-10-12T08:03:00.000Z' }],
      helpEvents: [{ created_at: '2026-10-12T13:00:00.000Z', reason: 'user_requested_help', contact_state: 'queued_local' }],
      corrections: [{ occurred_at: '2026-10-12T14:00:00.000Z', reason: '<reason>', before_value: 120, before_unit: 'mg/dL', after_value: 130, after_unit: 'mg/dL' }],
    });
    expect(html).toContain('&lt;Ana&gt;');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Regla: &lt;rule&gt;');
    expect(html).toContain('Plan:');
    expect(html).toContain('no calcula dosis');
    expect(html).toContain('Lecturas de glucosa');
    expect(html).toContain('Cetonas registradas');
    expect(html).toContain('Moderadas');
    expect(html).toContain('Periodo: Últimos 7 días');
    expect(html).toContain('Historial de tomas');
    expect(html).toContain('Emergencias');
    expect(html).toContain('Bogotá');
    expect(html).toContain('Metformin');
    expect(html).toContain('tableta');
    expect(html).toContain('&lt;note&gt;');
    expect(html).toContain('&lt;reason&gt;');
  });
});
