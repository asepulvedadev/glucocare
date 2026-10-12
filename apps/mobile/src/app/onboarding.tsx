import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../components/Typography';
import { Panel } from '../components/Panel';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAccessibility } from '../accessibilityContext';
import { usePrivacy } from '../privacyContext';
import { useSafety } from '../safetyContext';
import { emergencyConfig } from '../config';
import { colors, radii, spacing } from '../theme/tokens';

function CheckRow({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={styles.checkRow}>
    <View style={[styles.checkbox, checked && styles.checkboxChecked]}><Text style={styles.checkmark}>{checked ? '✓' : ''}</Text></View>
    <Body>{label}</Body>
  </Pressable>;
}

export default function OnboardingScreen() {
  const { preferences, setPreference } = useAccessibility();
  const { saveConsent } = usePrivacy();
  const { saveEmergencyCard } = useSafety();
  const [step, setStep] = useState(0);
  const [largeText, setLargeText] = useState(preferences.largeText);
  const [simpleMode, setSimpleMode] = useState(preferences.simpleMode);
  const [highContrast, setHighContrast] = useState(preferences.highContrast);
  const [localDataConsent, setLocalDataConsent] = useState(false);
  const [cloudSyncConsent, setCloudSyncConsent] = useState(false);
  const [emergencySharingConsent, setEmergencySharingConsent] = useState(false);
  const [fullName, setFullName] = useState('');
  const [emergencyNumber, setEmergencyNumber] = useState('');
  const [emergencyRegion, setEmergencyRegion] = useState('');
  const [saving, setSaving] = useState(false);

  async function finish() {
    if (!localDataConsent) {
      Alert.alert('Falta una confirmación', 'Necesitamos tu autorización para guardar registros en este dispositivo.');
      setStep(1);
      return;
    }
    if ((emergencyNumber.trim() || emergencyRegion.trim()) && !fullName.trim()) {
      Alert.alert('Completa la tarjeta', 'Escribe tu nombre para guardar el número de emergencias en tu tarjeta. También puedes dejar esos campos vacíos y configurarlos después.');
      setStep(2);
      return;
    }
    setSaving(true);
    try {
      await saveConsent({ localDataConsent, cloudSyncConsent, emergencySharingConsent });
      await setPreference('largeText', largeText);
      await setPreference('simpleMode', simpleMode);
      await setPreference('highContrast', highContrast);
      if (fullName.trim()) {
        await saveEmergencyCard({
          fullName: fullName.trim(),
          emergencyNumber: emergencyNumber.trim() || undefined,
          emergencyRegion: emergencyRegion.trim() || undefined,
        });
      }
      await setPreference('onboardingCompleted', true);
      router.replace('/(tabs)');
    } catch {
      Alert.alert('No se pudo guardar', 'Conservamos la pantalla para que puedas intentarlo de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return <Screen>
    <Eyebrow>Primeros pasos · {step + 1} de 3</Eyebrow>
    {step === 0 ? <>
      <Heading>Tu control, en calma.</Heading>
      <Body>GlucoCare te ayuda a registrar lecturas, rutinas, citas y solicitudes de ayuda. No diagnostica ni cambia tratamientos.</Body>
      <Panel tone="teal"><Caption>ANTES DE EMPEZAR</Caption><Body>La app funciona sin cuenta y conserva tus registros en este dispositivo. Más adelante puedes configurar sincronización, medicamentos y el plan de tu equipo.</Body></Panel>
      <Panel>
        <Caption>LECTURA Y NAVEGACIÓN</Caption>
        <CheckRow label="Texto grande" checked={largeText} onPress={() => setLargeText((value) => !value)} />
        <CheckRow label="Modo simple, con menos controles secundarios" checked={simpleMode} onPress={() => setSimpleMode((value) => !value)} />
        <CheckRow label="Alto contraste" checked={highContrast} onPress={() => setHighContrast((value) => !value)} />
      </Panel>
      <PrimaryButton label="Continuar" onPress={() => setStep(1)} />
    </> : step === 1 ? <>
      <Heading>Decide qué guardar y compartir</Heading>
      <Body>Puedes cambiar estas preferencias desde Perfil. La sincronización cloud y los avisos a contactos son opcionales.</Body>
      <Panel>
        <Caption>NECESARIO PARA USAR EL REGISTRO</Caption>
        <CheckRow label="Autorizo guardar mis registros de salud en este dispositivo." checked={localDataConsent} onPress={() => setLocalDataConsent((value) => !value)} />
      </Panel>
      <Panel>
        <Caption>OPCIONAL</Caption>
        <CheckRow label="Autorizo sincronizar mis registros con mi cuenta cloud cuando inicie sesión." checked={cloudSyncConsent} onPress={() => setCloudSyncConsent((value) => !value)} />
        <CheckRow label="Autorizo avisos a mis contactos consentidos cuando active ayuda." checked={emergencySharingConsent} onPress={() => setEmergencySharingConsent((value) => !value)} />
      </Panel>
      <View style={styles.actions}><PrimaryButton label="Atrás" tone="quiet" onPress={() => setStep(0)} /><PrimaryButton label="Continuar" onPress={() => setStep(2)} /></View>
    </> : <>
      <Heading>Prepara tu ayuda offline</Heading>
      <Body>Configura una tarjeta básica y verifica el número local. Puedes completar más datos después desde Perfil.</Body>
      <Panel tone="urgent">
        <Caption>NÚMERO INICIAL DE REFERENCIA</Caption>
        <Body>{emergencyConfig.number} · {emergencyConfig.region}. Verifícalo con tu municipio antes de usarlo.</Body>
      </Panel>
      <Panel>
        <Caption>OPCIONAL · TARJETA DE EMERGENCIA</Caption>
        <TextInput accessibilityLabel="Nombre para la tarjeta de emergencia" value={fullName} onChangeText={setFullName} placeholder="Tu nombre" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Número local de emergencias" value={emergencyNumber} onChangeText={setEmergencyNumber} placeholder="Número local verificado" placeholderTextColor={colors.textDisabled} keyboardType="phone-pad" style={styles.input} />
        <TextInput accessibilityLabel="Región del número local" value={emergencyRegion} onChangeText={setEmergencyRegion} placeholder="Ciudad o municipio" placeholderTextColor={colors.textDisabled} style={styles.input} />
      </Panel>
      <View style={styles.actions}><PrimaryButton label="Atrás" tone="quiet" onPress={() => setStep(1)} /><PrimaryButton label={saving ? 'Guardando…' : 'Entrar a GlucoCare'} onPress={() => void finish()} disabled={saving} /></View>
      <Text style={styles.note}>Si necesitas ayuda urgente, llama directamente a emergencias. La app no garantiza que un aviso sea recibido.</Text>
    </>}
    <PrimaryButton label="Necesito ayuda ahora" tone="urgent" onPress={() => router.push('/help')} />
  </Screen>;
}

const styles = StyleSheet.create({
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56 },
  checkbox: { width: 28, height: 28, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.amber, borderColor: colors.amber },
  checkmark: { color: colors.canvas, fontSize: 20, fontWeight: '800' },
  input: { color: colors.textPrimary, backgroundColor: colors.surfaceRaised, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, minHeight: 52, fontSize: 16, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  note: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingBottom: spacing.lg },
});
