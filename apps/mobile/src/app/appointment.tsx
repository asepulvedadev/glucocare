import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput } from 'react-native';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../components/Typography';
import { Panel } from '../components/Panel';
import { PrimaryButton } from '../components/PrimaryButton';
import { useCare } from '../careContext';
import { openNotificationSettings } from '../notifications';
import { colors, radii, spacing } from '../theme/tokens';

function parseDateTime(raw: string) {
  const normalized = raw.trim().replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

export default function AppointmentScreen() {
  const { addAppointment } = useCare();
  const [title, setTitle] = useState('');
  const [provider, setProvider] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [insurer, setInsurer] = useState('');
  const [authorizationNumber, setAuthorizationNumber] = useState('');
  const [facility, setFacility] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [location, setLocation] = useState('');
  const [virtualUrl, setVirtualUrl] = useState('');
  const [preparationNotes, setPreparationNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    const parsed = parseDateTime(dateTime);
    if (!title.trim() || !provider.trim() || !parsed) {
      Alert.alert('Completa los datos', 'Escribe el motivo, quién te atiende y la fecha/hora en formato AAAA-MM-DD HH:MM.');
      return;
    }
    setSaving(true);
    try {
      const reminderState = await addAppointment({ title: title.trim(), provider: provider.trim(), specialty: specialty.trim() || undefined, insurer: insurer.trim() || undefined, authorizationNumber: authorizationNumber.trim() || undefined, facility: facility.trim() || undefined, requestedAt: new Date().toISOString(), scheduledAt: parsed.toISOString(), status: 'requested', location: location.trim() || undefined, virtualUrl: virtualUrl.trim() || undefined, preparationNotes: preparationNotes.trim() || undefined, notes: notes.trim() || undefined });
      if (reminderState === 'permission_denied') Alert.alert('Cita guardada', 'La cita quedó guardada, pero las notificaciones están deshabilitadas.', [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Abrir ajustes', onPress: () => void openNotificationSettings() },
      ]);
      else if (reminderState === 'unavailable') Alert.alert('Cita guardada', 'La cita quedó guardada. El recordatorio se habilita cuando la fecha esté a más de 24 horas y haya permisos.');
      router.back();
    } catch { Alert.alert('No se pudo guardar', 'Revisa los datos e inténtalo de nuevo.'); } finally { setSaving(false); }
  }

  return (
    <Screen>
      <PrimaryButton label="Volver" tone="quiet" onPress={() => router.back()} />
      <Eyebrow>Nueva cita</Eyebrow>
      <Heading>Guarda los detalles</Heading>
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
        <Body>Usa la hora local del dispositivo. El recordatorio intenta avisar un día antes.</Body>
      </Panel>
      <Panel>
        <Caption>ESTADO INICIAL</Caption>
        <Body>La cita se guardará como “Por solicitar”. Después podrás pasarla a “Por autorizar” y avanzar por las etapas válidas desde Cuidado.</Body>
      </Panel>
      <Panel>
        <Caption>OPCIONAL</Caption>
        <TextInput accessibilityLabel="EPS o asegurador" value={insurer} onChangeText={setInsurer} placeholder="EPS o asegurador" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Número de autorización" value={authorizationNumber} onChangeText={setAuthorizationNumber} placeholder="Número de autorización" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Ubicación" value={location} onChangeText={setLocation} placeholder="Ubicación" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Enlace de cita virtual" value={virtualUrl} onChangeText={setVirtualUrl} autoCapitalize="none" keyboardType="url" placeholder="Enlace de cita virtual" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Preparación para la cita" value={preparationNotes} onChangeText={setPreparationNotes} placeholder="Preparación o documentos" placeholderTextColor={colors.textDisabled} style={[styles.input, styles.multiline]} multiline />
        <TextInput accessibilityLabel="Notas de la cita" value={notes} onChangeText={setNotes} placeholder="Notas" placeholderTextColor={colors.textDisabled} style={[styles.input, styles.multiline]} multiline />
      </Panel>
      <PrimaryButton label={saving ? 'Guardando…' : 'Guardar cita'} onPress={() => void save()} disabled={saving} />
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
