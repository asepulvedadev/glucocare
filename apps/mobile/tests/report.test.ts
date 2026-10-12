import { describe, expect, it } from 'vitest';

import { buildClinicianReportHtml } from '../src/report';

describe('clinician report', () => {
  it('renders the safety disclaimer and escapes user-provided values', () => {
    const html = buildClinicianReportHtml({
      generatedAt: '2026-10-12T12:00:00.000Z',
      card: { full_name: '<Ana>', birth_date: null, diabetes_type: 'Tipo 2', allergies: null, care_provider: null, care_facility: null, emergency_notes: null },
      readings: [{ value: 120, unit: 'mg/dL', context: 'fasting', recorded_at: '2026-10-12T10:00:00.000Z', symptoms: '<script>', note: null, risk_classification: null }],
      medications: [],
      appointments: [],
    });
    expect(html).toContain('&lt;Ana&gt;');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('no calcula dosis');
    expect(html).toContain('Lecturas de glucosa');
  });
});
