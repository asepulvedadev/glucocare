import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../components/Typography';
import { Panel } from '../components/Panel';
import { PrimaryButton } from '../components/PrimaryButton';
import { useCare } from '../careContext';
import { medicationRouteLabel, type MedicationRoute } from '../types/care';
import { colors, radii, spacing } from '../theme/tokens';

const routes: MedicationRoute[] = ['oral', 'injection', 'inhaled', 'topical', 'other'];

function parseTime(raw: string) {
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export default function MedicationScreen() {
  const { addMedication } = useCare();
  const [name, setName] = useState('');
  const [doseText, setDoseText] = useState('');
  const [route, setRoute] = useState<MedicationRoute>('oral');
  const [time, setTime] = useState('08:00');
  const [saving, setSaving] = useState(false);

  async function save() {
    const parsedTime = parseTime(time);
    if (!name.trim() || !doseText.trim() || !parsedTime) {
      Alert.alert('Completa los datos', 'Escribe el nombre, la dosis indicada por tu equipo y una hora válida en formato HH:MM.');
      return;
    }
    setSaving(true);
    try {
      const state = await addMedication({ name: name.trim(), doseText: doseText.trim(), route, hour: parsedTime.hour, minute: parsedTime.minute, enabled: true });
      if (state === 'permission_denied') {
        Alert.alert('Medicamento guardado', 'El registro quedó guardado, pero las notificaciones están deshabilitadas. Actívalas en la configuración del dispositivo para recibir recordatorios.');
      } else if (state === 'unavailable') {
        Alert.alert('Medicamento guardado', 'El registro quedó guardado. Los recordatorios nativos estarán disponibles en Android o iOS.');
      }
      router.back();
    } catch {
      Alert.alert('No se pudo guardar', 'Conserva las instrucciones y vuelve a intentarlo.');
    } finally { setSaving(false); }
  }

  return (
    <Screen>
      <PrimaryButton label="Volver" tone="quiet" onPress={() => router.back()} />
      <Eyebrow>Nuevo medicamento</Eyebrow>
      <Heading>Configura un recordatorio</Heading>
      <Body>Escribe exactamente lo indicado por tu equipo de salud. La app no calcula ni cambia dosis.</Body>
      <Panel>
        <Caption>NOMBRE</Caption>
        <TextInput accessibilityLabel="Nombre del medicamento" value={name} onChangeText={setName} placeholder="Ej. Metformina" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <Caption>DOSIS INDICADA</Caption>
        <TextInput accessibilityLabel="Dosis indicada" value={doseText} onChangeText={setDoseText} placeholder="Ej. 500 mg" placeholderTextColor={colors.textDisabled} style={styles.input} />
      </Panel>
      <Panel>
        <Caption>MEDIO DE SUMINISTRO</Caption>
        <View style={styles.chips}>{routes.map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected: route === option }} onPress={() => setRoute(option)} style={[styles.chip, route === option && styles.chipSelected]}><Text style={[styles.chipText, route === option && styles.chipSelectedText]}>{medicationRouteLabel[option]}</Text></Pressable>)}</View>
      </Panel>
      <Panel>
        <Caption>HORA DEL RECORDATORIO</Caption>
        <TextInput accessibilityLabel="Hora del recordatorio" value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" placeholder="08:00" placeholderTextColor={colors.textDisabled} style={[styles.input, styles.timeInput]} />
        <Body>Se repetirá todos los días a esta hora. El sistema operativo puede limitar alarmas exactas o pedir permisos.</Body>
      </Panel>
      <PrimaryButton label={saving ? 'Guardando…' : 'Guardar medicamento'} onPress={() => void save()} disabled={saving} />
      <Text style={styles.disclaimer}>Los recordatorios son una ayuda y no garantizan la entrega. Si pierdes una toma, sigue tu plan de atención.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { color: colors.textPrimary, backgroundColor: colors.surfaceRaised, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, minHeight: 52, fontSize: 16 },
  timeInput: { fontSize: 28, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.surfaceRaised, borderColor: colors.amber },
  chipText: { color: colors.textSecondary, fontSize: 14 },
  chipSelectedText: { color: colors.textPrimary },
  disclaimer: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingBottom: spacing.lg },
});
