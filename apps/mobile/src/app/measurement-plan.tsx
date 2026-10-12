import { safeBack } from '../navigation';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../components/Typography';
import { Panel } from '../components/Panel';
import { PrimaryButton } from '../components/PrimaryButton';
import { useCare } from '../careContext';
import { colors, radii, spacing } from '../theme/tokens';
import { isValidMeasurementTime, legacyMeasurementWindows, validateMeasurementPlan, validateMeasurementWindows } from '../domain/measurementPlan';
import { measurementTimingLabel, type MeasurementTiming, type MeasurementWindow } from '../types/measurement';
import { mealTypeLabel, type MealType } from '../types/meals';

const defaultTimes = ['08:00', '14:00', '20:00'];
const timingOptions: MeasurementTiming[] = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'other'];
const weekdayOptions = [{ value: 1, label: 'L', name: 'lunes' }, { value: 2, label: 'M', name: 'martes' }, { value: 3, label: 'X', name: 'miércoles' }, { value: 4, label: 'J', name: 'jueves' }, { value: 5, label: 'V', name: 'viernes' }, { value: 6, label: 'S', name: 'sábado' }, { value: 7, label: 'D', name: 'domingo' }];
const everyDay = weekdayOptions.map((day) => day.value);
const mealOptions: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const defaultWindow = (index: number): MeasurementWindow => ({ kind: 'fixed', time: defaultTimes[index] ?? '08:00', timing: 'other' });

export default function MeasurementPlanScreen() {
  const { measurementPlan, saveMeasurementPlan } = useCare();
  const initialCount = measurementPlan?.readingsPerDay ?? 1;
  const [count, setCount] = useState<1 | 2 | 3>(initialCount);
  const initialWindows = measurementPlan ? legacyMeasurementWindows(measurementPlan) : [defaultWindow(0)];
  const [modes, setModes] = useState<('fixed' | 'meal_relative')[]>(initialWindows.map((window) => window.kind));
  const [times, setTimes] = useState<string[]>(initialWindows.map((window) => window.kind === 'fixed' ? window.time : defaultTimes[0]));
  const [timings, setTimings] = useState<MeasurementTiming[]>(initialWindows.map((window) => window.timing));
  const [meals, setMeals] = useState<MealType[]>(initialWindows.map((window) => window.kind === 'meal_relative' ? window.meal : 'breakfast'));
  const [offsets, setOffsets] = useState<string[]>(initialWindows.map((window) => window.kind === 'meal_relative' ? String(window.offsetMinutes) : '120'));
  const [weekdays, setWeekdays] = useState<number[]>(measurementPlan?.weekdays?.length ? measurementPlan.weekdays : everyDay);
  const [effectiveFrom, setEffectiveFrom] = useState(measurementPlan?.effectiveFrom ?? '');
  const [effectiveTo, setEffectiveTo] = useState(measurementPlan?.effectiveTo ?? '');
  const [instructions, setInstructions] = useState(measurementPlan?.instructions ?? '');
  const [saving, setSaving] = useState(false);

  const selectedTimes = useMemo(() => times.slice(0, count), [times, count]);

  function changeCount(next: 1 | 2 | 3) {
    setCount(next);
    setTimes((current) => Array.from({ length: next }, (_, index) => current[index] ?? defaultTimes[index]));
    setTimings((current) => Array.from({ length: next }, (_, index) => current[index] ?? 'other'));
    setModes((current) => Array.from({ length: next }, (_, index) => current[index] ?? 'fixed'));
    setMeals((current) => Array.from({ length: next }, (_, index) => current[index] ?? 'breakfast'));
    setOffsets((current) => Array.from({ length: next }, (_, index) => current[index] ?? '120'));
  }

  function toggleWeekday(day: number) {
    setWeekdays((current) => {
      if (current.includes(day) && current.length === 1) return current;
      return current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((a, b) => a - b);
    });
  }

  async function save() {
    const selectedTimings = timings.slice(0, count);
    const selectedModes = modes.slice(0, count);
    const windows: MeasurementWindow[] = selectedModes.map((mode, index) => mode === 'fixed'
      ? { kind: 'fixed', time: selectedTimes[index], timing: selectedTimings[index] }
      : { kind: 'meal_relative', meal: meals[index] ?? 'breakfast', offsetMinutes: Number(offsets[index]), timing: selectedTimings[index] });
    const fixedTimes = windows.map((window) => window.kind === 'fixed' ? window.time : '00:00');
    const normalizedFrom = effectiveFrom.trim();
    const normalizedTo = effectiveTo.trim();
    if (windows.some((window) => window.kind === 'fixed' && !isValidMeasurementTime(window.time)) || !validateMeasurementWindows(count, windows) || !validateMeasurementPlan(count, fixedTimes, selectedTimings, { weekdays, effectiveFrom: normalizedFrom || undefined, effectiveTo: normalizedTo || undefined })) {
      Alert.alert('Revisa el plan', 'Usa horas HH:MM, tiempos relativos entre -240 y 1440 minutos, selecciona al menos un día y fechas AAAA-MM-DD válidas.');
      return;
    }
    setSaving(true);
    try {
      await saveMeasurementPlan({ readingsPerDay: count, times: fixedTimes, timings: selectedTimings, windows, weekdays, effectiveFrom: normalizedFrom || undefined, effectiveTo: normalizedTo || undefined, instructions: instructions.trim() || undefined });
      safeBack();
    } catch {
      Alert.alert('No se pudo guardar', 'Conserva las instrucciones y vuelve a intentarlo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <PrimaryButton label="Volver" tone="quiet" onPress={() => safeBack()} />
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
        {selectedTimes.map((time, index) => <View key={index} style={styles.slot}>
          <Caption>TIPO DE VENTANA</Caption>
          <View style={styles.chips}>{(['fixed', 'meal_relative'] as const).map((mode) => <Pressable key={mode} accessibilityRole="radio" accessibilityState={{ selected: (modes[index] ?? 'fixed') === mode }} onPress={() => setModes((current) => current.map((item, itemIndex) => itemIndex === index ? mode : item))} style={[styles.chip, (modes[index] ?? 'fixed') === mode && styles.chipSelected]}><Text style={[styles.chipText, (modes[index] ?? 'fixed') === mode && styles.chipSelectedText]}>{mode === 'fixed' ? 'Hora fija' : 'Después de comida'}</Text></Pressable>)}</View>
          {(modes[index] ?? 'fixed') === 'fixed' ? <TextInput accessibilityLabel={`Hora de lectura ${index + 1}`} value={time} onChangeText={(value) => setTimes((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))} keyboardType="numbers-and-punctuation" placeholder="08:00" placeholderTextColor={colors.textDisabled} style={[styles.input, styles.timeInput]} /> : <>
            <Caption>COMIDA DE REFERENCIA</Caption>
            <View style={styles.chips}>{mealOptions.map((meal) => <Pressable key={meal} accessibilityRole="radio" accessibilityState={{ selected: (meals[index] ?? 'breakfast') === meal }} onPress={() => setMeals((current) => current.map((item, itemIndex) => itemIndex === index ? meal : item))} style={[styles.chip, (meals[index] ?? 'breakfast') === meal && styles.chipSelected]}><Text style={[styles.chipText, (meals[index] ?? 'breakfast') === meal && styles.chipSelectedText]}>{mealTypeLabel[meal]}</Text></Pressable>)}</View>
            <TextInput accessibilityLabel={`Minutos respecto a ${mealTypeLabel[meals[index] ?? 'breakfast']}`} value={offsets[index] ?? '120'} onChangeText={(value) => setOffsets((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))} keyboardType="numbers-and-punctuation" placeholder="120" placeholderTextColor={colors.textDisabled} style={styles.input} />
            <Body>Ejemplo: 120 después requiere registrar la comida para crear la medición.</Body>
          </>}
          <Caption>CONTEXTO DE LA LECTURA</Caption>
          <View style={styles.chips}>{timingOptions.map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected: (timings[index] ?? 'other') === option }} onPress={() => setTimings((current) => current.map((item, itemIndex) => itemIndex === index ? option : item))} style={[styles.chip, (timings[index] ?? 'other') === option && styles.chipSelected]}><Text style={[styles.chipText, (timings[index] ?? 'other') === option && styles.chipSelectedText]}>{measurementTimingLabel[option]}</Text></Pressable>)}</View>
        </View>)}
        <Body>Las ventanas relativas solo se activan después de registrar explícitamente la comida. GlucoCare no infiere horarios ni interpreta resultados.</Body>
      </Panel>
      <Panel>
        <Caption>INSTRUCCIONES OPCIONALES</Caption>
        <TextInput accessibilityLabel="Instrucciones del plan de medición" value={instructions} onChangeText={setInstructions} multiline placeholder="Ej. antes del desayuno y dos horas después de la cena" placeholderTextColor={colors.textDisabled} style={[styles.input, styles.notes]} />
      </Panel>
      <Panel>
        <Caption>DÍAS DEL PLAN</Caption>
        <View style={styles.dayChips}>{weekdayOptions.map((day) => <Pressable key={day.value} accessibilityRole="checkbox" accessibilityLabel={`Plan activo el ${day.name}`} accessibilityState={{ checked: weekdays.includes(day.value) }} onPress={() => toggleWeekday(day.value)} style={[styles.dayChip, weekdays.includes(day.value) && styles.chipSelected]}><Text style={[styles.chipText, weekdays.includes(day.value) && styles.chipSelectedText]}>{day.label}</Text></Pressable>)}</View>
        <Body>Deja todos los días activos para una rutina diaria. Puedes limitar el plan a días específicos.</Body>
        <Caption>VIGENCIA OPCIONAL</Caption>
        <TextInput accessibilityLabel="Inicio de vigencia del plan" value={effectiveFrom} onChangeText={setEffectiveFrom} placeholder="Inicio · AAAA-MM-DD" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Fin de vigencia del plan" value={effectiveTo} onChangeText={setEffectiveTo} placeholder="Fin · AAAA-MM-DD" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <Body>Fuera de estos días o fechas no se generarán mediciones pendientes. Esto organiza el plan; no modifica indicaciones clínicas.</Body>
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
  slot: { gap: spacing.xs, marginBottom: spacing.sm },
  dayChips: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs, marginBottom: spacing.xs },
  dayChip: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
});
