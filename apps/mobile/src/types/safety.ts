export type EmergencyCard = {
  id: 'default';
  fullName: string;
  birthDate?: string;
  diabetesType?: string;
  diagnosisYear?: string;
  insulinUse?: 'yes' | 'no' | 'unknown';
  allergies?: string;
  criticalConditions?: string;
  careProvider?: string;
  careFacility?: string;
  insurer?: string;
  policyNumber?: string;
  emergencyNumber?: string;
  emergencyRegion?: string;
  emergencyNotes?: string;
  updatedAt: string;
};

export type TrustedContact = {
  id: string;
  name: string;
  relationship?: string;
  phone?: string;
  email?: string;
  consentGranted: boolean;
  createdAt: string;
};

export type NewEmergencyCard = Omit<EmergencyCard, 'id' | 'updatedAt'>;
export type NewTrustedContact = Omit<TrustedContact, 'id' | 'createdAt'>;
