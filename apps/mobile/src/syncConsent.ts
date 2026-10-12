import type { PrivacyConsent } from './types/privacy';

type SyncEvent = {
  entityType: string;
  payload: Record<string, unknown>;
};

/** A consent event that removes a server-side authorization must remain
 * uploadable even after the user disables cloud sync. */
export function isPrivacyRevocationEvent(event: SyncEvent) {
  return event.entityType === 'privacy_consent'
    && (event.payload.localDataConsent === false
      || event.payload.cloudSyncConsent === false
      || event.payload.emergencySharingConsent === false);
}

/**
 * Contact details are an optional sharing purpose, separate from cloud sync.
 * A revocation event remains uploadable while that purpose is disabled so a
 * previous remote consent can still be withdrawn.
 */
export function canUploadEventForConsent(event: SyncEvent, consent: PrivacyConsent) {
  if (event.entityType === 'privacy_consent') {
    // Withdrawal remains uploadable after cloud sync is disabled. A complete
    // remote grant still requires the current local cloud-sync consent.
    return isPrivacyRevocationEvent(event) || consent.cloudSyncConsent;
  }
  if (event.entityType !== 'trusted_contact' || consent.emergencySharingConsent) return true;
  return event.payload.revoked === true;
}

export function cloudTrustedContactConsentStatus(payload: Record<string, unknown>) {
  return payload.revoked === true ? 'revoked' as const : 'pending' as const;
}
