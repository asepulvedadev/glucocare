import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getEmergencyCard, grantTrustedContactConsent, insertTrustedContact, listTrustedContacts, revokeTrustedContact, upsertEmergencyCard } from './db/safetyRepository';
import type { EmergencyCard, NewEmergencyCard, NewTrustedContact, TrustedContact } from './types/safety';
import { newId } from './ids';

type SafetyContextValue = {
  emergencyCard: EmergencyCard | null;
  trustedContacts: TrustedContact[];
  isLoading: boolean;
  saveEmergencyCard: (input: NewEmergencyCard) => Promise<void>;
  addTrustedContact: (input: NewTrustedContact) => Promise<void>;
  grantTrustedContactConsent: (contactId: string) => Promise<void>;
  revokeTrustedContact: (contactId: string) => Promise<void>;
  refresh: () => Promise<void>;
};
const SafetyContext = createContext<SafetyContextValue | null>(null);

export function SafetyProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
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

  const revokeContact = useCallback(async (contactId: string) => {
    await revokeTrustedContact(db, contactId);
    setTrustedContacts((current) => current.filter((contact) => contact.id !== contactId));
  }, [db]);

  const grantContactConsent = useCallback(async (contactId: string) => {
    const contact = await grantTrustedContactConsent(db, contactId);
    setTrustedContacts((current) => current.map((item) => item.id === contact.id ? contact : item));
  }, [db]);

  const value = useMemo(() => ({ emergencyCard, trustedContacts, isLoading, saveEmergencyCard: saveCard, addTrustedContact: addContact, grantTrustedContactConsent: grantContactConsent, revokeTrustedContact: revokeContact, refresh }), [emergencyCard, trustedContacts, isLoading, saveCard, addContact, grantContactConsent, revokeContact, refresh]);
  return <SafetyContext.Provider value={value}>{children}</SafetyContext.Provider>;
}

export function useSafety() {
  const value = useContext(SafetyContext);
  if (!value) throw new Error('useSafety must be used inside SafetyProvider');
  return value;
}
