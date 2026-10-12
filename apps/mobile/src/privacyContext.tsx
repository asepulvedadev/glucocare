import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getPrivacyConsent, POLICY_VERSION, savePrivacyConsent } from './db/privacyRepository';
import type { NewPrivacyConsent, PrivacyConsent } from './types/privacy';

type PrivacyContextValue = {
  consent: PrivacyConsent | null;
  isLoading: boolean;
  saveConsent: (input: Omit<NewPrivacyConsent, 'policyVersion' | 'acceptedAt'>) => Promise<void>;
  refresh: () => Promise<void>;
};

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [consent, setConsent] = useState<PrivacyConsent | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try { setConsent(await getPrivacyConsent(db)); } finally { setIsLoading(false); }
  }, [db]);

  useEffect(() => {
    let active = true;
    void getPrivacyConsent(db).then((stored) => { if (active) setConsent(stored); }).finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [db]);

  const save = useCallback(async (input: Omit<NewPrivacyConsent, 'policyVersion' | 'acceptedAt'>) => {
    const acceptedAt = input.localDataConsent ? new Date().toISOString() : undefined;
    const saved = await savePrivacyConsent(db, { ...input, policyVersion: POLICY_VERSION, acceptedAt });
    setConsent(saved);
  }, [db]);

  const value = useMemo(() => ({ consent, isLoading, saveConsent: save, refresh }), [consent, isLoading, save, refresh]);
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy() {
  const value = useContext(PrivacyContext);
  if (!value) throw new Error('usePrivacy must be used inside PrivacyProvider');
  return value;
}
