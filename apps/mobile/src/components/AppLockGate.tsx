import { PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform, StyleSheet, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { usePathname, useRouter } from 'expo-router';
import { Screen } from './Screen';
import { Body, Caption, Heading } from './Typography';
import { PrimaryButton } from './PrimaryButton';
import { spacing } from '../theme/tokens';
import { useAccessibility } from '../accessibilityContext';

async function authenticate() {
  return LocalAuthentication.authenticateAsync({
    promptMessage: 'Desbloquea GlucoCare',
    promptSubtitle: 'Protege tus datos de salud',
    cancelLabel: 'Cancelar',
  });
}

function isUnavailable(error: LocalAuthentication.LocalAuthenticationError | undefined) {
  return error === 'not_available' || error === 'not_enrolled' || error === 'passcode_not_set';
}

/** Keeps routine data behind the device lock while preserving offline emergency access. */
export function AppLockGate({ children }: PropsWithChildren) {
  const { preferences, isLoading, setPreference } = useAccessibility();
  const pathname = usePathname();
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const authenticatingRef = useRef(false);
  const bypass = pathname === '/help' || pathname === '/onboarding';
  const shouldProtect = Platform.OS !== 'web' && !isLoading && preferences.onboardingCompleted && preferences.appLockEnabled && !bypass;

  const unlock = useCallback(async () => {
    if (authenticatingRef.current) return;
    authenticatingRef.current = true;
    setAuthenticating(true);
    try {
      const result = await authenticate();
      if (result.success) {
        setUnlocked(true);
      } else if (isUnavailable(result.error)) {
        await setPreference('appLockEnabled', false);
        setUnlocked(true);
        Alert.alert('Bloqueo desactivado', 'Este dispositivo ya no tiene un método de desbloqueo disponible. Puedes volver a activarlo desde Perfil cuando configures uno.');
      }
    } catch {
      Alert.alert('No se pudo desbloquear', 'Intenta de nuevo. Si necesitas ayuda urgente, abre la ayuda de emergencia sin desbloquear la aplicación.');
    } finally {
      setAuthenticating(false);
      authenticatingRef.current = false;
    }
  }, [setPreference]);

  useEffect(() => {
    let active = true;
    if (!shouldProtect) {
      const timer = setTimeout(() => { if (active) setUnlocked(true); }, 0);
      return () => { active = false; clearTimeout(timer); };
    }
    const timer = setTimeout(() => {
      if (!active) return;
      setUnlocked(false);
      void unlock();
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [shouldProtect, unlock]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (!shouldProtect) return;
      if (state !== 'active') setUnlocked(false);
      if (state === 'active') void unlock();
    });
    return () => subscription.remove();
  }, [shouldProtect, unlock]);

  if (!shouldProtect || unlocked) return <>{children}</>;
  return (
    <Screen scroll={false} showHelp={false}>
      <View accessible accessibilityLiveRegion="polite" style={styles.lockPanel}>
        <Caption>APLICACIÓN BLOQUEADA</Caption>
        <Heading>Desbloquea GlucoCare</Heading>
        <Body>Tus registros permanecen protegidos en este dispositivo. La ayuda de emergencia sigue disponible sin desbloquear.</Body>
        <PrimaryButton label={authenticating ? 'Esperando autenticación…' : 'Desbloquear'} disabled={authenticating} onPress={() => void unlock()} />
        <PrimaryButton label="Abrir ayuda de emergencia" tone="urgent" onPress={() => router.push('/help')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lockPanel: { flex: 1, justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
});
