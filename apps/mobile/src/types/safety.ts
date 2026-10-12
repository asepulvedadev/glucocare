export type EmergencyCard = {
  id: 'default';
  fullName: string;
  birthDate?: string;
  diabetesType?: string;
  allergies?: string;
  careProvider?: string;
  careFacility?: string;
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
