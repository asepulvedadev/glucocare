import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { insertGlucoseReading, listGlucoseReadings, updateGlucoseReading, type NewGlucoseReading } from './db/glucoseRepository';
import type { GlucoseReading } from './types/domain';
import { getCarePlan } from './db/carePlanRepository';
import { assessGlucose } from './domain/glucoseRisk';
import { notifyUrgentGlucoseRisk } from './notifications';

type GlucoseContextValue = {
  readings: GlucoseReading[];
  isLoading: boolean;
  addReading: (reading: NewGlucoseReading) => Promise<GlucoseReading>;
  updateReading: (readingId: string, reading: NewGlucoseReading) => Promise<GlucoseReading>;
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
    const assessment = assessGlucose(reading.value, reading.unit, carePlan);
    const saved = await insertGlucoseReading(db, { ...reading, riskClassification: assessment.classification, riskRuleId: assessment.ruleId, riskPlanUpdatedAt: assessment.carePlanUpdatedAt });
    setReadings((current) => [saved, ...current]);
    if (saved.riskClassification === 'urgent_low' || saved.riskClassification === 'urgent_high') void notifyUrgentGlucoseRisk(saved.riskClassification);
    return saved;
  }, [db]);

  const updateReading = useCallback(async (readingId: string, reading: NewGlucoseReading) => {
    const before = readings.find((item) => item.id === readingId);
    if (!before) throw new Error('Glucose reading not found.');
    const carePlan = await getCarePlan(db);
    const assessment = assessGlucose(reading.value, reading.unit, carePlan);
    const next: GlucoseReading = {
      ...reading,
      id: before.id,
      syncState: 'pending',
      riskClassification: assessment.classification,
      riskRuleId: assessment.ruleId,
      riskPlanUpdatedAt: assessment.carePlanUpdatedAt,
    };
    const saved = await updateGlucoseReading(db, before, next);
    setReadings((current) => current.map((item) => item.id === saved.id ? saved : item).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)));
    if (saved.riskClassification === 'urgent_low' || saved.riskClassification === 'urgent_high') void notifyUrgentGlucoseRisk(saved.riskClassification);
    return saved;
  }, [db, readings]);

  const value = useMemo(() => ({ readings, isLoading, addReading, updateReading, refresh }), [readings, isLoading, addReading, updateReading, refresh]);
  return <GlucoseContext.Provider value={value}>{children}</GlucoseContext.Provider>;
}

export function useGlucose() {
  const value = useContext(GlucoseContext);
  if (!value) throw new Error('useGlucose must be used inside GlucoseProvider');
  return value;
}
