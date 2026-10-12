import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../components/Typography';
import { Panel } from '../components/Panel';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAuth } from '../authContext';
import { colors, radii, spacing } from '../theme/tokens';

export default function AuthScreen() {
  const { isConfigured, isLoading, session, error, signIn, signUp, signOut, deleteAccount } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!email.trim() || password.length < 12) {
      Alert.alert('Completa los datos', 'Escribe un correo y una contraseña de al menos 12 caracteres.');
      return;
    }
    setSaving(true);
    try {
      if (mode === 'signIn') {
        await signIn(email.trim(), password);
        router.back();
      } else {
        const result = await signUp(email.trim(), password);
        Alert.alert('Cuenta creada', result.needsEmailConfirmation ? 'Revisa tu correo para confirmar la cuenta antes de iniciar sesión.' : 'Tu cuenta está lista.');
        if (!result.needsEmailConfirmation) router.back();
      }
    } catch {
      // The context keeps the provider message; this copy avoids exposing secrets or internals.
      Alert.alert('No se pudo completar', 'Revisa tus datos e inténtalo de nuevo.');
    } finally { setSaving(false); }
  }

  async function logout() {
    setSaving(true);
    try { await signOut(); router.back(); } catch { Alert.alert('No se pudo cerrar sesión', 'Vuelve a intentarlo.'); } finally { setSaving(false); }
  }

  function requestDeleteAccount() {
    Alert.alert('Borrar cuenta cloud', 'Esta acción elimina la cuenta y los registros sincronizados. Los datos locales de este dispositivo no se borran automáticamente; expórtalos o bórralos desde Perfil.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar cuenta', style: 'destructive', onPress: () => void (async () => { setSaving(true); try { await deleteAccount(); Alert.alert('Cuenta eliminada', 'La cuenta cloud y sus registros sincronizados fueron eliminados.'); router.back(); } catch { Alert.alert('No se pudo borrar', 'La información no se modificó. Vuelve a intentarlo.'); } finally { setSaving(false); } })() },
    ]);
  }

  return (
    <Screen>
      <PrimaryButton label="Volver" tone="quiet" onPress={() => router.back()} />
      <Eyebrow>Sincronización opcional</Eyebrow>
      <Heading>Protege tu continuidad</Heading>
      <Body>El registro local funciona sin cuenta. La sincronización solo se activa cuando tú la eliges.</Body>
      {!isConfigured ? <Panel tone="urgent"><Caption>CONFIGURACIÓN PENDIENTE</Caption><Text style={styles.title}>La nube aún no está conectada</Text><Body>Este build necesita EXPO_PUBLIC_API_URL para habilitar cuentas en el backend PostgreSQL del VPS. Tus datos locales siguen disponibles.</Body></Panel> : session ? <Panel><Caption>SESIÓN ACTIVA</Caption><Text style={styles.title}>{session.user.email ?? 'Cuenta GlucoCare'}</Text><Body>La sincronización puede pausarse desde la configuración del dispositivo. Exporta tus datos antes de borrar la cuenta.</Body><PrimaryButton label={saving ? 'Cerrando…' : 'Cerrar sesión'} tone="urgent" onPress={() => void logout()} disabled={saving} /><PrimaryButton label="Borrar cuenta cloud" tone="urgent" onPress={requestDeleteAccount} disabled={saving} /></Panel> : <>
        <Panel>
          <Caption>{mode === 'signIn' ? 'INICIAR SESIÓN' : 'CREAR CUENTA'}</Caption>
          <TextInput accessibilityLabel="Correo electrónico" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="correo@ejemplo.com" placeholderTextColor={colors.textDisabled} style={styles.input} />
          <TextInput accessibilityLabel="Contraseña" secureTextEntry value={password} onChangeText={setPassword} placeholder="Contraseña" placeholderTextColor={colors.textDisabled} style={styles.input} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label={saving || isLoading ? 'Procesando…' : mode === 'signIn' ? 'Iniciar sesión' : 'Crear cuenta'} onPress={() => void submit()} disabled={saving || isLoading} />
        </Panel>
        <Pressable accessibilityRole="button" onPress={() => setMode((current) => current === 'signIn' ? 'signUp' : 'signIn')} style={styles.switchButton}><Text style={styles.switchText}>{mode === 'signIn' ? '¿No tienes cuenta? Crear una' : 'Ya tengo cuenta; iniciar sesión'}</Text></Pressable>
      </>}
      <Text style={styles.disclaimer}>Nunca compartimos tus datos clínicos con un contacto sin el consentimiento que configures.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  input: { color: colors.textPrimary, backgroundColor: colors.surfaceRaised, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, minHeight: 52, fontSize: 16, marginBottom: spacing.xs },
  error: { color: colors.urgent, fontSize: 13, lineHeight: 18, marginBottom: spacing.xs },
  switchButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  switchText: { color: colors.amber, fontSize: 15, fontWeight: '700' },
  disclaimer: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingBottom: spacing.lg },
});
