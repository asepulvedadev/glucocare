import type { SQLiteDatabase } from 'expo-sqlite';
import type { NewPrivacyConsent, PrivacyConsent } from '../types/privacy';
import { enqueueOutbox } from './outboxRepository';
import { newId } from '../ids';

const POLICY_VERSION = '2026-10-12';

type PrivacyRow = {
  id: 'default';
  policy_version: string;
  local_data_consent: number;
  cloud_sync_consent: number;
  emergency_sharing_consent: number;
  accepted_at: string | null;
  updated_at: string;
};

function mapRow(row: PrivacyRow): PrivacyConsent {
  return {
    id: 'default',
    policyVersion: row.policy_version,
    localDataConsent: row.local_data_consent === 1,
    cloudSyncConsent: row.cloud_sync_consent === 1,
    emergencySharingConsent: row.emergency_sharing_consent === 1,
    acceptedAt: row.accepted_at ?? undefined,
    updatedAt: row.updated_at,
  };
}

export async function getPrivacyConsent(db: SQLiteDatabase): Promise<PrivacyConsent | null> {
  const row = await db.getFirstAsync<PrivacyRow>('SELECT * FROM privacy_consents WHERE id = ?', 'default');
  return row ? mapRow(row) : null;
}

export async function savePrivacyConsent(db: SQLiteDatabase, input: NewPrivacyConsent) {
  const now = new Date().toISOString();
  // Emergency sharing is a cloud purpose. Disabling cloud sync therefore also
  // revokes remote alert authorization, preventing a stale server projection.
  const consent: PrivacyConsent = { id: 'default', ...input, emergencySharingConsent: input.cloudSyncConsent && input.emergencySharingConsent, updatedAt: now };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO privacy_consents (id, policy_version, local_data_consent, cloud_sync_consent, emergency_sharing_consent, accepted_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET policy_version = excluded.policy_version, local_data_consent = excluded.local_data_consent,
         cloud_sync_consent = excluded.cloud_sync_consent, emergency_sharing_consent = excluded.emergency_sharing_consent,
         accepted_at = excluded.accepted_at, updated_at = excluded.updated_at`,
      consent.id, consent.policyVersion, consent.localDataConsent ? 1 : 0, consent.cloudSyncConsent ? 1 : 0,
      consent.emergencySharingConsent ? 1 : 0, consent.acceptedAt ?? null, consent.updatedAt,
    );
    await enqueueOutbox(db, {
      id: newId(), entityType: 'privacy_consent', entityId: consent.id,
      eventType: 'privacy.consent.updated.v1', payload: consent,
    });
  });
  return consent;
}

/** Ensures an existing install gets a server-side consent projection once. */
export async function ensurePrivacyConsentOutbox(db: SQLiteDatabase, consent: PrivacyConsent) {
  const pending = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM sync_outbox
     WHERE entity_type = 'privacy_consent' AND entity_id = 'default'
       AND status IN ('pending', 'sending', 'failed', 'blocked')
     LIMIT 1`,
  );
  if (pending) return;
  await enqueueOutbox(db, {
    id: newId(), entityType: 'privacy_consent', entityId: consent.id,
    eventType: 'privacy.consent.updated.v1', payload: consent,
  });
}

export { POLICY_VERSION };
