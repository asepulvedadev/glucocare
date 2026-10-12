import type { SQLiteDatabase } from 'expo-sqlite';
import type { NewPrivacyConsent, PrivacyConsent } from '../types/privacy';
import { enqueueOutbox } from './outboxRepository';
import { newId } from '../ids';

const POLICY_VERSION = '2026-10-12';
const CONSENT_LOCALE = 'es-CO';
const BASE_PURPOSES = ['local_record', 'reminders', 'care_plan', 'history_export'] as const;
const DATA_CATEGORIES = ['health_records', 'medications', 'appointments', 'emergency_card', 'trusted_contacts'] as const;
const EVIDENCE_METHOD = 'in_app_checkbox' as const;

type PrivacyRow = {
  id: 'default';
  policy_version: string;
  locale: string;
  purposes_json: string;
  data_categories_json: string;
  recipients_json: string;
  evidence_method: 'in_app_checkbox';
  local_data_consent: number;
  cloud_sync_consent: number;
  emergency_sharing_consent: number;
  accepted_at: string | null;
  updated_at: string;
};

function parseStringArray(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.length <= 64) : [];
  } catch {
    return [];
  }
}

function mapRow(row: PrivacyRow): PrivacyConsent {
  return {
    id: 'default',
    policyVersion: row.policy_version,
    locale: row.locale || CONSENT_LOCALE,
    purposes: parseStringArray(row.purposes_json),
    dataCategories: parseStringArray(row.data_categories_json),
    recipients: parseStringArray(row.recipients_json),
    evidenceMethod: EVIDENCE_METHOD,
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

export async function savePrivacyConsent(db: SQLiteDatabase, input: Omit<NewPrivacyConsent, 'locale' | 'purposes' | 'dataCategories' | 'recipients' | 'evidenceMethod'>) {
  const now = new Date().toISOString();
  // Emergency sharing is a cloud purpose. Disabling cloud sync therefore also
  // revokes remote alert authorization, preventing a stale server projection.
  const emergencySharingConsent = input.cloudSyncConsent && input.emergencySharingConsent;
  const consent: PrivacyConsent = {
    id: 'default', ...input, locale: CONSENT_LOCALE,
    purposes: [...BASE_PURPOSES, ...(input.cloudSyncConsent ? ['cloud_sync'] : []), ...(emergencySharingConsent ? ['trusted_contact_alerts'] : [])],
    dataCategories: [...DATA_CATEGORIES],
    recipients: [...(input.cloudSyncConsent ? ['patient_account'] : []), ...(emergencySharingConsent ? ['trusted_contacts'] : [])],
    evidenceMethod: EVIDENCE_METHOD,
    emergencySharingConsent,
    updatedAt: now,
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO privacy_consents (id, policy_version, locale, purposes_json, data_categories_json, recipients_json, evidence_method, local_data_consent, cloud_sync_consent, emergency_sharing_consent, accepted_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET policy_version = excluded.policy_version, local_data_consent = excluded.local_data_consent,
         locale = excluded.locale, purposes_json = excluded.purposes_json, data_categories_json = excluded.data_categories_json, recipients_json = excluded.recipients_json, evidence_method = excluded.evidence_method,
         cloud_sync_consent = excluded.cloud_sync_consent, emergency_sharing_consent = excluded.emergency_sharing_consent,
         accepted_at = excluded.accepted_at, updated_at = excluded.updated_at`,
      consent.id, consent.policyVersion, consent.locale ?? CONSENT_LOCALE, JSON.stringify(consent.purposes ?? []), JSON.stringify(consent.dataCategories ?? []), JSON.stringify(consent.recipients ?? []), consent.evidenceMethod ?? EVIDENCE_METHOD, consent.localDataConsent ? 1 : 0, consent.cloudSyncConsent ? 1 : 0,
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
