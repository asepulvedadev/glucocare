import type { SQLiteDatabase } from 'expo-sqlite';
import type { EmergencyCard, TrustedContact } from '../types/safety';

type EmergencyRow = { id: 'default'; full_name: string; birth_date: string | null; diabetes_type: string | null; allergies: string | null; care_provider: string | null; emergency_notes: string | null; updated_at: string };
type ContactRow = { id: string; name: string; relationship: string | null; phone: string | null; email: string | null; consent_granted: number; created_at: string };

export async function getEmergencyCard(db: SQLiteDatabase): Promise<EmergencyCard | null> {
  const row = await db.getFirstAsync<EmergencyRow>('SELECT * FROM emergency_card WHERE id = ?', 'default');
  if (!row) return null;
  return { id: 'default', fullName: row.full_name, birthDate: row.birth_date ?? undefined, diabetesType: row.diabetes_type ?? undefined, allergies: row.allergies ?? undefined, careProvider: row.care_provider ?? undefined, emergencyNotes: row.emergency_notes ?? undefined, updatedAt: row.updated_at };
}

export async function upsertEmergencyCard(db: SQLiteDatabase, card: EmergencyCard) {
  await db.runAsync(`INSERT INTO emergency_card (id, full_name, birth_date, diabetes_type, allergies, care_provider, emergency_notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET full_name = excluded.full_name, birth_date = excluded.birth_date, diabetes_type = excluded.diabetes_type, allergies = excluded.allergies, care_provider = excluded.care_provider, emergency_notes = excluded.emergency_notes, updated_at = excluded.updated_at`,
    card.id, card.fullName, card.birthDate ?? null, card.diabetesType ?? null, card.allergies ?? null, card.careProvider ?? null, card.emergencyNotes ?? null, card.updatedAt);
}

export async function listTrustedContacts(db: SQLiteDatabase): Promise<TrustedContact[]> {
  const rows = await db.getAllAsync<ContactRow>('SELECT * FROM trusted_contacts ORDER BY created_at ASC');
  return rows.map((row) => ({ id: row.id, name: row.name, relationship: row.relationship ?? undefined, phone: row.phone ?? undefined, email: row.email ?? undefined, consentGranted: row.consent_granted === 1, createdAt: row.created_at }));
}

export async function insertTrustedContact(db: SQLiteDatabase, contact: TrustedContact) {
  await db.runAsync(`INSERT INTO trusted_contacts (id, name, relationship, phone, email, consent_granted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, contact.id, contact.name, contact.relationship ?? null, contact.phone ?? null, contact.email ?? null, contact.consentGranted ? 1 : 0, contact.createdAt);
}
