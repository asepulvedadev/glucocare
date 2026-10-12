import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { insertGlucoseReading, listGlucoseReadings, type NewGlucoseReading } from './db/glucoseRepository';
import type { GlucoseReading } from './types/domain';
import { getCarePlan } from './db/carePlanRepository';
import { classifyGlucose } from './domain/glucoseRisk';
import { notifyUrgentGlucoseRisk } from './notifications';

type GlucoseContextValue = {
  readings: GlucoseReading[];
  isLoading: boolean;
  addReading: (reading: NewGlucoseReading) => Promise<GlucoseReading>;
  refresh: () => Promise<void>;
};

const GlucoseContext = createContext<GlucoseContextValue | null>(null);

export function GlucoseProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [readings, setReadings] = useState<GlucoseReading[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try { setReadings(await listGlucoseReadings(db)); } finally { setIsLoading(false); }
  }, [db]);

  useEffect(() => {
    let active = true;
    void listGlucoseReadings(db).then((stored) => {
      if (active) setReadings(stored);
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [db]);

  const addReading = useCallback(async (reading: NewGlucoseReading) => {
    const carePlan = await getCarePlan(db);
    const saved = await insertGlucoseReading(db, { ...reading, riskClassification: classifyGlucose(reading.value, reading.unit, carePlan) });
    setReadings((current) => [saved, ...current]);
    if (saved.riskClassification === 'urgent_low' || saved.riskClassification === 'urgent_high') void notifyUrgentGlucoseRisk(saved.riskClassification);
    return saved;
  }, [db]);

  const value = useMemo(() => ({ readings, isLoading, addReading, refresh }), [readings, isLoading, addReading, refresh]);
  return <GlucoseContext.Provider value={value}>{children}</GlucoseContext.Provider>;
}

export function useGlucose() {
  const value = useContext(GlucoseContext);
  if (!value) throw new Error('useGlucose must be used inside GlucoseProvider');
  return value;
}
