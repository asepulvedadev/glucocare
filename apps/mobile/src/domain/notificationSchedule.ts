/**
 * Native operating systems cap the number of pending local notifications. Keep
 * one shared budget for medication, measurement, and appointment reminders so
 * one large schedule cannot silently evict another safety-relevant reminder.
 */
export const MAX_PENDING_LOCAL_REMINDERS = 60;

export type ManagedNotificationKind = 'medication' | 'measurement' | 'appointment';

export type NotificationCandidate = {
  key: string;
  kind: ManagedNotificationKind;
  ownerId: string;
  scheduledAt: Date;
  mealEventId?: string;
  windowIndex?: number;
};

/**
 * Deduplicates and selects the earliest candidates within the native budget.
 * Rebuilding this rolling window on app resume makes omitted future reminders
 * eligible again without creating duplicate requests.
 */
export function selectNotificationCandidates(
  candidates: NotificationCandidate[],
  limit = MAX_PENDING_LOCAL_REMINDERS,
): NotificationCandidate[] {
  if (!Number.isInteger(limit) || limit < 1) return [];
  const unique = new Map<string, NotificationCandidate>();
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.scheduledAt.getTime())) continue;
    const key = candidate.key || `${candidate.kind}:${candidate.ownerId}:${candidate.scheduledAt.toISOString()}`;
    if (!unique.has(key)) unique.set(key, { ...candidate, key });
  }
  return [...unique.values()]
    .sort((left, right) => {
      const time = left.scheduledAt.getTime() - right.scheduledAt.getTime();
      if (time !== 0) return time;
      return left.key.localeCompare(right.key);
    })
    .slice(0, limit);
}
