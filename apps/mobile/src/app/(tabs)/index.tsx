import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Eyebrow, Heading, Body, Caption } from '../../components/Typography';
import { Panel } from '../../components/Panel';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useGlucose } from '../../context';
import { useCare } from '../../careContext';
import { glucoseContextLabel } from '../../types/domain';
import { colors, radii, spacing } from '../../theme/tokens';
import { useAccessibility } from '../../accessibilityContext';

export default function TodayScreen() {
  const { readings } = useGlucose();
  const { measurementPlan, medications, appointments } = useCare();
  const { preferences } = useAccessibility();
  const latest = readings[0];
  const latestTime = latest ? new Date(latest.recordedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.energy} accessible accessibilityLabel="Estado de cuidado en calma" />
        <Eyebrow>Glucocare</Eyebrow>
        <Heading>Tu control, en calma.</Heading>
        <Body>Registra lo que ocurre y sigue el plan que acordaste con tu equipo de salud.</Body>
        <Pressable accessibilityRole="button" accessibilityLabel="Abrir ayuda urgente" onPress={() => router.push('/help')} style={styles.helpLink}>
          <Text style={styles.helpText}>Necesito ayuda</Text>
        </Pressable>
      </View>
      <Panel tone="teal">
        <Caption>PRÓXIMA ACCIÓN</Caption>
        <Text style={styles.cardTitle}>Registrar cómo estás</Text>
        <Body>La hora se guardará automáticamente. Puedes corregirla después.</Body>
        <PrimaryButton label="Registrar glucosa" onPress={() => router.push('/log')} />
      </Panel>
      {!preferences.simpleMode ? <Panel>
        <Caption>ÚLTIMO REGISTRO</Caption>
        {latest ? (
          <View style={styles.latestRow}>
            <View>
              <Text style={styles.value}>{latest.value} <Text style={styles.unit}>{latest.unit}</Text></Text>
              <Caption>{glucoseContextLabel[latest.context]} · {latestTime}</Caption>
            </View>
            <Text style={styles.localBadge}>{latest.syncState === 'synced' ? 'Sincronizado' : latest.syncState === 'failed' ? 'Sincronización pendiente' : 'Guardado localmente'}</Text>
          </View>
        ) : <Body>Aún no hay registros. Tu primer registro aparecerá aquí.</Body>}
      </Panel> : null}
      <Panel>
        <Caption>HOY</Caption>
        <View style={styles.timelineItem}><View style={styles.dot} /><Body>{measurementPlan ? `${measurementPlan.readingsPerDay} ${measurementPlan.readingsPerDay === 1 ? 'lectura prevista' : 'lecturas previstas'}: ${measurementPlan.times.join(' · ')}` : 'Plan de medición pendiente de configurar'}</Body></View>
        <View style={styles.timelineItem}><View style={[styles.dot, styles.dotMuted]} /><Body>{medications.length || appointments.length ? `${medications.length} medicamento(s) y ${appointments.length} cita(s) configurados` : 'Medicamentos y citas aparecerán cuando los agregues'}</Body></View>
      </Panel>
      <Text style={styles.disclaimer}>GlucoCare no diagnostica ni calcula dosis. Si te sientes muy mal, llama a emergencias.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: spacing.sm, gap: spacing.sm, position: 'relative' },
  energy: { position: 'absolute', width: 4, height: 148, left: -spacing.sm, top: 4, borderRadius: 3, backgroundColor: colors.amber },
  helpLink: { alignSelf: 'flex-start', marginTop: spacing.xs, minHeight: 44, justifyContent: 'center' },
  helpText: { color: colors.urgent, fontSize: 16, fontWeight: '700' },
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
