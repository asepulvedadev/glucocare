export type PrivacyConsent = {
  id: 'default';
  policyVersion: string;
  localDataConsent: boolean;
  cloudSyncConsent: boolean;
  emergencySharingConsent: boolean;
  acceptedAt?: string;
  updatedAt: string;
};

export type NewPrivacyConsent = Omit<PrivacyConsent, 'id' | 'updatedAt'>;
