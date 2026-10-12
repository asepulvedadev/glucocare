import { useLocalSearchParams } from 'expo-router';
import { safeBack } from '../navigation';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../components/Typography';
import { Panel } from '../components/Panel';
import { PrimaryButton } from '../components/PrimaryButton';
import { useCare } from '../careContext';
import { openNotificationSettings } from '../notifications';
import { medicationRouteLabel, type Medication, type MedicationRoute } from '../types/care';
import { colors, radii, spacing } from '../theme/tokens';
import { isValidMedicationDate } from '../domain/medication';
import { validateMedicationSchedule } from '../domain/medicationSchedule';
import { mealTypeLabel, type MealType } from '../types/meals';

const routes: MedicationRoute[] = ['oral', 'injection', 'inhaled', 'topical', 'other'];
const weekdayOptions = [{ value: 1, label: 'L', name: 'lunes' }, { value: 2, label: 'M', name: 'martes' }, { value: 3, label: 'X', name: 'miércoles' }, { value: 4, label: 'J', name: 'jueves' }, { value: 5, label: 'V', name: 'viernes' }, { value: 6, label: 'S', name: 'sábado' }, { value: 7, label: 'D', name: 'domingo' }];
const everyDay = weekdayOptions.map((day) => day.value);
const mealOptions: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function parseTime(raw: string) {
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export default function MedicationScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { medications, isLoading } = useCare();
  const existing = typeof id === 'string' ? medications.find((item) => item.id === id) : undefined;
  if (id && !existing && isLoading) return <Screen><Body>Cargando medicamento…</Body></Screen>;
  if (id && !existing) return <Screen><PrimaryButton label="Volver" tone="quiet" onPress={() => safeBack()} /><Body>No encontramos ese medicamento en este dispositivo.</Body></Screen>;
  return <MedicationForm existing={existing} />;
}

function MedicationForm({ existing }: { existing?: Medication }) {
  const { addMedication, updateMedication } = useCare();
  const [name, setName] = useState(existing?.name ?? '');
  const [presentation, setPresentation] = useState(existing?.presentation ?? '');
  const [doseText, setDoseText] = useState(existing?.doseText ?? '');
  const [prescriberName, setPrescriberName] = useState(existing?.prescriberName ?? '');
  const [instructions, setInstructions] = useState(existing?.instructions ?? '');
  const [inventoryQuantity, setInventoryQuantity] = useState(existing?.inventoryQuantity === undefined ? '' : String(existing.inventoryQuantity));
  const [inventoryUnit, setInventoryUnit] = useState(existing?.inventoryUnit ?? '');
  const [refillThreshold, setRefillThreshold] = useState(existing?.refillThreshold === undefined ? '' : String(existing.refillThreshold));
  const [startDate, setStartDate] = useState(existing?.startDate ?? '');
  const [endDate, setEndDate] = useState(existing?.endDate ?? '');
  const [route, setRoute] = useState<MedicationRoute>(existing?.route ?? 'oral');
  const initialSchedule = existing?.schedule;
  const [scheduleKind, setScheduleKind] = useState<'fixed' | 'interval' | 'meal_relative'>(initialSchedule?.kind ?? 'fixed');
  const [times, setTimes] = useState(initialSchedule?.kind === 'fixed' ? [...(initialSchedule.times ?? []), '', ''].slice(0, 3) : existing ? [...(existing.times ?? [`${String(existing.hour).padStart(2, '0')}:${String(existing.minute).padStart(2, '0')}`]), '', ''].slice(0, 3) : ['08:00', '', '']);
  const [anchorTime, setAnchorTime] = useState(initialSchedule?.anchorTime ?? existing?.times?.[0] ?? '08:00');
  const [intervalHours, setIntervalHours] = useState(initialSchedule?.intervalHours ? String(initialSchedule.intervalHours) : '8');
  const [meal, setMeal] = useState<MealType>(initialSchedule?.meal ?? 'breakfast');
  const [mealOffset, setMealOffset] = useState(initialSchedule?.offsetMinutes !== undefined ? String(initialSchedule.offsetMinutes) : '120');
  const [weekdays, setWeekdays] = useState<number[]>(initialSchedule?.weekdays?.length ? initialSchedule.weekdays : everyDay);
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  function toggleWeekday(day: number) {
    setWeekdays((current) => {
      if (current.includes(day) && current.length === 1) return current;
      return current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((a, b) => a - b);
    });
  }


  async function save() {
    const valuesToParse = scheduleKind === 'fixed' ? times : [scheduleKind === 'interval' ? anchorTime : '00:00'];
    const parsedTimes = valuesToParse.filter((value) => value.trim()).map(parseTime);
    if ((startDate.trim() && !isValidMedicationDate(startDate.trim())) || (endDate.trim() && !isValidMedicationDate(endDate.trim())) || (startDate.trim() && endDate.trim() && startDate.trim() > endDate.trim())) {
      Alert.alert('Revisa la vigencia', 'Usa AAAA-MM-DD y asegúrate de que la fecha inicial no sea posterior a la final.');
      return;
    }
    const validTimes = parsedTimes.filter((value): value is { hour: number; minute: number } => Boolean(value));
    const timeValues = validTimes.map((value) => `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`);
    const normalizedInventoryQuantity = inventoryQuantity.trim();
    const normalizedInventoryUnit = inventoryUnit.trim();
    const normalizedRefillThreshold = refillThreshold.trim();
    const quantity = normalizedInventoryQuantity ? Number(normalizedInventoryQuantity.replace(',', '.')) : undefined;
    const threshold = normalizedRefillThreshold ? Number(normalizedRefillThreshold.replace(',', '.')) : undefined;
    const inventoryIsValid = (quantity === undefined || (Number.isFinite(quantity) && quantity >= 0 && quantity <= 1_000_000_000))
      && (threshold === undefined || (Number.isFinite(threshold) && threshold >= 0 && threshold <= 1_000_000_000))
      && (!normalizedInventoryQuantity || Boolean(normalizedInventoryUnit))
      && (!normalizedInventoryUnit || normalizedInventoryUnit.length <= 64);
    if (!inventoryIsValid) {
      Alert.alert('Revisa el inventario', 'La cantidad y el umbral deben ser números no negativos; la unidad es obligatoria si registras existencias.');
      return;
    }
    const schedule = scheduleKind === 'fixed'
      ? { kind: 'fixed' as const, times: [...new Set(timeValues)].sort(), weekdays }
      : scheduleKind === 'interval'
        ? { kind: 'interval' as const, anchorTime: timeValues[0], intervalHours: Number(intervalHours), weekdays }
        : { kind: 'meal_relative' as const, anchorTime: '00:00', meal, offsetMinutes: Number(mealOffset), weekdays };
    if (!name.trim() || !doseText.trim() || parsedTimes.some((value) => !value) || parsedTimes.length < 1 || !validateMedicationSchedule(schedule)) {
      Alert.alert('Completa los datos', 'Revisa nombre, dosis, horario y días. Usa horas HH:MM; los intervalos deben estar entre 1 y 24 horas y las ventanas de comida entre -240 y 1440 minutos.');
      return;
    }
    setSaving(true);
    try {
      const compatibilityTime = validTimes[0] ?? { hour: 0, minute: 0 };
      const input = { name: name.trim(), presentation: presentation.trim() || undefined, doseText: doseText.trim(), prescriberName: prescriberName.trim() || undefined, instructions: instructions.trim() || undefined, inventoryQuantity: quantity, inventoryUnit: normalizedInventoryUnit || undefined, refillThreshold: threshold, startDate: startDate.trim() || undefined, endDate: endDate.trim() || undefined, route, hour: compatibilityTime.hour, minute: compatibilityTime.minute, times: schedule.kind === 'fixed' ? schedule.times : [schedule.anchorTime], schedule, enabled };
      const state = existing ? await updateMedication(existing.id, input) : await addMedication(input);
      if (state === 'permission_denied') {
        Alert.alert('Medicamento guardado', 'El registro quedó guardado, pero las notificaciones están deshabilitadas.', [
          { text: 'Ahora no', style: 'cancel' },
          { text: 'Abrir ajustes', onPress: () => void openNotificationSettings() },
        ]);
      } else if (state === 'unavailable') {
        Alert.alert('Medicamento guardado', 'El registro quedó guardado. Los recordatorios nativos estarán disponibles en Android o iOS.');
      } else if (state === 'scheduled_limited') {
        Alert.alert('Medicamento guardado', 'El registro quedó guardado. El sistema programó parte de los próximos recordatorios; al abrir la app volverá a completar la ventana disponible.');
      }
      safeBack();
    } catch {
      Alert.alert('No se pudo guardar', 'Conserva las instrucciones y vuelve a intentarlo.');
    } finally { setSaving(false); }
  }

  return (
    <Screen>
      <PrimaryButton label="Volver" tone="quiet" onPress={() => safeBack()} />
      <Eyebrow>{existing ? 'Editar medicamento' : 'Nuevo medicamento'}</Eyebrow>
      <Heading>{existing ? 'Actualiza la indicación guardada' : 'Configura un recordatorio'}</Heading>
      <Body>Escribe exactamente lo indicado por tu equipo de salud. La app no calcula ni cambia dosis.</Body>
      <Panel>
        <Caption>NOMBRE</Caption>
        <TextInput accessibilityLabel="Nombre del medicamento" value={name} onChangeText={setName} placeholder="Ej. Metformina" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <Caption>PRESENTACIÓN (OPCIONAL)</Caption>
        <TextInput accessibilityLabel="Presentación del medicamento" value={presentation} onChangeText={setPresentation} placeholder="Ej. tableta, frasco o vial" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <Caption>DOSIS INDICADA</Caption>
        <TextInput accessibilityLabel="Dosis indicada" value={doseText} onChangeText={setDoseText} placeholder="Ej. 500 mg" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <Caption>QUIÉN LO INDICÓ (OPCIONAL)</Caption>
        <TextInput accessibilityLabel="Profesional que indicó el medicamento" value={prescriberName} onChangeText={setPrescriberName} placeholder="Ej. Dra. Pérez" placeholderTextColor={colors.textDisabled} style={styles.input} />
      </Panel>
      <Panel>
        <Caption>INVENTARIO OPCIONAL</Caption>
        <TextInput accessibilityLabel="Cantidad disponible del medicamento" value={inventoryQuantity} onChangeText={setInventoryQuantity} keyboardType="decimal-pad" placeholder="Cantidad disponible" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Unidad del inventario" value={inventoryUnit} onChangeText={setInventoryUnit} placeholder="Ej. tabletas, frascos o unidades" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Umbral para recordar reposición" value={refillThreshold} onChangeText={setRefillThreshold} keyboardType="decimal-pad" placeholder="Avisar al llegar a (opcional)" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <Body>Es una referencia escrita por ti. GlucoCare no descuenta existencias ni recomienda cambiar el tratamiento.</Body>
      </Panel>
      {existing ? <Panel>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: enabled }} onPress={() => setEnabled((value) => !value)} style={styles.enableRow}>
          <View style={[styles.checkbox, enabled && styles.checkboxSelected]}><Text style={styles.checkmark}>{enabled ? '✓' : ''}</Text></View>
          <Body>{enabled ? 'Medicamento activo y con recordatorios' : 'Medicamento pausado; no generar recordatorios'}</Body>
        </Pressable>
      </Panel> : null}
      <Panel>
        <Caption>MEDIO DE SUMINISTRO</Caption>
        <View style={styles.chips}>{routes.map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected: route === option }} onPress={() => setRoute(option)} style={[styles.chip, route === option && styles.chipSelected]}><Text style={[styles.chipText, route === option && styles.chipSelectedText]}>{medicationRouteLabel[option]}</Text></Pressable>)}</View>
      </Panel>
      <Panel>
        <Caption>TIPO DE HORARIO</Caption>
        <View style={styles.chips}>{(['fixed', 'interval', 'meal_relative'] as const).map((kind) => <Pressable key={kind} accessibilityRole="radio" accessibilityState={{ selected: scheduleKind === kind }} onPress={() => setScheduleKind(kind)} style={[styles.chip, scheduleKind === kind && styles.chipSelected]}><Text style={[styles.chipText, scheduleKind === kind && styles.chipSelectedText]}>{kind === 'fixed' ? 'Horas fijas' : kind === 'interval' ? 'Cada intervalo' : 'Relativo a comida'}</Text></Pressable>)}</View>
        {scheduleKind === 'fixed' ? <>
          <Caption>HORAS DEL RECORDATORIO</Caption>
          {times.map((value, index) => <TextInput key={index} accessibilityLabel={`Hora del recordatorio ${index + 1}`} value={value} onChangeText={(next) => setTimes((current) => current.map((item, itemIndex) => itemIndex === index ? next : item))} keyboardType="numbers-and-punctuation" placeholder={index === 0 ? '08:00' : 'Opcional · HH:MM'} placeholderTextColor={colors.textDisabled} style={[styles.input, styles.timeInput]} />)}
          <Body>Se programarán las horas indicadas en los días seleccionados.</Body>
        </> : scheduleKind === 'interval' ? <>
          <Caption>HORA DE INICIO</Caption>
          <TextInput accessibilityLabel="Hora de inicio del intervalo" value={anchorTime} onChangeText={setAnchorTime} keyboardType="numbers-and-punctuation" placeholder="08:00" placeholderTextColor={colors.textDisabled} style={[styles.input, styles.timeInput]} />
          <Caption>INTERVALO EN HORAS (1–24)</Caption>
          <TextInput accessibilityLabel="Intervalo en horas" value={intervalHours} onChangeText={setIntervalHours} keyboardType="number-pad" placeholder="8" placeholderTextColor={colors.textDisabled} style={styles.input} />
          <Body>El intervalo se cuenta desde la hora de inicio. No modifica la dosis ni sustituye una indicación médica.</Body>
        </> : <>
          <Caption>COMIDA DE REFERENCIA</Caption>
          <View style={styles.chips}>{mealOptions.map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected: meal === option }} onPress={() => setMeal(option)} style={[styles.chip, meal === option && styles.chipSelected]}><Text style={[styles.chipText, meal === option && styles.chipSelectedText]}>{mealTypeLabel[option]}</Text></Pressable>)}</View>
          <Caption>MINUTOS RESPECTO A LA COMIDA</Caption>
          <TextInput accessibilityLabel={`Minutos respecto a ${mealTypeLabel[meal]}`} value={mealOffset} onChangeText={setMealOffset} keyboardType="numbers-and-punctuation" placeholder="120" placeholderTextColor={colors.textDisabled} style={styles.input} />
          <Body>Ejemplo: 120 genera la toma dos horas después de registrar explícitamente la comida. Valores negativos son antes de comer.</Body>
        </>}
        <Caption>DÍAS ACTIVOS</Caption>
        <View style={styles.dayChips}>{weekdayOptions.map((day) => <Pressable key={day.value} accessibilityRole="checkbox" accessibilityLabel={`Medicamento activo el ${day.name}`} accessibilityState={{ checked: weekdays.includes(day.value) }} onPress={() => toggleWeekday(day.value)} style={[styles.dayChip, weekdays.includes(day.value) && styles.chipSelected]}><Text style={[styles.chipText, weekdays.includes(day.value) && styles.chipSelectedText]}>{day.label}</Text></Pressable>)}</View>
        <Body>Los días no seleccionados no generan recordatorios ni tomas pendientes.</Body>
      </Panel>
      <Panel>
        <Caption>VIGENCIA E INSTRUCCIONES (OPCIONAL)</Caption>
        <TextInput accessibilityLabel="Fecha de inicio del medicamento" value={startDate} onChangeText={setStartDate} placeholder="Inicio · AAAA-MM-DD" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Fecha de finalización del medicamento" value={endDate} onChangeText={setEndDate} placeholder="Fin · AAAA-MM-DD" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Instrucciones del medicamento" value={instructions} onChangeText={setInstructions} placeholder="Ej. tomar con alimentos" placeholderTextColor={colors.textDisabled} style={[styles.input, styles.multiline]} multiline />
        <Body>La vigencia documenta la indicación recibida; no cambia las dosis. Fuera de esas fechas no se generan tomas ni recordatorios.</Body>
      </Panel>
      <PrimaryButton label={saving ? 'Guardando…' : existing ? 'Actualizar medicamento' : 'Guardar medicamento'} onPress={() => void save()} disabled={saving} />
      <Text style={styles.disclaimer}>Los recordatorios son una ayuda y no garantizan la entrega. Si pierdes una toma, sigue tu plan de atención.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { color: colors.textPrimary, backgroundColor: colors.surfaceRaised, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, minHeight: 52, fontSize: 16 },
  timeInput: { fontSize: 28, fontWeight: '700' },
  multiline: { minHeight: 84, textAlignVertical: 'top', paddingTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  dayChips: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs, marginVertical: spacing.xs },
  dayChip: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.surfaceRaised, borderColor: colors.amber },
  chipText: { color: colors.textSecondary, fontSize: 14 },
  chipSelectedText: { color: colors.textPrimary },
  disclaimer: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingBottom: spacing.lg },
  enableRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: { width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: colors.textSecondary, alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { borderColor: colors.amber, backgroundColor: colors.amber },
  checkmark: { color: colors.canvas, fontSize: 20, fontWeight: '800' },
});
