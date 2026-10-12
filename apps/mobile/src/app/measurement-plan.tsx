import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../components/Typography';
import { Panel } from '../components/Panel';
import { PrimaryButton } from '../components/PrimaryButton';
import { useCare } from '../careContext';
import { colors, radii, spacing } from '../theme/tokens';

const defaultTimes = ['08:00', '14:00', '20:00'];

function isValidTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export default function MeasurementPlanScreen() {
  const { measurementPlan, saveMeasurementPlan } = useCare();
  const initialCount = measurementPlan?.readingsPerDay ?? 1;
  const [count, setCount] = useState<1 | 2 | 3>(initialCount);
  const [times, setTimes] = useState<string[]>(measurementPlan?.times ?? [defaultTimes[0]]);
  const [instructions, setInstructions] = useState(measurementPlan?.instructions ?? '');
  const [saving, setSaving] = useState(false);

  const selectedTimes = useMemo(() => times.slice(0, count), [times, count]);

  function changeCount(next: 1 | 2 | 3) {
    setCount(next);
    setTimes((current) => Array.from({ length: next }, (_, index) => current[index] ?? defaultTimes[index]));
  }

  async function save() {
    if (selectedTimes.some((time) => !isValidTime(time))) {
      Alert.alert('Revisa las horas', 'Usa el formato HH:MM, por ejemplo 08:00.');
      return;
    }
    setSaving(true);
    try {
      await saveMeasurementPlan({ readingsPerDay: count, times: selectedTimes, instructions: instructions.trim() || undefined });
      router.back();
    } catch {
      Alert.alert('No se pudo guardar', 'Conserva las instrucciones y vuelve a intentarlo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <PrimaryButton label="Volver" tone="quiet" onPress={() => router.back()} />
      <Eyebrow>Plan de medición</Eyebrow>
      <Heading>Organiza tus lecturas</Heading>
      <Body>Configura la frecuencia indicada por tu equipo de salud. GlucoCare no diagnostica ni cambia objetivos clínicos.</Body>
      <Panel>
        <Caption>LECTURAS POR DÍA</Caption>
        <View style={styles.chips}>
          {[1, 2, 3].map((option) => {
            const value = option as 1 | 2 | 3;
            return <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected: count === value }} onPress={() => changeCount(value)} style={[styles.chip, count === value && styles.chipSelected]}><Text style={[styles.chipText, count === value && styles.chipSelectedText]}>{option}</Text></Pressable>;
          })}
        </View>
      </Panel>
      <Panel>
        <Caption>HORAS SUGERIDAS</Caption>
        {selectedTimes.map((time, index) => <TextInput key={index} accessibilityLabel={`Hora de lectura ${index + 1}`} value={time} onChangeText={(value) => setTimes((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))} keyboardType="numbers-and-punctuation" placeholder="08:00" placeholderTextColor={colors.textDisabled} style={[styles.input, styles.timeInput]} />)}
        <Body>Estas horas solo organizan recordatorios visuales. Ajusta el plan con tu equipo de salud.</Body>
      </Panel>
      <Panel>
        <Caption>INSTRUCCIONES OPCIONALES</Caption>
        <TextInput accessibilityLabel="Instrucciones del plan de medición" value={instructions} onChangeText={setInstructions} multiline placeholder="Ej. antes del desayuno y dos horas después de la cena" placeholderTextColor={colors.textDisabled} style={[styles.input, styles.notes]} />
      </Panel>
      <PrimaryButton label={saving ? 'Guardando…' : 'Guardar plan'} onPress={() => void save()} disabled={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: spacing.xs },
  chip: { minWidth: 56, minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.sm, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.surfaceRaised, borderColor: colors.amber },
  chipText: { color: colors.textSecondary, fontSize: 18, fontWeight: '700' },
  chipSelectedText: { color: colors.textPrimary },
  input: { color: colors.textPrimary, backgroundColor: colors.surfaceRaised, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, minHeight: 52, fontSize: 16, marginBottom: spacing.xs },
  timeInput: { fontSize: 24, fontWeight: '700' },
  notes: { minHeight: 96, textAlignVertical: 'top', paddingTop: spacing.sm },
});
