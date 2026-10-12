import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, TextInput } from 'react-native';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../components/Typography';
import { Panel } from '../components/Panel';
import { PrimaryButton } from '../components/PrimaryButton';
import { useSafety } from '../safetyContext';
import { colors, radii, spacing } from '../theme/tokens';

export default function EmergencyCardScreen() {
  const { emergencyCard, saveEmergencyCard } = useSafety();
  const [fullName, setFullName] = useState(emergencyCard?.fullName ?? '');
  const [birthDate, setBirthDate] = useState(emergencyCard?.birthDate ?? '');
  const [diabetesType, setDiabetesType] = useState(emergencyCard?.diabetesType ?? '');
  const [allergies, setAllergies] = useState(emergencyCard?.allergies ?? '');
  const [careProvider, setCareProvider] = useState(emergencyCard?.careProvider ?? '');
  const [careFacility, setCareFacility] = useState(emergencyCard?.careFacility ?? '');
  const [emergencyNotes, setEmergencyNotes] = useState(emergencyCard?.emergencyNotes ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!fullName.trim()) {
      Alert.alert('Falta tu nombre', 'Escribe el nombre que quieres mostrar en la tarjeta.');
      return;
    }
    setSaving(true);
    try {
      await saveEmergencyCard({
        fullName: fullName.trim(),
        birthDate: birthDate.trim() || undefined,
        diabetesType: diabetesType.trim() || undefined,
        allergies: allergies.trim() || undefined,
        careProvider: careProvider.trim() || undefined,
        careFacility: careFacility.trim() || undefined,
        emergencyNotes: emergencyNotes.trim() || undefined,
      });
      router.back();
    } catch {
      Alert.alert('No se pudo guardar', 'Vuelve a intentarlo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <PrimaryButton label="Volver" tone="quiet" onPress={() => router.back()} />
      <Eyebrow>Tarjeta de emergencia</Eyebrow>
      <Heading>Información para ayudar</Heading>
      <Body>Se guarda localmente. Incluye solo datos que quieras compartir si alguien te ayuda.</Body>
      <Panel>
        <Caption>NOMBRE COMPLETO</Caption>
        <TextInput accessibilityLabel="Nombre completo" value={fullName} onChangeText={setFullName} placeholder="Tu nombre" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <Caption>FECHA DE NACIMIENTO</Caption>
        <TextInput accessibilityLabel="Fecha de nacimiento" value={birthDate} onChangeText={setBirthDate} placeholder="AAAA-MM-DD" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <Caption>TIPO DE DIABETES</Caption>
        <TextInput accessibilityLabel="Tipo de diabetes" value={diabetesType} onChangeText={setDiabetesType} placeholder="Según tu diagnóstico" placeholderTextColor={colors.textDisabled} style={styles.input} />
      </Panel>
      <Panel>
        <Caption>DATOS IMPORTANTES</Caption>
        <TextInput accessibilityLabel="Alergias" value={allergies} onChangeText={setAllergies} placeholder="Alergias conocidas" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Profesional o centro de atención" value={careProvider} onChangeText={setCareProvider} placeholder="Profesional o centro de atención" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Lugar habitual de atención" value={careFacility} onChangeText={setCareFacility} placeholder="Hospital, clínica o dirección" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Notas de emergencia" value={emergencyNotes} onChangeText={setEmergencyNotes} placeholder="Indicaciones para quien te ayude" placeholderTextColor={colors.textDisabled} style={[styles.input, styles.multiline]} multiline />
      </Panel>
      <PrimaryButton label={saving ? 'Guardando…' : 'Guardar tarjeta'} onPress={() => void save()} disabled={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { color: colors.textPrimary, backgroundColor: colors.surfaceRaised, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, minHeight: 52, fontSize: 16 },
  multiline: { minHeight: 96, textAlignVertical: 'top', paddingTop: spacing.sm },
});
