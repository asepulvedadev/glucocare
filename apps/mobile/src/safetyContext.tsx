import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getEmergencyCard, grantTrustedContactConsent, insertTrustedContact, listTrustedContacts, revokeAllTrustedContactConsent as revokeAllStoredTrustedContactConsent, revokeTrustedContact, updateTrustedContact as updateStoredTrustedContact, upsertEmergencyCard } from './db/safetyRepository';
import type { EmergencyCard, NewEmergencyCard, NewTrustedContact, TrustedContact } from './types/safety';
import { newId } from './ids';
import { cloudApi } from './cloudApi';
import { useAuth } from './authContext';

export type TrustedContactInvitationChannel = 'email' | 'sms';

type SafetyContextValue = {
  emergencyCard: EmergencyCard | null;
  trustedContacts: TrustedContact[];
  isLoading: boolean;
  saveEmergencyCard: (input: NewEmergencyCard) => Promise<void>;
  addTrustedContact: (input: NewTrustedContact) => Promise<void>;
  updateTrustedContact: (contactId: string, input: NewTrustedContact) => Promise<void>;
  grantTrustedContactConsent: (contactId: string) => Promise<void>;
  sendTrustedContactInvitation: (contactId: string, channel: TrustedContactInvitationChannel) => Promise<{ invitationId: string; status: string; deliveryStatus: string; acceptUrl: string }>;
  revokeTrustedContact: (contactId: string) => Promise<void>;
  revokeAllTrustedContactConsent: () => Promise<number>;
  refresh: () => Promise<void>;
};
const SafetyContext = createContext<SafetyContextValue | null>(null);

export function SafetyProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const { session } = useAuth();
  const [emergencyCard, setEmergencyCard] = useState<EmergencyCard | null>(null);
  const [trustedContacts, setTrustedContacts] = useState<TrustedContact[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [card, contacts] = await Promise.all([getEmergencyCard(db), listTrustedContacts(db)]);
      setEmergencyCard(card); setTrustedContacts(contacts);
    } finally { setIsLoading(false); }
  }, [db]);

  useEffect(() => {
    let active = true;
    void Promise.all([getEmergencyCard(db), listTrustedContacts(db)]).then(([card, contacts]) => {
      if (active) { setEmergencyCard(card); setTrustedContacts(contacts); }
    }).finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [db]);

  const saveCard = useCallback(async (input: NewEmergencyCard) => {
    const card: EmergencyCard = { id: 'default', ...input, updatedAt: new Date().toISOString() };
    await upsertEmergencyCard(db, card); setEmergencyCard(card);
  }, [db]);

  const addContact = useCallback(async (input: NewTrustedContact) => {
    const contact: TrustedContact = { ...input, id: newId(), createdAt: new Date().toISOString() };
    await insertTrustedContact(db, contact); setTrustedContacts((current) => [...current, contact]);
  }, [db]);

  const updateContact = useCallback(async (contactId: string, input: NewTrustedContact) => {
    const current = trustedContacts.find((item) => item.id === contactId);
    if (!current) throw new Error('Trusted contact not found.');
    const updated = await updateStoredTrustedContact(db, { ...input, id: current.id, createdAt: current.createdAt, consentGranted: false });
    setTrustedContacts((items) => items.map((item) => item.id === updated.id ? updated : item));
  }, [db, trustedContacts]);

  const revokeContact = useCallback(async (contactId: string) => {
    await revokeTrustedContact(db, contactId);
    setTrustedContacts((current) => current.filter((contact) => contact.id !== contactId));
  }, [db]);

  const revokeAllContactConsent = useCallback(async () => {
    const count = await revokeAllStoredTrustedContactConsent(db);
    await refresh();
    return count;
  }, [db, refresh]);

  const grantContactConsent = useCallback(async (contactId: string) => {
    const contact = await grantTrustedContactConsent(db, contactId);
    setTrustedContacts((current) => current.map((item) => item.id === contact.id ? contact : item));
  }, [db]);

  const sendContactInvitation = useCallback(async (contactId: string, channel: TrustedContactInvitationChannel) => {
    if (!session) throw new Error('Cloud sync is not configured for this build.');
    return cloudApi.createInvitation(contactId, channel, session);
  }, [session]);

  const value = useMemo(() => ({ emergencyCard, trustedContacts, isLoading, saveEmergencyCard: saveCard, addTrustedContact: addContact, updateTrustedContact: updateContact, grantTrustedContactConsent: grantContactConsent, sendTrustedContactInvitation: sendContactInvitation, revokeTrustedContact: revokeContact, revokeAllTrustedContactConsent: revokeAllContactConsent, refresh }), [emergencyCard, trustedContacts, isLoading, saveCard, addContact, updateContact, grantContactConsent, sendContactInvitation, revokeContact, revokeAllContactConsent, refresh]);
  return <SafetyContext.Provider value={value}>{children}</SafetyContext.Provider>;
}

export function useSafety() {
  const value = useContext(SafetyContext);
  if (!value) throw new Error('useSafety must be used inside SafetyProvider');
  return value;
}
