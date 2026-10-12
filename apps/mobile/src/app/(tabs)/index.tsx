import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Eyebrow, Heading, Body, Caption } from '../../components/Typography';
import { Panel } from '../../components/Panel';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useGlucose } from '../../context';
import { useCare } from '../../careContext';
import { glucoseContextLabel } from '../../types/domain';
import { colors, radii, spacing } from '../../theme/tokens';
import { useAccessibility } from '../../accessibilityContext';
import { glucoseRiskLabel } from '../../types/carePlan';
import { isCarePlanExpired } from '../../domain/glucoseRisk';
import { usePrivacy } from '../../privacyContext';
import { measurementTimingLabel } from '../../types/measurement';
import { legacyMeasurementWindows } from '../../domain/measurementPlan';
import { mealTypeLabel } from '../../types/meals';
import { PlatformCapabilityNotice } from '../../components/PlatformCapabilityNotice';

export default function TodayScreen() {
  const { readings } = useGlucose();
  const { measurementPlan, medications, appointments, measurementOccurrences, medicationOccurrences, carePlan } = useCare();
  const { preferences } = useAccessibility();
  const { consent } = usePrivacy();
  const latest = readings[0];
  const latestTime = latest ? new Date(latest.recordedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : null;
  const dueMeasurement = measurementOccurrences.find((occurrence) => occurrence.status === 'due');
  const dueMedicationOccurrence = medicationOccurrences.find((occurrence) => occurrence.status === 'due');
  const dueMedication = dueMedicationOccurrence ? medications.find((medication) => medication.id === dueMedicationOccurrence.medicationId) : undefined;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.energy} accessible accessibilityLabel="Estado de cuidado en calma" />
        <Eyebrow>Glucocare</Eyebrow>
        <Heading>Tu control, en calma.</Heading>
      <Body>Registra lo que ocurre y sigue el plan que acordaste con tu equipo de salud.</Body>
      <PlatformCapabilityNotice />
      </View>
      {!consent?.localDataConsent ? <Panel tone="urgent">
        <Caption>PRIVACIDAD</Caption>
        <Text style={styles.cardTitle}>Configura tu consentimiento</Text>
        <Body>Antes de guardar registros, revisa cómo se almacenan y comparten tus datos.</Body>
        <PrimaryButton label="Revisar preferencias" tone="quiet" onPress={() => router.push('/privacy-consent')} />
      </Panel> : null}
      {carePlan && isCarePlanExpired(carePlan) ? <Panel tone="urgent">
        <Caption>PLAN CLÍNICO VENCIDO</Caption>
        <Body>Las nuevas lecturas no se clasificarán automáticamente hasta que revises la vigencia con tu equipo de salud.</Body>
        <PrimaryButton label="Revisar plan" tone="quiet" onPress={() => router.push('/care-plan')} />
      </Panel> : null}
      <Panel tone="teal">
        <Caption>PRÓXIMA ACCIÓN</Caption>
        {dueMedication ? <>
          <Text style={styles.cardTitle}>Revisar {dueMedication.name}</Text>
          <Body>Tienes una toma pendiente según el horario guardado: {new Date(dueMedicationOccurrence?.scheduledAt ?? new Date().toISOString()).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}.</Body>
          <PrimaryButton label="Abrir rutina" onPress={() => router.push('/care')} />
        </> : dueMeasurement ? <>
          <Text style={styles.cardTitle}>Registrar medición pendiente</Text>
          <Body>La hora se guardará automáticamente. Puedes corregirla después.</Body>
          <PrimaryButton label="Registrar glucosa" onPress={() => router.push('/log')} />
        </> : <>
          <Text style={styles.cardTitle}>Registrar cómo estás</Text>
          <Body>La hora se guardará automáticamente. Puedes corregirla después.</Body>
          <PrimaryButton label="Registrar glucosa" onPress={() => router.push('/log')} />
        </>}
        <PrimaryButton label="Registrar comida" tone="quiet" onPress={() => router.push('/meal')} />
      </Panel>
      {!preferences.simpleMode ? <Panel>
        <Caption>ÚLTIMO REGISTRO</Caption>
        {latest ? (
          <View style={styles.latestRow}>
            <View>
              <Text style={styles.value}>{latest.value} <Text style={styles.unit}>{latest.unit}</Text></Text>
              <Caption>{glucoseContextLabel[latest.context]} · {latestTime}</Caption>
              {latest.riskClassification && latest.riskClassification !== 'unclassified' ? <Caption>{glucoseRiskLabel[latest.riskClassification]}</Caption> : null}
            </View>
            <Text style={styles.localBadge}>{latest.syncState === 'synced' ? 'Sincronizado' : latest.syncState === 'failed' ? 'Sincronización pendiente' : 'Guardado localmente'}</Text>
          </View>
        ) : <Body>Aún no hay registros. Tu primer registro aparecerá aquí.</Body>}
      </Panel> : null}
      <Panel>
        <Caption>HOY</Caption>
        <View style={styles.timelineItem}><View style={styles.dot} /><Body>{measurementPlan ? `${measurementPlan.readingsPerDay} ${measurementPlan.readingsPerDay === 1 ? 'lectura prevista' : 'lecturas previstas'}: ${legacyMeasurementWindows(measurementPlan).map((window) => window.kind === 'fixed' ? `${window.time} (${measurementTimingLabel[window.timing]})` : `${window.offsetMinutes >= 0 ? '+' : ''}${window.offsetMinutes} min después de ${mealTypeLabel[window.meal]} (${measurementTimingLabel[window.timing]})`).join(' · ')}` : 'Plan de medición pendiente de configurar'}</Body></View>
        <View style={styles.timelineItem}><View style={[styles.dot, styles.dotMuted]} /><Body>{medications.length || appointments.length ? `${medications.length} medicamento(s) y ${appointments.length} cita(s) configurados` : 'Medicamentos y citas aparecerán cuando los agregues'}</Body></View>
      </Panel>
      <Text style={styles.disclaimer}>GlucoCare no diagnostica ni calcula dosis. Si te sientes muy mal, llama a emergencias.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: spacing.sm, gap: spacing.sm, position: 'relative' },
  energy: { position: 'absolute', width: 4, height: 148, left: -spacing.sm, top: 4, borderRadius: 3, backgroundColor: colors.amber },
  cardTitle: { color: colors.textPrimary, fontSize: 21, fontWeight: '700' },
  latestRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  value: { color: colors.textPrimary, fontSize: 32, fontWeight: '700' },
  unit: { color: colors.textSecondary, fontSize: 16, fontWeight: '500' },
  localBadge: { color: colors.teal, fontSize: 12, maxWidth: 120, textAlign: 'right' },
  timelineItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  dot: { width: 10, height: 10, borderRadius: radii.pill, backgroundColor: colors.amber },
  dotMuted: { backgroundColor: colors.border },
  disclaimer: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, paddingHorizontal: spacing.xs, paddingBottom: spacing.lg },
});
