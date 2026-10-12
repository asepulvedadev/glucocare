import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { configureNotificationPreferences, refreshNotificationSchedules } from './notifications';
import { useSQLiteContext } from 'expo-sqlite';
import { getAccessibilityPreferences, upsertAccessibilityPreferences } from './db/preferencesRepository';
import type { AccessibilityPreferenceKey, AccessibilityPreferences } from './types/preferences';
import type { GlucoseUnit } from './types/domain';

type AccessibilityContextValue = {
  preferences: AccessibilityPreferences;
  isLoading: boolean;
  setPreference: (key: AccessibilityPreferenceKey, value: boolean) => Promise<void>;
  setGlucoseUnit: (unit: GlucoseUnit) => Promise<void>;
  refresh: () => Promise<void>;
};

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

export function AccessibilityProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [preferences, setPreferences] = useState<AccessibilityPreferences>({ id: 'default', simpleMode: false, largeText: false, highContrast: false, reduceMotion: false, notificationSound: true, notificationVibration: true, appLockEnabled: false, onboardingCompleted: false, glucoseUnit: 'mg/dL', updatedAt: new Date().toISOString() });
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [stored, systemReduceMotion] = await Promise.all([getAccessibilityPreferences(db), AccessibilityInfo.isReduceMotionEnabled()]);
      const next = { ...stored, reduceMotion: stored.reduceMotion || systemReduceMotion };
      setPreferences(next);
      configureNotificationPreferences(next);
    } finally { setIsLoading(false); }
  }, [db]);

  useEffect(() => {
    let active = true;
    void Promise.all([getAccessibilityPreferences(db), AccessibilityInfo.isReduceMotionEnabled()]).then(([stored, systemReduceMotion]) => {
      if (active) {
        const next = { ...stored, reduceMotion: stored.reduceMotion || systemReduceMotion };
        setPreferences(next);
        configureNotificationPreferences(next);
      }
    }).finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [db]);

  const setPreference = useCallback(async (key: AccessibilityPreferenceKey, value: boolean) => {
    const next = { ...preferences, [key]: value, updatedAt: new Date().toISOString() };
    await upsertAccessibilityPreferences(db, next);
    setPreferences(next);
    configureNotificationPreferences(next);
    if (key === 'notificationSound' || key === 'notificationVibration') {
      try { await refreshNotificationSchedules(db); } catch { /* Keep local preferences even if native scheduling is unavailable. */ }
    }
  }, [db, preferences]);

  const setGlucoseUnit = useCallback(async (glucoseUnit: GlucoseUnit) => {
    const next = { ...preferences, glucoseUnit, updatedAt: new Date().toISOString() };
    await upsertAccessibilityPreferences(db, next);
    setPreferences(next);
  }, [db, preferences]);

  const value = useMemo(() => ({ preferences, isLoading, setPreference, setGlucoseUnit, refresh }), [preferences, isLoading, setPreference, setGlucoseUnit, refresh]);
  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibility() {
  const value = useContext(AccessibilityContext);
  if (!value) throw new Error('useAccessibility must be used inside AccessibilityProvider');
  return value;
}
