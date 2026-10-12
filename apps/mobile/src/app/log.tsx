import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../components/Typography';
import { Panel } from '../components/Panel';
import { PrimaryButton } from '../components/PrimaryButton';
import { useGlucose } from '../context';
import { glucoseContextLabel, type GlucoseContext, type GlucoseSource, type GlucoseUnit } from '../types/domain';
import { glucoseRiskLabel } from '../types/carePlan';
import { colors, radii, spacing } from '../theme/tokens';
import { hasUrgentSymptoms, URGENT_SYMPTOM_NOTICE } from '../domain/glucoseSafety';
const contexts: GlucoseContext[] = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'other'];
const sources: GlucoseSource[] = ['manual', 'glucometer'];
const sourceLabel: Record<GlucoseSource, string> = { manual: 'Digitada', import: 'Importada', cgm: 'CGM', glucometer: 'Glucometro' };

export default function LogScreen() {
  const { addReading } = useGlucose();
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<GlucoseUnit>('mg/dL');
  const [context, setContext] = useState<GlucoseContext>('other');
  const [source, setSource] = useState<GlucoseSource>('manual');
  const [mealOffset, setMealOffset] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [urgentSymptoms, setUrgentSymptoms] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  async function save() {
    const numericValue = Number(value.replace(',', '.'));
    if (!Number.isFinite(numericValue) || numericValue <= 0 || numericValue > 1000) {
      Alert.alert('Revisa el valor', 'Escribe un número mayor que 0. Si crees que tu lectura es anormal, busca ayuda según tu plan de emergencia.'); return;
    }
    const normalizedMealOffset = mealOffset.trim();
    const parsedMealOffset = normalizedMealOffset ? Number(normalizedMealOffset) : undefined;
    if (context === 'after_meal' && (parsedMealOffset !== undefined && (!Number.isInteger(parsedMealOffset) || parsedMealOffset < 0 || parsedMealOffset > 1440))) {
      Alert.alert('Revisa el tiempo desde la comida', 'Usa un número entero entre 0 y 1440 minutos.'); return;
    }
    setSaving(true);
    try {
      const symptomsValue = [urgentSymptoms ? URGENT_SYMPTOM_NOTICE : '', symptoms.trim()].filter(Boolean).join('. ');
      const saved = await addReading({ value: numericValue, unit, context, source, mealOffsetMinutes: context === 'after_meal' ? parsedMealOffset : undefined, recordedAt: new Date().toISOString(), symptoms: symptomsValue || undefined, note: note.trim() || undefined });
      if (hasUrgentSymptoms(saved.symptoms)) {
        Alert.alert('Busca ayuda ahora', 'Los síntomas graves requieren ayuda humana aunque la lectura parezca normal. Llama a emergencias o usa la pantalla de ayuda.', [{ text: 'Abrir ayuda', onPress: () => router.replace('/help') }, { text: 'Cerrar', style: 'cancel', onPress: () => router.back() }]);
        if (Platform.OS === 'web') router.replace('/help');
        return;
      }
      if (saved.riskClassification === 'urgent_low' || saved.riskClassification === 'urgent_high') {
        Alert.alert('Revisa tu plan de ayuda', `${glucoseRiskLabel[saved.riskClassification]}. Sigue las instrucciones de tu equipo de salud o llama a emergencias si te sientes muy mal.`, [{ text: 'Entendido', onPress: () => router.back() }]);
        if (Platform.OS === 'web') router.back();
        return;
      }
      if (saved.riskClassification === 'low' || saved.riskClassification === 'high') {
        Alert.alert('Lectura fuera de tu rango', `${glucoseRiskLabel[saved.riskClassification]}. Revisa las instrucciones de tu equipo de salud y observa cómo te sientes.`, [{ text: 'Entendido', onPress: () => router.back() }]);
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
        {context === 'after_meal' ? <TextInput accessibilityLabel="Minutos desde la comida" value={mealOffset} onChangeText={setMealOffset} keyboardType="number-pad" placeholder="Minutos desde la comida (opcional)" placeholderTextColor={colors.textDisabled} style={styles.textInput} /> : null}
      </Panel>
      <Panel>
        <Caption>ORIGEN DE LA LECTURA</Caption>
        <View style={styles.chips}>{sources.map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected: source === option }} onPress={() => setSource(option)} style={[styles.chip, source === option && styles.chipSelected]}><Text style={[styles.chipText, source === option && styles.chipSelectedText]}>{sourceLabel[option]}</Text></Pressable>)}</View>
        <Body>Las importaciones de CGM y otros dispositivos se incorporarán en una versión posterior; aquí puedes identificar una lectura tomada con tu glucómetro.</Body>
      </Panel>
      <Panel>
        <Caption>OPCIONAL</Caption>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: urgentSymptoms }} onPress={() => setUrgentSymptoms((current) => !current)} style={styles.symptomFlag}>
          <Text style={[styles.flagBox, urgentSymptoms && styles.flagBoxSelected]}>{urgentSymptoms ? '✓' : ''}</Text>
          <Text style={styles.flagText}>Me siento muy mal o tengo síntomas graves</Text>
        </Pressable>
        <Body>Si marcas esta opción, te mostraremos ayuda urgente aunque el número no parezca anormal.</Body>
        <TextInput accessibilityLabel="Síntomas" value={symptoms} onChangeText={setSymptoms} placeholder="¿Notas algún síntoma?" placeholderTextColor={colors.textDisabled} style={styles.textInput} />
        <TextInput accessibilityLabel="Nota" value={note} onChangeText={setNote} placeholder="Añade una nota" placeholderTextColor={colors.textDisabled} style={[styles.textInput, styles.multiline]} multiline />
      </Panel>
      <PrimaryButton label={saving ? 'Guardando…' : 'Guardar lectura'} onPress={() => void save()} disabled={saving} />
      <Text style={styles.disclaimer}>Este registro no interpreta tus resultados ni sustituye las instrucciones de tu equipo de salud.</Text>
    </Screen>
  );
}
const styles = StyleSheet.create({ close: { minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center' }, closeText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' }, valueRow: { gap: spacing.md }, input: { color: colors.textPrimary, fontSize: 48, fontWeight: '700', minHeight: 68, padding: 0 }, unitToggle: { flexDirection: 'row', gap: spacing.xs }, unitOption: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border }, unitSelected: { backgroundColor: colors.amber, borderColor: colors.amber }, unitText: { color: colors.textSecondary, fontWeight: '600' }, unitSelectedText: { color: colors.canvas }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border }, chipSelected: { backgroundColor: colors.surfaceRaised, borderColor: colors.amber }, chipText: { color: colors.textSecondary, fontSize: 14 }, chipSelectedText: { color: colors.textPrimary }, symptomFlag: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, flagBox: { width: 28, height: 28, lineHeight: 26, textAlign: 'center', color: colors.textSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, fontSize: 20 }, flagBoxSelected: { color: colors.canvas, backgroundColor: colors.amber, borderColor: colors.amber }, flagText: { flex: 1, color: colors.textPrimary, fontSize: 16, lineHeight: 22 }, textInput: { color: colors.textPrimary, backgroundColor: colors.surfaceRaised, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, minHeight: 52, fontSize: 16 }, multiline: { minHeight: 84, textAlignVertical: 'top', paddingTop: spacing.sm }, disclaimer: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingBottom: spacing.lg } });
