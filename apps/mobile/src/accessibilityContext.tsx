import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getAccessibilityPreferences, upsertAccessibilityPreferences } from './db/preferencesRepository';
import type { AccessibilityPreferenceKey, AccessibilityPreferences } from './types/preferences';

type AccessibilityContextValue = {
  preferences: AccessibilityPreferences;
  isLoading: boolean;
  setPreference: (key: AccessibilityPreferenceKey, value: boolean) => Promise<void>;
};

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

export function AccessibilityProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [preferences, setPreferences] = useState<AccessibilityPreferences>({ id: 'default', simpleMode: false, largeText: false, highContrast: false, reduceMotion: false, updatedAt: new Date().toISOString() });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void Promise.all([getAccessibilityPreferences(db), AccessibilityInfo.isReduceMotionEnabled()]).then(([stored, systemReduceMotion]) => {
      if (active) setPreferences({ ...stored, reduceMotion: stored.reduceMotion || systemReduceMotion });
    }).finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [db]);

  const setPreference = useCallback(async (key: AccessibilityPreferenceKey, value: boolean) => {
    const next = { ...preferences, [key]: value, updatedAt: new Date().toISOString() };
    await upsertAccessibilityPreferences(db, next);
    setPreferences(next);
  }, [db, preferences]);

  const value = useMemo(() => ({ preferences, isLoading, setPreference }), [preferences, isLoading, setPreference]);
  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibility() {
  const value = useContext(AccessibilityContext);
  if (!value) throw new Error('useAccessibility must be used inside AccessibilityProvider');
  return value;
}
