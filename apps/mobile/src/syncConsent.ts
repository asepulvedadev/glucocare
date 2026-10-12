import type { PrivacyConsent } from './types/privacy';

type SyncEvent = {
  entityType: string;
  payload: Record<string, unknown>;
};

/**
 * Contact details are an optional sharing purpose, separate from cloud sync.
 * A revocation event remains uploadable while that purpose is disabled so a
 * previous remote consent can still be withdrawn.
 */
export function canUploadEventForConsent(event: SyncEvent, consent: PrivacyConsent) {
  if (event.entityType === 'privacy_consent') {
    // Withdrawal remains uploadable after cloud sync is disabled. A remote
    // grant still requires the current local cloud-sync consent.
    return event.payload.emergencySharingConsent !== true || consent.cloudSyncConsent;
  }
  if (event.entityType !== 'trusted_contact' || consent.emergencySharingConsent) return true;
  return event.payload.revoked === true;
}

export function cloudTrustedContactConsentStatus(payload: Record<string, unknown>) {
  return payload.revoked === true ? 'revoked' as const : 'pending' as const;
}
