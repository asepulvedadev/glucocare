export type EmergencyCard = {
  id: 'default';
  fullName: string;
  birthDate?: string;
  documentType?: EmergencyDocumentType;
  documentNumber?: string;
  diabetesType?: string;
  diagnosisYear?: string;
  insulinUse?: 'yes' | 'no' | 'unknown';
  bloodType?: BloodType;
  rhFactor?: RhFactor;
  allergies?: string;
  criticalConditions?: string;
  careProvider?: string;
  careFacility?: string;
  careAddress?: string;
  insurer?: string;
  policyNumber?: string;
  emergencyNumber?: string;
  emergencyRegion?: string;
  emergencyNotes?: string;
  updatedAt: string;
};

/** Colombian identity document labels kept as data, not used for verification. */
export type EmergencyDocumentType = 'CC' | 'TI' | 'CE' | 'PPT' | 'PASSPORT' | 'OTHER';
export type BloodType = 'A' | 'B' | 'AB' | 'O' | 'unknown';
export type RhFactor = 'positive' | 'negative' | 'unknown';

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
