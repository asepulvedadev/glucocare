import { Stack, usePathname, useRouter } from 'expo-router';
import { AppState } from 'react-native';
import { useCallback, useEffect, useRef } from 'react';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { GlucoseProvider } from '../context';
import { CareProvider } from '../careContext';
import { SafetyProvider } from '../safetyContext';
import { AuthProvider, useAuth } from '../authContext';
import { AccessibilityProvider, useAccessibility } from '../accessibilityContext';
import { migrateDbIfNeeded } from '../db/migrations';
import { colors } from '../theme/tokens';
import { PrivacyProvider } from '../privacyContext';
import { syncPendingData } from '../sync';

/** Replays the local outbox when a cloud session is active or the app resumes. */
function SyncBridge() {
  const db = useSQLiteContext();
  const { session } = useAuth();
  const syncing = useRef(false);
  const sync = useCallback(async () => {
    if (!session || syncing.current) return;
    syncing.current = true;
    try { await syncPendingData(db, session); } catch { /* Local-first data remains available when cloud sync is offline. */ }
    finally { syncing.current = false; }
  }, [db, session]);

  useEffect(() => { void sync(); }, [sync]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void sync(); });
    return () => subscription.remove();
  }, [sync]);
  return null;
}

function AppNavigator() {
  const { preferences, isLoading } = useAccessibility();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!isLoading && !preferences.onboardingCompleted && pathname !== '/onboarding' && pathname !== '/help') router.replace('/onboarding');
  }, [isLoading, pathname, preferences.onboardingCompleted, router]);

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
    <Stack.Screen name="onboarding" options={{ presentation: 'card' }} />
    <Stack.Screen name="(tabs)" />
    <Stack.Screen name="log" options={{ presentation: 'modal' }} />
    <Stack.Screen name="help" options={{ presentation: 'modal' }} />
    <Stack.Screen name="medication" options={{ presentation: 'modal' }} />
    <Stack.Screen name="appointment" options={{ presentation: 'modal' }} />
    <Stack.Screen name="measurement-plan" options={{ presentation: 'modal' }} />
    <Stack.Screen name="care-plan" options={{ presentation: 'modal' }} />
    <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
    <Stack.Screen name="emergency-card" options={{ presentation: 'modal' }} />
    <Stack.Screen name="trusted-contact" options={{ presentation: 'modal' }} />
    <Stack.Screen name="privacy-consent" options={{ presentation: 'modal' }} />
  </Stack>;
}

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="glucocare.db" onInit={migrateDbIfNeeded}>
      <GlucoseProvider>
        <PrivacyProvider>
          <AccessibilityProvider>
            <AuthProvider>
              <SyncBridge />
              <CareProvider>
                <SafetyProvider>
                <StatusBar style="light" />
                <AppNavigator />
                </SafetyProvider>
              </CareProvider>
            </AuthProvider>
          </AccessibilityProvider>
        </PrivacyProvider>
      </GlucoseProvider>
    </SQLiteProvider>
  );
}
