import type { SQLiteDatabase } from 'expo-sqlite';
import { markOutboxAcked, markOutboxBlocked, markOutboxFailed, listPendingOutbox, unblockOutboxByEntityType } from './db/outboxRepository';
import { cloudApi, type AuthSession } from './cloudApi';
import { getLastPulledAt } from './db/syncMetadataRepository';
import { pullCloudData } from './syncPull';
import { resolveSyncConflictsForEntity } from './db/syncConflictRepository';
import { getPrivacyConsent } from './db/privacyRepository';
import { canUploadEventForConsent } from './syncConsent';

export type SyncResult = {
  state: 'synced' | 'disabled' | 'signed_out' | 'consent_required' | 'failed';
  uploaded: number;
  failed: number;
  downloaded: number;
};

export async function syncPendingData(db: SQLiteDatabase, session: AuthSession | null): Promise<SyncResult> {
  if (!session) return { state: 'signed_out', uploaded: 0, failed: 0, downloaded: 0 };
  if (!cloudApi) return { state: 'disabled', uploaded: 0, failed: 0, downloaded: 0 };
  const consent = await getPrivacyConsent(db);
  if (!consent?.localDataConsent || !consent.cloudSyncConsent) return { state: 'consent_required', uploaded: 0, failed: 0, downloaded: 0 };
  if (consent.emergencySharingConsent) await unblockOutboxByEntityType(db, 'trusted_contact');

  let downloaded = 0;
  let failed = 0;
  try { downloaded += await pullCloudData(db, session.user.id, await getLastPulledAt(db), session); } catch { failed += 1; }

  const pending = await listPendingOutbox(db);
  let uploaded = 0;
  for (const event of pending) {
    if (!canUploadEventForConsent(event, consent)) { await markOutboxBlocked(db, event.id); continue; }
    try {
      await cloudApi.uploadEvent({ id: event.id, eventType: event.eventType, entityType: event.entityType, entityId: event.entityId, payload: event.payload }, session);
      if (event.entityType === 'glucose_reading') await db.runAsync(`UPDATE glucose_readings SET sync_state = 'synced' WHERE id = ?`, event.entityId);
      if (event.entityType === 'meal_event') await db.runAsync(`UPDATE meal_events SET sync_state = 'synced' WHERE id = ?`, event.entityId);
      await markOutboxAcked(db, event.id);
      await resolveSyncConflictsForEntity(db, event.entityType, event.entityId, 'local');
      uploaded += 1;
    } catch {
      await markOutboxFailed(db, event.id, event.attemptCount + 1);
      if (event.entityType === 'glucose_reading') await db.runAsync(`UPDATE glucose_readings SET sync_state = 'failed' WHERE id = ?`, event.entityId);
      if (event.entityType === 'meal_event') await db.runAsync(`UPDATE meal_events SET sync_state = 'failed' WHERE id = ?`, event.entityId);
      failed += 1;
    }
  }
  try { downloaded += await pullCloudData(db, session.user.id, await getLastPulledAt(db), session); } catch { failed += 1; }
  return { state: failed > 0 ? 'failed' : 'synced', uploaded, failed, downloaded };
}
