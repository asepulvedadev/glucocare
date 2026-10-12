import { useLocalSearchParams } from 'expo-router';
import { safeBack } from '../navigation';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput } from 'react-native';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../components/Typography';
import { Panel } from '../components/Panel';
import { PrimaryButton } from '../components/PrimaryButton';
import { useCare } from '../careContext';
import { openNotificationSettings } from '../notifications';
import type { Appointment } from '../types/appointments';
import { colors, radii, spacing } from '../theme/tokens';

function parseDateTime(raw: string) {
  const normalized = raw.trim().replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

function localDateTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AppointmentScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { appointments, isLoading } = useCare();
  const existing = typeof id === 'string' ? appointments.find((item) => item.id === id) : undefined;
  if (id && !existing && isLoading) return <Screen><Body>Cargando cita…</Body></Screen>;
  if (id && !existing) return <Screen><PrimaryButton label="Volver" tone="quiet" onPress={() => safeBack()} /><Body>No encontramos esa cita en este dispositivo.</Body></Screen>;
  return <AppointmentForm existing={existing} />;
}

function AppointmentForm({ existing }: { existing?: Appointment }) {
  const { addAppointment, updateAppointment } = useCare();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [provider, setProvider] = useState(existing?.provider ?? '');
  const [specialty, setSpecialty] = useState(existing?.specialty ?? '');
  const [insurer, setInsurer] = useState(existing?.insurer ?? '');
  const [authorizationNumber, setAuthorizationNumber] = useState(existing?.authorizationNumber ?? '');
  const [facility, setFacility] = useState(existing?.facility ?? '');
  const [dateTime, setDateTime] = useState(localDateTime(existing?.scheduledAt));
  const [location, setLocation] = useState(existing?.location ?? '');
  const [virtualUrl, setVirtualUrl] = useState(existing?.virtualUrl ?? '');
  const [preparationNotes, setPreparationNotes] = useState(existing?.preparationNotes ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    const parsed = parseDateTime(dateTime);
    if (!title.trim() || !provider.trim() || !parsed) {
      Alert.alert('Completa los datos', 'Escribe el motivo, quién te atiende y la fecha/hora en formato AAAA-MM-DD HH:MM.');
      return;
    }
    setSaving(true);
    try {
      const input = {
        title: title.trim(),
        provider: provider.trim(),
        specialty: specialty.trim() || undefined,
        insurer: insurer.trim() || undefined,
        authorizationNumber: authorizationNumber.trim() || undefined,
        facility: facility.trim() || undefined,
        requestedAt: existing?.requestedAt ?? new Date().toISOString(),
        scheduledAt: parsed.toISOString(),
        status: existing?.status ?? 'requested',
        location: location.trim() || undefined,
        virtualUrl: virtualUrl.trim() || undefined,
        preparationNotes: preparationNotes.trim() || undefined,
        notes: notes.trim() || undefined,
      } as const;
      const reminderState = existing ? await updateAppointment(existing.id, input) : await addAppointment(input);
      if (reminderState === 'permission_denied') Alert.alert('Cita guardada', 'La cita quedó guardada, pero las notificaciones están deshabilitadas.', [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Abrir ajustes', onPress: () => void openNotificationSettings() },
      ]);
      else if (reminderState === 'unavailable') Alert.alert('Cita guardada', 'La cita quedó guardada. El recordatorio se habilita cuando la fecha esté a más de 24 horas y haya permisos.');
      else if (reminderState === 'scheduled_limited') Alert.alert('Cita guardada', 'La cita quedó guardada. El sistema priorizó los recordatorios más próximos por el límite del dispositivo; volverá a revisar la agenda al abrir la app.');
      safeBack();
    } catch { Alert.alert('No se pudo guardar', 'Revisa los datos e inténtalo de nuevo.'); } finally { setSaving(false); }
  }

  return (
    <Screen>
      <PrimaryButton label="Volver" tone="quiet" onPress={() => safeBack()} />
      <Eyebrow>{existing ? 'Editar cita' : 'Nueva cita'}</Eyebrow>
      <Heading>{existing ? 'Actualiza los detalles' : 'Guarda los detalles'}</Heading>
      <Body>El estado ayuda a organizar el proceso administrativo. No confirma una atención médica.</Body>
      <Panel>
        <Caption>MOTIVO</Caption>
        <TextInput accessibilityLabel="Motivo de la cita" value={title} onChangeText={setTitle} placeholder="Ej. Control de endocrinología" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <Caption>PROFESIONAL O CENTRO</Caption>
        <TextInput accessibilityLabel="Profesional o centro" value={provider} onChangeText={setProvider} placeholder="Ej. Dra. Pérez · Clínica" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Especialidad" value={specialty} onChangeText={setSpecialty} placeholder="Especialidad (opcional)" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="IPS o centro de atención" value={facility} onChangeText={setFacility} placeholder="IPS o centro (opcional)" placeholderTextColor={colors.textDisabled} style={styles.input} />
      </Panel>
      <Panel>
        <Caption>FECHA Y HORA</Caption>
        <TextInput accessibilityLabel="Fecha y hora de la cita" value={dateTime} onChangeText={setDateTime} placeholder="2026-10-20 09:00" placeholderTextColor={colors.textDisabled} style={[styles.input, styles.dateInput]} />
        <Body>Usa la hora local del dispositivo. Al cambiarla, el recordatorio anterior se cancela y se programa uno nuevo cuando sea posible.</Body>
      </Panel>
      {existing ? <Panel><Caption>ESTADO ACTUAL</Caption><Body>La cita conserva su estado actual. Puedes cambiarlo desde Cuidado.</Body></Panel> : <Panel><Caption>ESTADO INICIAL</Caption><Body>La cita se guardará como “Por solicitar”. Después podrás pasarla por las etapas válidas desde Cuidado.</Body></Panel>}
      <Panel>
        <Caption>OPCIONAL</Caption>
        <TextInput accessibilityLabel="EPS o asegurador" value={insurer} onChangeText={setInsurer} placeholder="EPS o asegurador" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Número de autorización" value={authorizationNumber} onChangeText={setAuthorizationNumber} placeholder="Número de autorización" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Ubicación" value={location} onChangeText={setLocation} placeholder="Ubicación" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Enlace de cita virtual" value={virtualUrl} onChangeText={setVirtualUrl} autoCapitalize="none" keyboardType="url" placeholder="Enlace de cita virtual" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Preparación para la cita" value={preparationNotes} onChangeText={setPreparationNotes} placeholder="Preparación o documentos" placeholderTextColor={colors.textDisabled} style={[styles.input, styles.multiline]} multiline />
        <TextInput accessibilityLabel="Notas de la cita" value={notes} onChangeText={setNotes} placeholder="Notas" placeholderTextColor={colors.textDisabled} style={[styles.input, styles.multiline]} multiline />
      </Panel>
      <PrimaryButton label={saving ? 'Guardando…' : existing ? 'Actualizar cita' : 'Guardar cita'} onPress={() => void save()} disabled={saving} />
      <Text style={styles.disclaimer}>Los recordatorios son una ayuda y no garantizan la asistencia ni la entrega de una notificación.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { color: colors.textPrimary, backgroundColor: colors.surfaceRaised, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, minHeight: 52, fontSize: 16 },
  dateInput: { fontSize: 20, fontWeight: '700' },
  multiline: { minHeight: 84, textAlignVertical: 'top', paddingTop: spacing.sm },
  disclaimer: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingBottom: spacing.lg },
});
