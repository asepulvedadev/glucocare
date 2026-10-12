import { safeBack } from '../navigation';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../components/Typography';
import { Panel } from '../components/Panel';
import { PrimaryButton } from '../components/PrimaryButton';
import { useSafety } from '../safetyContext';
import { colors, radii, spacing } from '../theme/tokens';
import { emergencyConfig } from '../config';

export default function EmergencyCardScreen() {
  const { emergencyCard, saveEmergencyCard } = useSafety();
  const [fullName, setFullName] = useState(emergencyCard?.fullName ?? '');
  const [birthDate, setBirthDate] = useState(emergencyCard?.birthDate ?? '');
  const [diabetesType, setDiabetesType] = useState(emergencyCard?.diabetesType ?? '');
  const [diagnosisYear, setDiagnosisYear] = useState(emergencyCard?.diagnosisYear ?? '');
  const [insulinUse, setInsulinUse] = useState<'yes' | 'no' | 'unknown'>(emergencyCard?.insulinUse ?? 'unknown');
  const [allergies, setAllergies] = useState(emergencyCard?.allergies ?? '');
  const [criticalConditions, setCriticalConditions] = useState(emergencyCard?.criticalConditions ?? '');
  const [careProvider, setCareProvider] = useState(emergencyCard?.careProvider ?? '');
  const [careFacility, setCareFacility] = useState(emergencyCard?.careFacility ?? '');
  const [insurer, setInsurer] = useState(emergencyCard?.insurer ?? '');
  const [policyNumber, setPolicyNumber] = useState(emergencyCard?.policyNumber ?? '');
  const [emergencyNumber, setEmergencyNumber] = useState(emergencyCard?.emergencyNumber ?? '');
  const [emergencyRegion, setEmergencyRegion] = useState(emergencyCard?.emergencyRegion ?? '');
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
        diagnosisYear: diagnosisYear.trim() || undefined,
        insulinUse,
        allergies: allergies.trim() || undefined,
        criticalConditions: criticalConditions.trim() || undefined,
        careProvider: careProvider.trim() || undefined,
        careFacility: careFacility.trim() || undefined,
        insurer: insurer.trim() || undefined,
        policyNumber: policyNumber.trim() || undefined,
        emergencyNumber: emergencyNumber.trim() || undefined,
        emergencyRegion: emergencyRegion.trim() || undefined,
        emergencyNotes: emergencyNotes.trim() || undefined,
      });
      safeBack();
    } catch {
      Alert.alert('No se pudo guardar', 'Vuelve a intentarlo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <PrimaryButton label="Volver" tone="quiet" onPress={() => safeBack()} />
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
        <TextInput accessibilityLabel="Año de diagnóstico" value={diagnosisYear} onChangeText={setDiagnosisYear} placeholder="Año de diagnóstico (opcional)" placeholderTextColor={colors.textDisabled} keyboardType="number-pad" style={styles.input} />
        <Caption>USO DE INSULINA</Caption>
        <View style={styles.chips}>{([['yes', 'Sí'], ['no', 'No'], ['unknown', 'No sé']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: insulinUse === value }} onPress={() => setInsulinUse(value)} style={[styles.chip, insulinUse === value && styles.chipSelected]}><Text style={[styles.chipText, insulinUse === value && styles.chipSelectedText]}>{label}</Text></Pressable>)}</View>
      </Panel>
      <Panel>
        <Caption>DATOS IMPORTANTES</Caption>
        <TextInput accessibilityLabel="Alergias" value={allergies} onChangeText={setAllergies} placeholder="Alergias conocidas" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Condiciones críticas" value={criticalConditions} onChangeText={setCriticalConditions} placeholder="Otras condiciones importantes" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Profesional o centro de atención" value={careProvider} onChangeText={setCareProvider} placeholder="Profesional o centro de atención" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Lugar habitual de atención" value={careFacility} onChangeText={setCareFacility} placeholder="Hospital, clínica o dirección" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Asegurador o EPS" value={insurer} onChangeText={setInsurer} placeholder="EPS o asegurador (opcional)" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Número de póliza" value={policyNumber} onChangeText={setPolicyNumber} placeholder="Número de póliza o afiliación (opcional)" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Notas de emergencia" value={emergencyNotes} onChangeText={setEmergencyNotes} placeholder="Indicaciones para quien te ayude" placeholderTextColor={colors.textDisabled} style={[styles.input, styles.multiline]} multiline />
      </Panel>
      <Panel>
        <Caption>NÚMERO LOCAL DE EMERGENCIAS</Caption>
        <Body>Verifica el número de tu municipio. Si lo dejas vacío, se usará la configuración inicial: {emergencyConfig.number} ({emergencyConfig.region}).</Body>
        <TextInput accessibilityLabel="Número local de emergencias" value={emergencyNumber} onChangeText={setEmergencyNumber} placeholder="Ej. 123" placeholderTextColor={colors.textDisabled} keyboardType="phone-pad" style={styles.input} />
        <TextInput accessibilityLabel="Región del número de emergencias" value={emergencyRegion} onChangeText={setEmergencyRegion} placeholder="País, ciudad o municipio" placeholderTextColor={colors.textDisabled} style={styles.input} />
      </Panel>
      <PrimaryButton label={saving ? 'Guardando…' : 'Guardar tarjeta'} onPress={() => void save()} disabled={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { color: colors.textPrimary, backgroundColor: colors.surfaceRaised, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, minHeight: 52, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.surfaceRaised, borderColor: colors.amber },
  chipText: { color: colors.textSecondary, fontSize: 14 },
  chipSelectedText: { color: colors.textPrimary },
  multiline: { minHeight: 96, textAlignVertical: 'top', paddingTop: spacing.sm },
});
