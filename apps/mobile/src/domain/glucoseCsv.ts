export type GlucoseCsvRow = Record<string, unknown>;

export const glucoseCsvColumns = [
  'id', 'recorded_at', 'timezone', 'utc_offset_minutes', 'time_edited',
  'value', 'unit', 'value_mg_dl', 'conversion_version', 'context', 'source',
  'meal_offset_minutes', 'ketone_result', 'risk_classification', 'risk_rule_id',
  'risk_plan_updated_at', 'symptoms', 'note',
] as const;

function csvValue(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

/** Builds a traceable, clinician-friendly CSV without dropping provenance. */
export function buildGlucoseCsv(rows: GlucoseCsvRow[]) {
  const header = glucoseCsvColumns.join(',');
  const body = rows.map((row) => glucoseCsvColumns.map((column) => csvValue(row[column])).join(',')).join('\n');
  return `${header}\n${body}\n`;
}
