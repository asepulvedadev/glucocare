export type ExportRange = 7 | 30 | 'all';

export const exportRangeLabel: Record<ExportRange, string> = {
  7: 'Últimos 7 días',
  30: 'Últimos 30 días',
  all: 'Todo el historial',
};

export const exportRangeOptions: ExportRange[] = [7, 30, 'all'];

/** Returns the UTC lower bound for a rolling export period. */
export function exportRangeSince(range: ExportRange, now = new Date()): string | null {
  if (range === 'all') return null;
  return new Date(now.getTime() - range * 24 * 60 * 60 * 1000).toISOString();
}
