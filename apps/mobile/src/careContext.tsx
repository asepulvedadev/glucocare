import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { insertMedication, listMedications } from './db/careRepository';
import { scheduleMedicationReminder, type ReminderPermission } from './notifications';
import type { Medication, NewMedication } from './types/care';

type CareContextValue = {
  medications: Medication[];
  isLoading: boolean;
  addMedication: (input: NewMedication) => Promise<ReminderPermission>;
  refresh: () => Promise<void>;
};

const CareContext = createContext<CareContextValue | null>(null);

export function CareProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try { setMedications(await listMedications(db)); } finally { setIsLoading(false); }
  }, [db]);

  useEffect(() => {
    let active = true;
    void listMedications(db).then((stored) => {
      if (active) setMedications(stored);
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [db]);

  const addMedication = useCallback(async (input: NewMedication) => {
    const medication: Medication = {
      ...input,
      id: `medication_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      reminderState: 'unavailable',
    };
    const scheduled = await scheduleMedicationReminder(medication);
    const stored: Medication = {
      ...medication,
      notificationId: scheduled.notificationId,
      reminderState: scheduled.state === 'granted' ? 'scheduled' : scheduled.state,
    };
    await insertMedication(db, stored);
    setMedications((current) => [...current, stored].sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute)));
    return scheduled.state;
  }, [db]);

  const value = useMemo(() => ({ medications, isLoading, addMedication, refresh }), [medications, isLoading, addMedication, refresh]);
  return <CareContext.Provider value={value}>{children}</CareContext.Provider>;
}

export function useCare() {
  const value = useContext(CareContext);
  if (!value) throw new Error('useCare must be used inside CareProvider');
  return value;
}
