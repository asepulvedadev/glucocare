import type { SQLiteDatabase } from 'expo-sqlite';
import type { EmergencyCard, TrustedContact } from '../types/safety';
import { enqueueOutbox } from './outboxRepository';
import { newId } from '../ids';

type EmergencyRow = { id: 'default'; full_name: string; birth_date: string | null; diabetes_type: string | null; diagnosis_year: string | null; insulin_use: 'yes' | 'no' | 'unknown' | null; allergies: string | null; critical_conditions: string | null; care_provider: string | null; care_facility: string | null; insurer: string | null; policy_number: string | null; emergency_number: string | null; emergency_region: string | null; emergency_notes: string | null; updated_at: string };
type ContactRow = { id: string; name: string; relationship: string | null; phone: string | null; email: string | null; consent_granted: number; created_at: string };

export async function getEmergencyCard(db: SQLiteDatabase): Promise<EmergencyCard | null> {
  const row = await db.getFirstAsync<EmergencyRow>('SELECT * FROM emergency_card WHERE id = ?', 'default');
  if (!row) return null;
  return { id: 'default', fullName: row.full_name, birthDate: row.birth_date ?? undefined, diabetesType: row.diabetes_type ?? undefined, diagnosisYear: row.diagnosis_year ?? undefined, insulinUse: row.insulin_use ?? undefined, allergies: row.allergies ?? undefined, criticalConditions: row.critical_conditions ?? undefined, careProvider: row.care_provider ?? undefined, careFacility: row.care_facility ?? undefined, insurer: row.insurer ?? undefined, policyNumber: row.policy_number ?? undefined, emergencyNumber: row.emergency_number ?? undefined, emergencyRegion: row.emergency_region ?? undefined, emergencyNotes: row.emergency_notes ?? undefined, updatedAt: row.updated_at };
}

export async function upsertEmergencyCard(db: SQLiteDatabase, card: EmergencyCard) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(`INSERT INTO emergency_card (id, full_name, birth_date, diabetes_type, diagnosis_year, insulin_use, allergies, critical_conditions, care_provider, care_facility, insurer, policy_number, emergency_number, emergency_region, emergency_notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET full_name = excluded.full_name, birth_date = excluded.birth_date, diabetes_type = excluded.diabetes_type, diagnosis_year = excluded.diagnosis_year, insulin_use = excluded.insulin_use, allergies = excluded.allergies, critical_conditions = excluded.critical_conditions, care_provider = excluded.care_provider, care_facility = excluded.care_facility, insurer = excluded.insurer, policy_number = excluded.policy_number, emergency_number = excluded.emergency_number, emergency_region = excluded.emergency_region, emergency_notes = excluded.emergency_notes, updated_at = excluded.updated_at`,
      card.id, card.fullName, card.birthDate ?? null, card.diabetesType ?? null, card.diagnosisYear ?? null, card.insulinUse ?? null, card.allergies ?? null, card.criticalConditions ?? null, card.careProvider ?? null, card.careFacility ?? null, card.insurer ?? null, card.policyNumber ?? null, card.emergencyNumber ?? null, card.emergencyRegion ?? null, card.emergencyNotes ?? null, card.updatedAt);
    await enqueueOutbox(db, { id: newId(), entityType: 'emergency_card', entityId: card.id, eventType: 'emergency.card.saved.v1', payload: card });
  });
}

export async function listTrustedContacts(db: SQLiteDatabase): Promise<TrustedContact[]> {
  const rows = await db.getAllAsync<ContactRow>('SELECT * FROM trusted_contacts ORDER BY created_at ASC');
  return rows.map((row) => ({ id: row.id, name: row.name, relationship: row.relationship ?? undefined, phone: row.phone ?? undefined, email: row.email ?? undefined, consentGranted: row.consent_granted === 1, createdAt: row.created_at }));
}

export async function insertTrustedContact(db: SQLiteDatabase, contact: TrustedContact) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(`INSERT INTO trusted_contacts (id, name, relationship, phone, email, consent_granted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, contact.id, contact.name, contact.relationship ?? null, contact.phone ?? null, contact.email ?? null, contact.consentGranted ? 1 : 0, contact.createdAt);
    await enqueueOutbox(db, { id: newId(), entityType: 'trusted_contact', entityId: contact.id, eventType: 'contact.created.v1', payload: contact });
  });
}

export async function revokeTrustedContact(db: SQLiteDatabase, contactId: string) {
  const row = await db.getFirstAsync<ContactRow>('SELECT * FROM trusted_contacts WHERE id = ?', contactId);
  if (!row) throw new Error('Trusted contact not found.');
  const contact: TrustedContact = {
    id: row.id,
    name: row.name,
    relationship: row.relationship ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    consentGranted: false,
    createdAt: row.created_at,
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM trusted_contacts WHERE id = ?', contactId);
    await enqueueOutbox(db, {
      id: newId(),
      entityType: 'trusted_contact',
      entityId: contactId,
      eventType: 'contact.revoked.v1',
      payload: { ...contact, revoked: true },
    });
  });
}

export async function grantTrustedContactConsent(db: SQLiteDatabase, contactId: string) {
  const row = await db.getFirstAsync<ContactRow>('SELECT * FROM trusted_contacts WHERE id = ?', contactId);
  if (!row) throw new Error('Trusted contact not found.');
  const contact: TrustedContact = {
    id: row.id,
    name: row.name,
    relationship: row.relationship ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    consentGranted: true,
    createdAt: row.created_at,
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE trusted_contacts SET consent_granted = 1 WHERE id = ?', contactId);
    await enqueueOutbox(db, { id: newId(), entityType: 'trusted_contact', entityId: contactId, eventType: 'contact.consent.updated.v1', payload: contact });
  });
  return contact;
}
