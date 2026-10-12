export type PrivacyConsent = {
  id: 'default';
  policyVersion: string;
  locale?: string;
  purposes?: string[];
  dataCategories?: string[];
  recipients?: string[];
  evidenceMethod?: 'in_app_checkbox';
  localDataConsent: boolean;
  cloudSyncConsent: boolean;
  emergencySharingConsent: boolean;
  acceptedAt?: string;
  updatedAt: string;
};

export type NewPrivacyConsent = Omit<PrivacyConsent, 'id' | 'updatedAt'>;
