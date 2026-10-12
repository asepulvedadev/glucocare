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
  const [startDate, setStartDate] = useState(existing?.startDate ?? '');
  const [endDate, setEndDate] = useState(existing?.endDate ?? '');
  const [route, setRoute] = useState<MedicationRoute>(existing?.route ?? 'oral');
  const [times, setTimes] = useState(existing ? [...(existing.times ?? [`${String(existing.hour).padStart(2, '0')}:${String(existing.minute).padStart(2, '0')}`]), '', ''].slice(0, 3) : ['08:00', '', '']);
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [saving, setSaving] = useState(false);


  async function save() {
    const parsedTimes = times.filter((value) => value.trim()).map(parseTime);
    if ((startDate.trim() && !isValidMedicationDate(startDate.trim())) || (endDate.trim() && !isValidMedicationDate(endDate.trim())) || (startDate.trim() && endDate.trim() && startDate.trim() > endDate.trim())) {
      Alert.alert('Revisa la vigencia', 'Usa AAAA-MM-DD y asegúrate de que la fecha inicial no sea posterior a la final.');
      return;
    }
    if (!name.trim() || !doseText.trim() || parsedTimes.some((value) => !value) || parsedTimes.length < 1) {
      Alert.alert('Completa los datos', 'Escribe el nombre, la dosis indicada por tu equipo y al menos una hora válida en formato HH:MM.');
      return;
    }
    const validTimes = parsedTimes.filter((value): value is { hour: number; minute: number } => Boolean(value));
    const timeValues = validTimes.map((value) => `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`);
    setSaving(true);
    try {
      const input = { name: name.trim(), presentation: presentation.trim() || undefined, doseText: doseText.trim(), prescriberName: prescriberName.trim() || undefined, instructions: instructions.trim() || undefined, startDate: startDate.trim() || undefined, endDate: endDate.trim() || undefined, route, hour: validTimes[0].hour, minute: validTimes[0].minute, times: [...new Set(timeValues)].sort(), enabled };
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
        <Caption>HORAS DEL RECORDATORIO</Caption>
        {times.map((value, index) => <TextInput key={index} accessibilityLabel={`Hora del recordatorio ${index + 1}`} value={value} onChangeText={(next) => setTimes((current) => current.map((item, itemIndex) => itemIndex === index ? next : item))} keyboardType="numbers-and-punctuation" placeholder={index === 0 ? '08:00' : 'Opcional · HH:MM'} placeholderTextColor={colors.textDisabled} style={[styles.input, styles.timeInput]} />)}
        <Body>Se programará en las horas indicadas y se renovará por ventanas cortas para respetar la vigencia. El sistema operativo puede limitar alarmas exactas o pedir permisos.</Body>
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
