import type { SQLiteDatabase } from 'expo-sqlite';
import { markOutboxAcked, markOutboxBlocked, markOutboxFailed, listPendingOutbox, listPendingPrivacyConsentOutbox, unblockOutboxByEntityType } from './db/outboxRepository';
import { cloudApi, type AuthSession } from './cloudApi';
import { getLastPulledAt } from './db/syncMetadataRepository';
import { pullCloudData } from './syncPull';
import { resolveSyncConflictsForEntity } from './db/syncConflictRepository';
import { getPrivacyConsent } from './db/privacyRepository';
import { canUploadEventForConsent, isPrivacyRevocationEvent } from './syncConsent';

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
  const cloudSyncAllowed = Boolean(consent?.localDataConsent && consent.cloudSyncConsent);
  const pending = cloudSyncAllowed ? await listPendingOutbox(db) : [];
  const privacyPending = cloudSyncAllowed ? pending : await listPendingPrivacyConsentOutbox(db);
  const privacyRevocations = privacyPending.filter(isPrivacyRevocationEvent);
  // A withdrawal is a safety-critical server authorization change. It must
  // still reach the VPS after cloud sync is disabled, while ordinary health
  // records remain local-only until the user opts back in.
  if (!cloudSyncAllowed && privacyRevocations.length === 0) return { state: 'consent_required', uploaded: 0, failed: 0, downloaded: 0 };
  if (cloudSyncAllowed && consent?.emergencySharingConsent) await unblockOutboxByEntityType(db, 'trusted_contact');

  let downloaded = 0;
  let failed = 0;
  if (cloudSyncAllowed) {
    try { downloaded += await pullCloudData(db, session.user.id, await getLastPulledAt(db), session); } catch { failed += 1; }
  }
  let uploaded = 0;
  const eventsToUpload = cloudSyncAllowed ? pending : privacyRevocations;
  const consentForUpload = consent ?? {
    id: 'default' as const,
    policyVersion: 'unknown',
    localDataConsent: false,
    cloudSyncConsent: false,
    emergencySharingConsent: false,
    updatedAt: new Date(0).toISOString(),
  };
  for (const event of eventsToUpload) {
    if (!canUploadEventForConsent(event, consentForUpload)) { await markOutboxBlocked(db, event.id); continue; }
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
  if (cloudSyncAllowed) {
    try { downloaded += await pullCloudData(db, session.user.id, await getLastPulledAt(db), session); } catch { failed += 1; }
  }
  return { state: failed > 0 ? 'failed' : 'synced', uploaded, failed, downloaded };
}
