import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../components/Typography';
import { Panel } from '../components/Panel';
import { PrimaryButton } from '../components/PrimaryButton';
import { useGlucose } from '../context';
import { glucoseContextLabel, type GlucoseContext, type GlucoseReading, type GlucoseSource, type GlucoseUnit } from '../types/domain';
import { glucoseRiskLabel } from '../types/carePlan';
import { colors, radii, spacing } from '../theme/tokens';
import { hasUrgentSymptoms, URGENT_SYMPTOM_NOTICE } from '../domain/glucoseSafety';

const contexts: GlucoseContext[] = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'other'];
const sourceLabel: Record<GlucoseSource, string> = { manual: 'Digitada', import: 'Importada', cgm: 'CGM', glucometer: 'Glucómetro' };

function parseDateTime(raw: string) {
  const date = new Date(raw.trim().replace(' ', 'T'));
  return Number.isFinite(date.getTime()) ? date : null;
}

function localDateTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function LogScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { readings, isLoading } = useGlucose();
  const existing = typeof id === 'string' ? readings.find((item) => item.id === id) : undefined;
  if (id && !existing && isLoading) return <Screen><Body>Cargando lectura…</Body></Screen>;
  if (id && !existing) return <Screen><PrimaryButton label="Volver" tone="quiet" onPress={() => router.back()} /><Body>No encontramos esa lectura en este dispositivo.</Body></Screen>;
  return <LogForm existing={existing} />;
}

function LogForm({ existing }: { existing?: GlucoseReading }) {
  const { addReading, updateReading } = useGlucose();
  const [value, setValue] = useState(existing ? String(existing.value) : '');
  const [unit, setUnit] = useState<GlucoseUnit>(existing?.unit ?? 'mg/dL');
  const [context, setContext] = useState<GlucoseContext>(existing?.context ?? 'other');
  const [source, setSource] = useState<GlucoseSource>(existing?.source ?? 'manual');
  const [mealOffset, setMealOffset] = useState(existing?.mealOffsetMinutes === undefined ? '' : String(existing.mealOffsetMinutes));
  const [recordedAtText, setRecordedAtText] = useState(localDateTime(existing?.recordedAt));
  const [symptoms, setSymptoms] = useState(existing?.symptoms ?? '');
  const [urgentSymptoms, setUrgentSymptoms] = useState(existing?.symptoms?.includes(URGENT_SYMPTOM_NOTICE) ?? false);
  const [note, setNote] = useState(existing?.note ?? '');
  const [saving, setSaving] = useState(false);
  const sourceOptions: GlucoseSource[] = existing?.source && existing.source !== 'manual' && existing.source !== 'glucometer' ? [existing.source, 'manual', 'glucometer'] : ['manual', 'glucometer'];

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
    const now = new Date();
    const parsedTimestamp = existing ? parseDateTime(recordedAtText) : now;
    if (!parsedTimestamp) {
      Alert.alert('Revisa la fecha y hora', 'Usa el formato AAAA-MM-DD HH:MM.'); return;
    }
    setSaving(true);
    try {
      const symptomsValue = [urgentSymptoms ? URGENT_SYMPTOM_NOTICE : '', symptoms.replace(URGENT_SYMPTOM_NOTICE, '').trim()].filter(Boolean).join('. ');
      const recordedAt = parsedTimestamp.toISOString();
      const timestampChanged = Boolean(existing && recordedAt !== existing.recordedAt);
      const input = {
        value: numericValue,
        unit,
        context,
        source,
        mealOffsetMinutes: context === 'after_meal' ? parsedMealOffset : undefined,
        recordedAt,
        timezone: existing?.timezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
        utcOffsetMinutes: existing?.utcOffsetMinutes ?? -parsedTimestamp.getTimezoneOffset(),
        timeEdited: existing ? Boolean(existing.timeEdited || timestampChanged) : false,
        symptoms: symptomsValue || undefined,
        note: note.trim() || undefined,
      };
      const saved = existing ? await updateReading(existing.id, input) : await addReading(input);
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
      <Eyebrow>{existing ? 'Editar lectura' : 'Registro rápido'}</Eyebrow>
      <Heading>{existing ? 'Corrige el registro' : '¿Cuál es tu lectura?'}</Heading>
      <Body>{existing ? 'La corrección conserva una bitácora local de los valores anteriores y nuevos.' : 'La fecha y hora actual se guardarán automáticamente en este dispositivo.'}</Body>
      <Panel>
        <Caption>VALOR</Caption>
        <View style={styles.valueRow}>
          <TextInput accessibilityLabel="Valor de glucosa" value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="120" placeholderTextColor={colors.textDisabled} style={styles.input} autoFocus={!existing} />
          <View style={styles.unitToggle}>{(['mg/dL', 'mmol/L'] as GlucoseUnit[]).map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected: unit === option }} onPress={() => setUnit(option)} style={[styles.unitOption, unit === option && styles.unitSelected]}><Text style={[styles.unitText, unit === option && styles.unitSelectedText]}>{option}</Text></Pressable>)}</View>
        </View>
      </Panel>
      {existing ? <Panel><Caption>FECHA Y HORA REGISTRADA</Caption><TextInput accessibilityLabel="Fecha y hora registrada" value={recordedAtText} onChangeText={setRecordedAtText} placeholder="AAAA-MM-DD HH:MM" placeholderTextColor={colors.textDisabled} style={[styles.textInput, styles.dateInput]} /><Body>Al cambiarla se marcará como corregida y se conservará el valor anterior en la bitácora.</Body></Panel> : null}
      <Panel>
        <Caption>CONTEXTO</Caption>
        <View style={styles.chips}>{contexts.map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected: context === option }} onPress={() => setContext(option)} style={[styles.chip, context === option && styles.chipSelected]}><Text style={[styles.chipText, context === option && styles.chipSelectedText]}>{glucoseContextLabel[option]}</Text></Pressable>)}</View>
        {context === 'after_meal' ? <TextInput accessibilityLabel="Minutos desde la comida" value={mealOffset} onChangeText={setMealOffset} keyboardType="number-pad" placeholder="Minutos desde la comida (opcional)" placeholderTextColor={colors.textDisabled} style={styles.textInput} /> : null}
      </Panel>
      <Panel>
        <Caption>ORIGEN DE LA LECTURA</Caption>
        <View style={styles.chips}>{sourceOptions.map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected: source === option }} onPress={() => setSource(option)} style={[styles.chip, source === option && styles.chipSelected]}><Text style={[styles.chipText, source === option && styles.chipSelectedText]}>{sourceLabel[option]}</Text></Pressable>)}</View>
        {!existing ? <Body>Las importaciones de CGM y otros dispositivos se incorporarán en una versión posterior; aquí puedes identificar una lectura tomada con tu glucómetro.</Body> : null}
      </Panel>
      <Panel>
        <Caption>OPCIONAL</Caption>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: urgentSymptoms }} onPress={() => setUrgentSymptoms((current) => !current)} style={styles.symptomFlag}><Text style={[styles.flagBox, urgentSymptoms && styles.flagBoxSelected]}>{urgentSymptoms ? '✓' : ''}</Text><Text style={styles.flagText}>Me siento muy mal o tengo síntomas graves</Text></Pressable>
        <Body>Si marcas esta opción, te mostraremos ayuda urgente aunque el número no parezca anormal.</Body>
        <TextInput accessibilityLabel="Síntomas" value={symptoms} onChangeText={setSymptoms} placeholder="¿Notas algún síntoma?" placeholderTextColor={colors.textDisabled} style={styles.textInput} />
        <TextInput accessibilityLabel="Nota" value={note} onChangeText={setNote} placeholder="Añade una nota" placeholderTextColor={colors.textDisabled} style={[styles.textInput, styles.multiline]} multiline />
      </Panel>
      <PrimaryButton label={saving ? 'Guardando…' : existing ? 'Guardar corrección' : 'Guardar lectura'} onPress={() => void save()} disabled={saving} />
      <Text style={styles.disclaimer}>Este registro no interpreta tus resultados ni sustituye las instrucciones de tu equipo de salud.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  close: { minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center' },
  closeText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  valueRow: { gap: spacing.md },
  input: { color: colors.textPrimary, fontSize: 48, fontWeight: '700', minHeight: 68, padding: 0 },
  unitToggle: { flexDirection: 'row', gap: spacing.xs },
  unitOption: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border },
  unitSelected: { backgroundColor: colors.amber, borderColor: colors.amber },
  unitText: { color: colors.textSecondary, fontWeight: '600' },
  unitSelectedText: { color: colors.canvas },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.surfaceRaised, borderColor: colors.amber },
  chipText: { color: colors.textSecondary, fontSize: 14 },
  chipSelectedText: { color: colors.textPrimary },
  symptomFlag: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flagBox: { width: 28, height: 28, lineHeight: 26, textAlign: 'center', color: colors.textSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, fontSize: 20 },
  flagBoxSelected: { color: colors.canvas, backgroundColor: colors.amber, borderColor: colors.amber },
  flagText: { flex: 1, color: colors.textPrimary, fontSize: 16, lineHeight: 22 },
  textInput: { color: colors.textPrimary, backgroundColor: colors.surfaceRaised, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, minHeight: 52, fontSize: 16 },
  dateInput: { fontSize: 20, fontWeight: '700' },
  multiline: { minHeight: 84, textAlignVertical: 'top', paddingTop: spacing.sm },
  disclaimer: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingBottom: spacing.lg },
});
