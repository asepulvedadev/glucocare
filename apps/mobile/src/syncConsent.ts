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
  if (event.entityType !== 'trusted_contact' || consent.emergencySharingConsent) return true;
  return event.payload.revoked === true;
}
