import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { GlucoseProvider } from '../context';
import { CareProvider } from '../careContext';
import { migrateDbIfNeeded } from '../db/migrations';
import { colors } from '../theme/tokens';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="glucocare.db" onInit={migrateDbIfNeeded}>
      <GlucoseProvider>
        <CareProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="log" options={{ presentation: 'modal' }} />
            <Stack.Screen name="help" options={{ presentation: 'modal' }} />
            <Stack.Screen name="medication" options={{ presentation: 'modal' }} />
            <Stack.Screen name="appointment" options={{ presentation: 'modal' }} />
          </Stack>
        </CareProvider>
      </GlucoseProvider>
    </SQLiteProvider>
  );
}
