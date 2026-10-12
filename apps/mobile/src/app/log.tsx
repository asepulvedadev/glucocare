import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../components/Typography';
import { Panel } from '../components/Panel';
import { PrimaryButton } from '../components/PrimaryButton';
import { useGlucose } from '../context';
import { glucoseContextLabel, type GlucoseContext, type GlucoseUnit } from '../types/domain';
import { glucoseRiskLabel } from '../types/carePlan';
import { colors, radii, spacing } from '../theme/tokens';
const contexts: GlucoseContext[] = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'other'];

export default function LogScreen() {
  const { addReading } = useGlucose();
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<GlucoseUnit>('mg/dL');
  const [context, setContext] = useState<GlucoseContext>('other');
  const [symptoms, setSymptoms] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  async function save() {
    const numericValue = Number(value.replace(',', '.'));
    if (!Number.isFinite(numericValue) || numericValue <= 0 || numericValue > 1000) {
      Alert.alert('Revisa el valor', 'Escribe un número mayor que 0. Si crees que tu lectura es anormal, busca ayuda según tu plan de emergencia.'); return;
    }
    setSaving(true);
    try {
      const saved = await addReading({ value: numericValue, unit, context, recordedAt: new Date().toISOString(), symptoms: symptoms.trim() || undefined, note: note.trim() || undefined });
      if (saved.riskClassification === 'urgent_low' || saved.riskClassification === 'urgent_high') {
        Alert.alert('Revisa tu plan de ayuda', `${glucoseRiskLabel[saved.riskClassification]}. Sigue las instrucciones de tu equipo de salud o llama a emergencias si te sientes muy mal.`, [{ text: 'Entendido', onPress: () => router.back() }]);
        if (Platform.OS === 'web') router.back();
        return;
      }
      router.back();
    } catch { Alert.alert('No se pudo guardar', 'Conserva la lectura y vuelve a intentarlo.'); } finally { setSaving(false); }
  }
  return (
    <Screen>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar registro" onPress={() => router.back()} style={styles.close}><Text style={styles.closeText}>Cerrar</Text></Pressable>
      <Eyebrow>Registro rápido</Eyebrow>
      <Heading>¿Cuál es tu lectura?</Heading>
      <Body>La fecha y hora actual se guardarán automáticamente en este dispositivo.</Body>
      <Panel>
        <Caption>VALOR</Caption>
        <View style={styles.valueRow}>
          <TextInput accessibilityLabel="Valor de glucosa" value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="120" placeholderTextColor={colors.textDisabled} style={styles.input} autoFocus />
          <View style={styles.unitToggle}>{(['mg/dL', 'mmol/L'] as GlucoseUnit[]).map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected: unit === option }} onPress={() => setUnit(option)} style={[styles.unitOption, unit === option && styles.unitSelected]}><Text style={[styles.unitText, unit === option && styles.unitSelectedText]}>{option}</Text></Pressable>)}</View>
        </View>
      </Panel>
      <Panel>
        <Caption>CONTEXTO</Caption>
        <View style={styles.chips}>{contexts.map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected: context === option }} onPress={() => setContext(option)} style={[styles.chip, context === option && styles.chipSelected]}><Text style={[styles.chipText, context === option && styles.chipSelectedText]}>{glucoseContextLabel[option]}</Text></Pressable>)}</View>
      </Panel>
      <Panel>
        <Caption>OPCIONAL</Caption>
        <TextInput accessibilityLabel="Síntomas" value={symptoms} onChangeText={setSymptoms} placeholder="¿Notas algún síntoma?" placeholderTextColor={colors.textDisabled} style={styles.textInput} />
        <TextInput accessibilityLabel="Nota" value={note} onChangeText={setNote} placeholder="Añade una nota" placeholderTextColor={colors.textDisabled} style={[styles.textInput, styles.multiline]} multiline />
      </Panel>
      <PrimaryButton label={saving ? 'Guardando…' : 'Guardar lectura'} onPress={() => void save()} disabled={saving} />
      <Text style={styles.disclaimer}>Este registro no interpreta tus resultados ni sustituye las instrucciones de tu equipo de salud.</Text>
    </Screen>
  );
}
const styles = StyleSheet.create({ close: { minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center' }, closeText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' }, valueRow: { gap: spacing.md }, input: { color: colors.textPrimary, fontSize: 48, fontWeight: '700', minHeight: 68, padding: 0 }, unitToggle: { flexDirection: 'row', gap: spacing.xs }, unitOption: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border }, unitSelected: { backgroundColor: colors.amber, borderColor: colors.amber }, unitText: { color: colors.textSecondary, fontWeight: '600' }, unitSelectedText: { color: colors.canvas }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border }, chipSelected: { backgroundColor: colors.surfaceRaised, borderColor: colors.amber }, chipText: { color: colors.textSecondary, fontSize: 14 }, chipSelectedText: { color: colors.textPrimary }, textInput: { color: colors.textPrimary, backgroundColor: colors.surfaceRaised, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, minHeight: 52, fontSize: 16 }, multiline: { minHeight: 84, textAlignVertical: 'top', paddingTop: spacing.sm }, disclaimer: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingBottom: spacing.lg } });
