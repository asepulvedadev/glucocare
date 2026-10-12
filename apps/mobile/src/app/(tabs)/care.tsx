import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../../components/Typography';
import { Panel } from '../../components/Panel';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useCare } from '../../careContext';
import { medicationRouteLabel } from '../../types/care';
import { medicationOccurrenceStatusLabel } from '../../types/medicationOccurrences';
import { appointmentStatusLabel } from '../../types/appointments';
import { colors, spacing } from '../../theme/tokens';

function formatTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export default function CareScreen() {
  const { medications, medicationOccurrences, appointments, measurementPlan, isLoading, markMedicationOccurrence } = useCare();
  const [actingOccurrenceId, setActingOccurrenceId] = useState<string | null>(null);

  async function updateOccurrence(occurrenceId: string, status: 'taken' | 'skipped') {
    setActingOccurrenceId(occurrenceId);
    try {
      await markMedicationOccurrence(occurrenceId, status);
    } catch {
      Alert.alert('No se pudo actualizar', 'Conserva la instrucción de tu equipo de salud y vuelve a intentarlo.');
    } finally {
      setActingOccurrenceId(null);
    }
  }

  return (
    <Screen>
      <Eyebrow>Cuidado</Eyebrow>
      <Heading>Tu rutina</Heading>
      <Body>Aquí verás los medicamentos, mediciones y citas que configures con tu equipo de salud.</Body>
      <Panel>
        <View style={styles.sectionHeader}>
          <Caption>MEDICAMENTOS</Caption>
          <PrimaryButton label="Agregar" tone="quiet" onPress={() => router.push('/medication')} />
        </View>
        {isLoading ? <Body>Cargando rutina…</Body> : medications.length === 0 ? (
          <>
            <Text style={styles.title}>Aún no hay medicamentos</Text>
            <Body>Agrega solo las instrucciones que ya te dio tu equipo de salud. GlucoCare no modifica dosis.</Body>
          </>
        ) : medications.map((medication) => (
          <View key={medication.id} style={styles.medicationRow}>
            <View style={styles.timeBox}><Text style={styles.time}>{formatTime(medication.hour, medication.minute)}</Text><Caption>diario</Caption></View>
            <View style={styles.medicationCopy}>
              <Text style={styles.medicationName}>{medication.name}</Text>
              <Body>{medication.doseText} · {medicationRouteLabel[medication.route]}</Body>
              <Text style={[styles.reminder, medication.reminderState !== 'scheduled' && styles.reminderMuted]}>{medication.reminderState === 'scheduled' ? 'Recordatorio programado en este dispositivo' : 'Recordatorio no habilitado; revisa permisos'}</Text>
              {(() => {
                const occurrence = medicationOccurrences.find((item) => item.medicationId === medication.id);
                if (!occurrence) return null;
                const acted = occurrence.status !== 'due';
                return <>
                  <Text style={styles.occurrenceStatus} accessibilityLabel={`Estado de la toma: ${medicationOccurrenceStatusLabel[occurrence.status]}`}>Toma de hoy: {medicationOccurrenceStatusLabel[occurrence.status]}</Text>
                  {!acted ? <View style={styles.occurrenceActions}>
                    <PrimaryButton label="Marcar tomado" tone="quiet" disabled={actingOccurrenceId === occurrence.id} onPress={() => void updateOccurrence(occurrence.id, 'taken')} />
                    <PrimaryButton label="Omitir" tone="quiet" disabled={actingOccurrenceId === occurrence.id} onPress={() => void updateOccurrence(occurrence.id, 'skipped')} />
                  </View> : null}
                </>;
              })()}
            </View>
          </View>
        ))}
      </Panel>
      <Panel>
        <View style={styles.sectionHeader}>
          <Caption>CITAS</Caption>
          <PrimaryButton label="Agregar" tone="quiet" onPress={() => router.push('/appointment')} />
        </View>
        {isLoading ? <Body>Cargando citas…</Body> : appointments.length === 0 ? (
          <>
            <Text style={styles.title}>Sin próximas citas</Text>
            <Body>Las citas mostrarán si están por autorizar, autorizadas, agendadas o completadas.</Body>
          </>
        ) : appointments.map((appointment) => {
          const date = new Date(appointment.scheduledAt);
          return <View key={appointment.id} style={styles.appointmentRow}>
            <View style={styles.appointmentCopy}><Text style={styles.medicationName}>{appointment.title}</Text><Body>{appointment.provider} · {date.toLocaleDateString('es-CO')} {date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</Body>{appointment.location ? <Caption>{appointment.location}</Caption> : null}<Text style={styles.status}>{appointmentStatusLabel[appointment.status]} · {appointment.reminderState === 'scheduled' ? 'Recordatorio activo' : 'Sin recordatorio'}</Text></View>
          </View>;
        })}
      </Panel>
      <Panel>
        <View style={styles.sectionHeader}>
          <Caption>PLAN DE MEDICIÓN</Caption>
          <PrimaryButton label={measurementPlan ? 'Editar' : 'Configurar'} tone="quiet" onPress={() => router.push('/measurement-plan')} />
        </View>
        {measurementPlan ? <><Text style={styles.title}>{measurementPlan.readingsPerDay} {measurementPlan.readingsPerDay === 1 ? 'lectura' : 'lecturas'} al día</Text><Body>{measurementPlan.times.join(' · ')}</Body>{measurementPlan.instructions ? <Caption>{measurementPlan.instructions}</Caption> : null}</> : <View style={styles.planRow}><View style={styles.indicator} /><Body>Configúralo con instrucciones de tu equipo de salud</Body></View>}
      </Panel>
    </Screen>
  );
}
const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  medicationRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  appointmentRow: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  timeBox: { width: 72, gap: 2 },
  time: { color: colors.amber, fontSize: 20, fontWeight: '700' },
  medicationCopy: { flex: 1, gap: 2 },
  medicationName: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  reminder: { color: colors.teal, fontSize: 12, lineHeight: 17 },
  reminderMuted: { color: colors.attention },
  occurrenceStatus: { color: colors.textPrimary, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  occurrenceActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  appointmentCopy: { flex: 1, gap: 2 },
  status: { color: colors.info, fontSize: 12, lineHeight: 17 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  indicator: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.info },
});
