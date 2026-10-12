import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { GlucoseProvider } from '../context';
import { CareProvider } from '../careContext';
import { SafetyProvider } from '../safetyContext';
import { AuthProvider } from '../authContext';
import { AccessibilityProvider } from '../accessibilityContext';
import { migrateDbIfNeeded } from '../db/migrations';
import { colors } from '../theme/tokens';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="glucocare.db" onInit={migrateDbIfNeeded}>
      <GlucoseProvider>
        <AccessibilityProvider>
          <AuthProvider>
            <CareProvider>
              <SafetyProvider>
                <StatusBar style="light" />
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="log" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="help" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="medication" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="appointment" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="measurement-plan" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="emergency-card" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="trusted-contact" options={{ presentation: 'modal' }} />
                </Stack>
              </SafetyProvider>
            </CareProvider>
          </AuthProvider>
        </AccessibilityProvider>
      </GlucoseProvider>
    </SQLiteProvider>
  );
}
