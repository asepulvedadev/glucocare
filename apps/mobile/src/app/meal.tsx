import { safeBack } from '../navigation';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../components/Typography';
import { Panel } from '../components/Panel';
import { PrimaryButton } from '../components/PrimaryButton';
import { useCare } from '../careContext';
import { mealTypeLabel, type MealType } from '../types/meals';
import { colors, radii, spacing } from '../theme/tokens';

const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function MealScreen() {
  const { addMealEvent } = useCare();
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await addMealEvent({ mealType, occurredAt: new Date().toISOString(), note: note.trim() || undefined });
      safeBack();
    } catch {
      Alert.alert('No se pudo guardar', 'Conserva la hora de la comida y vuelve a intentarlo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <PrimaryButton label="Volver" tone="quiet" onPress={() => safeBack()} />
      <Eyebrow>Registro de comida</Eyebrow>
      <Heading>Marca cuándo comiste</Heading>
      <Body>Esta hora solo organiza mediciones relativas a la comida. No interpreta alimentos ni cambia tu tratamiento.</Body>
      <Panel>
        <Caption>TIPO DE COMIDA</Caption>
        <View style={styles.chips}>
          {mealTypes.map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected: mealType === option }} onPress={() => setMealType(option)} style={[styles.chip, mealType === option && styles.chipSelected]}><Text style={[styles.chipText, mealType === option && styles.chipSelectedText]}>{mealTypeLabel[option]}</Text></Pressable>)}
        </View>
      </Panel>
      <Panel>
        <Caption>HORA AUTOMÁTICA</Caption>
        <Text style={styles.timestamp}>{new Date().toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</Text>
        <Body>Guardaremos la hora actual del dispositivo al pulsar el botón.</Body>
        <TextInput accessibilityLabel="Nota de la comida" value={note} onChangeText={setNote} placeholder="Nota opcional" placeholderTextColor={colors.textDisabled} style={styles.input} />
      </Panel>
      <PrimaryButton label={saving ? 'Guardando…' : 'Guardar comida'} onPress={() => void save()} disabled={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.surfaceRaised, borderColor: colors.amber },
  chipText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  chipSelectedText: { color: colors.textPrimary },
  timestamp: { color: colors.textPrimary, fontSize: 22, fontWeight: '700' },
  input: { color: colors.textPrimary, backgroundColor: colors.surfaceRaised, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, minHeight: 52, fontSize: 16 },
});
