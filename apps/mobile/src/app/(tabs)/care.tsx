import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../../components/Typography';
import { Panel } from '../../components/Panel';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useCare } from '../../careContext';
import { medicationRouteLabel } from '../../types/care';
import { medicationOccurrenceStatusLabel } from '../../types/medicationOccurrences';
import { measurementOccurrenceStatusLabel } from '../../types/measurementOccurrences';
import { measurementTimingLabel } from '../../types/measurement';
import { appointmentStatusLabel } from '../../types/appointments';
import { availableAppointmentTransitions } from '../../domain/appointmentState';
import { isCarePlanExpired } from '../../domain/glucoseRisk';
import { colors, spacing } from '../../theme/tokens';

function formatTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export default function CareScreen() {
  const { medications, medicationOccurrences, measurementOccurrences, appointments, measurementPlan, carePlan, isLoading, markMedicationOccurrence, snoozeMedicationOccurrence, markMeasurementOccurrence, updateAppointmentStatus, refresh } = useCare();
  const [actingOccurrenceId, setActingOccurrenceId] = useState<string | null>(null);
  const [actingMeasurementId, setActingMeasurementId] = useState<string | null>(null);
  const [actingAppointmentId, setActingAppointmentId] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  async function updateOccurrence(occurrenceId: string, status: 'taken' | 'skipped' | 'not_recorded') {
    setActingOccurrenceId(occurrenceId);
    try {
      await markMedicationOccurrence(occurrenceId, status);
    } catch {
      Alert.alert('No se pudo actualizar', 'Conserva la instrucción de tu equipo de salud y vuelve a intentarlo.');
    } finally {
      setActingOccurrenceId(null);
    }
  }

  async function snoozeOccurrence(occurrenceId: string) {
    setActingOccurrenceId(occurrenceId);
    try {
      const permission = await snoozeMedicationOccurrence(occurrenceId);
      if (permission === 'permission_denied') Alert.alert('Toma pospuesta', 'Guardamos el estado, pero las notificaciones están deshabilitadas.');
      else if (permission === 'unavailable') Alert.alert('Toma pospuesta', 'Guardamos el estado. El recordatorio pospuesto solo está disponible en el dispositivo.');
    } catch {
      Alert.alert('No se pudo posponer', 'Vuelve a intentarlo.');
    } finally {
      setActingOccurrenceId(null);
    }
  }

  async function updateMeasurementOccurrence(occurrenceId: string, status: 'skipped') {
    setActingMeasurementId(occurrenceId);
    try {
      await markMeasurementOccurrence(occurrenceId, status);
    } catch {
      Alert.alert('No se pudo actualizar', 'Vuelve a intentarlo cuando estés listo.');
    } finally {
      setActingMeasurementId(null);
    }
  }

  async function updateAppointment(appointmentId: string, status: 'pending_authorization' | 'authorized' | 'scheduled' | 'completed' | 'cancelled') {
    setActingAppointmentId(appointmentId);
    try {
      await updateAppointmentStatus(appointmentId, status);
    } catch {
      Alert.alert('No se pudo actualizar', 'El estado de la cita no se puede cambiar desde su estado actual.');
    } finally {
      setActingAppointmentId(null);
    }
  }

  return (
    <Screen>
      <Eyebrow>Cuidado</Eyebrow>
      <Heading>Tu rutina</Heading>
      <Body>Aquí verás los medicamentos, mediciones y citas que configures con tu equipo de salud.</Body>
      <Panel>
        <View style={styles.sectionHeader}>
          <Caption>PLAN CLÍNICO</Caption>
          <PrimaryButton label={carePlan ? 'Editar' : 'Configurar'} tone="quiet" onPress={() => router.push('/care-plan')} />
        </View>
        {carePlan ? <><Text style={styles.title}>{isCarePlanExpired(carePlan) ? 'Plan vencido: requiere revisión' : carePlan.clinicianVerified ? 'Instrucciones confirmadas por ti' : 'Valores guardados en este dispositivo'}</Text><Body>{isCarePlanExpired(carePlan) ? 'Las nuevas lecturas quedarán sin clasificación automática hasta que actualices la vigencia con tu equipo de salud.' : carePlan.instructions ?? 'Hay umbrales configurados para clasificar lecturas; revisa siempre las instrucciones de tu equipo.'}</Body>{carePlan.effectiveTo ? <Caption>Vigente hasta {new Date(carePlan.effectiveTo).toLocaleDateString('es-CO')}</Caption> : null}</> : <Body>Guarda los umbrales e instrucciones que te haya dado tu equipo de salud para clasificar tus lecturas sin inventar objetivos.</Body>}
      </Panel>
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
            <View style={styles.timeBox}><Text style={styles.time}>{(medication.times?.length ? medication.times : [formatTime(medication.hour, medication.minute)]).join(' · ')}</Text><Caption>diario</Caption></View>
            <View style={styles.medicationCopy}>
              <Text style={styles.medicationName}>{medication.name}</Text>
              <Body>{medication.doseText} · {medicationRouteLabel[medication.route]}</Body>
              {medication.prescriberName ? <Caption>Indicado por {medication.prescriberName}</Caption> : null}
              {medication.startDate || medication.endDate ? <Caption>Vigencia: {medication.startDate ?? 'sin fecha inicial'} → {medication.endDate ?? 'sin fecha final'}</Caption> : null}
              {medication.instructions ? <Caption>{medication.instructions}</Caption> : null}
              <Text style={[styles.reminder, medication.reminderState !== 'scheduled' && styles.reminderMuted]}>{medication.reminderState === 'scheduled' ? 'Recordatorio programado en este dispositivo' : 'Recordatorio no habilitado; revisa permisos'}</Text>
              {medicationOccurrences.filter((occurrence) => occurrence.medicationId === medication.id).map((occurrence) => {
                const actionable = occurrence.status === 'due' || occurrence.status === 'snoozed';
                const scheduledTime = new Date(occurrence.scheduledAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
                return <View key={occurrence.id} style={styles.occurrenceBlock}>
                  <Text style={styles.occurrenceStatus} accessibilityLabel={`Toma de las ${scheduledTime}: ${medicationOccurrenceStatusLabel[occurrence.status]}`}>
                    Toma de las {scheduledTime}: {medicationOccurrenceStatusLabel[occurrence.status]}
                  </Text>
                  {actionable ? <View style={styles.occurrenceActions}>
                    <PrimaryButton label="Marcar tomado" tone="quiet" disabled={actingOccurrenceId === occurrence.id} onPress={() => void updateOccurrence(occurrence.id, 'taken')} />
                    <PrimaryButton label="Omitir" tone="quiet" disabled={actingOccurrenceId === occurrence.id} onPress={() => void updateOccurrence(occurrence.id, 'skipped')} />
                    {occurrence.status === 'due' ? <PrimaryButton label="Posponer 10 min" tone="quiet" disabled={actingOccurrenceId === occurrence.id} onPress={() => void snoozeOccurrence(occurrence.id)} /> : null}
                    <PrimaryButton label="No registrada" tone="quiet" disabled={actingOccurrenceId === occurrence.id} onPress={() => void updateOccurrence(occurrence.id, 'not_recorded')} />
                  </View> : null}
                </View>;
              })}
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
            <View style={styles.appointmentCopy}><Text style={styles.medicationName}>{appointment.title}</Text><Body>{appointment.provider} · {date.toLocaleDateString('es-CO')} {date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</Body>{appointment.location ? <Caption>{appointment.location}</Caption> : null}<Text style={styles.status}>{appointmentStatusLabel[appointment.status]} · {appointment.reminderState === 'scheduled' ? 'Recordatorio activo' : 'Sin recordatorio'}</Text>
              {availableAppointmentTransitions(appointment.status).length > 0 ? <View style={styles.occurrenceActions}>{availableAppointmentTransitions(appointment.status).map((nextStatus) => <PrimaryButton key={nextStatus} label={`Marcar ${appointmentStatusLabel[nextStatus].toLowerCase()}`} tone="quiet" disabled={actingAppointmentId === appointment.id} onPress={() => void updateAppointment(appointment.id, nextStatus as 'pending_authorization' | 'authorized' | 'scheduled' | 'completed' | 'cancelled')} />)}</View> : null}
            </View>
          </View>;
        })}
      </Panel>
      <Panel>
        <View style={styles.sectionHeader}>
          <Caption>PLAN DE MEDICIÓN</Caption>
          <PrimaryButton label={measurementPlan ? 'Editar' : 'Configurar'} tone="quiet" onPress={() => router.push('/measurement-plan')} />
        </View>
        {measurementPlan ? <>
          <Text style={styles.title}>{measurementPlan.readingsPerDay} {measurementPlan.readingsPerDay === 1 ? 'lectura' : 'lecturas'} al día</Text>
          <Body>{measurementPlan.times.map((time, index) => `${time} · ${measurementTimingLabel[measurementPlan.timings?.[index] ?? 'other']}`).join(' | ')}</Body>
          {measurementPlan.instructions ? <Caption>{measurementPlan.instructions}</Caption> : null}
          <View style={styles.measurementList}>
            {measurementOccurrences.map((occurrence, occurrenceIndex) => {
              const status = occurrence.status;
              const actionable = status === 'planned' || status === 'due';
              return <View key={occurrence.id} style={styles.measurementRow}>
                <View style={styles.measurementCopy}>
                  <View><Text style={styles.measurementTime}>{new Date(occurrence.scheduledAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</Text><Caption>{measurementTimingLabel[measurementPlan.timings?.[occurrenceIndex] ?? 'other']}</Caption></View>
                  <Text style={styles.status} accessibilityLabel={`Estado de la medición: ${measurementOccurrenceStatusLabel[status]}`}>{measurementOccurrenceStatusLabel[status]}</Text>
                </View>
                {actionable ? <View style={styles.occurrenceActions}>
                  <PrimaryButton label="Registrar lectura" tone="quiet" onPress={() => router.push('/log')} />
                  <PrimaryButton label="Omitir" tone="quiet" disabled={actingMeasurementId === occurrence.id} onPress={() => void updateMeasurementOccurrence(occurrence.id, 'skipped')} />
                </View> : null}
              </View>;
            })}
          </View>
        </> : <View style={styles.planRow}><View style={styles.indicator} /><Body>Configúralo con instrucciones de tu equipo de salud</Body></View>}
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
  occurrenceBlock: { gap: spacing.xs, marginTop: spacing.xs },
  occurrenceActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  measurementList: { marginTop: spacing.sm, gap: spacing.xs },
  measurementRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xs, gap: spacing.xs },
  measurementCopy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  measurementTime: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  appointmentCopy: { flex: 1, gap: 2 },
  status: { color: colors.info, fontSize: 12, lineHeight: 17 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  indicator: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.info },
});
