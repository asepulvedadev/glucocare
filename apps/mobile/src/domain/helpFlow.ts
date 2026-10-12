/**
 * Keeps the emergency remote-alert gate pure and reviewable. A direct call is
 * intentionally independent from this decision and remains available when
 * any cloud or consent prerequisite is missing.
 */
export function canQueueRemoteEmergencyAlert(input: {
  authenticated: boolean;
  cloudConfigured: boolean;
  localDataConsent: boolean;
  cloudSyncConsent: boolean;
  emergencySharingConsent: boolean;
  consentedContactCount: number;
}) {
  return input.authenticated
    && input.cloudConfigured
    && input.localDataConsent
    && input.cloudSyncConsent
    && input.emergencySharingConsent
    && input.consentedContactCount > 0;
}
