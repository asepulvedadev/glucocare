import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../../components/Typography';
import { Panel } from '../../components/Panel';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useCare } from '../../careContext';
import { medicationRouteLabel } from '../../types/care';
import { colors, spacing } from '../../theme/tokens';

function formatTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export default function CareScreen() {
  const { medications, isLoading } = useCare();
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
            <View style={styles.medicationCopy}><Text style={styles.medicationName}>{medication.name}</Text><Body>{medication.doseText} · {medicationRouteLabel[medication.route]}</Body><Text style={[styles.reminder, medication.reminderState !== 'scheduled' && styles.reminderMuted]}>{medication.reminderState === 'scheduled' ? 'Recordatorio programado en este dispositivo' : 'Recordatorio no habilitado; revisa permisos'}</Text></View>
          </View>
        ))}
      </Panel>
      <Panel>
        <Caption>CITAS</Caption>
        <Text style={styles.title}>Sin próximas citas</Text>
        <Body>Las citas mostrarán si están por autorizar, autorizadas, agendadas o completadas.</Body>
      </Panel>
      <Panel>
        <Caption>PLAN DE MEDICIÓN</Caption>
        <View style={styles.planRow}><View style={styles.indicator} /><Body>Configúralo con instrucciones de tu equipo de salud</Body></View>
      </Panel>
    </Screen>
  );
}
const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  medicationRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  timeBox: { width: 72, gap: 2 },
  time: { color: colors.amber, fontSize: 20, fontWeight: '700' },
  medicationCopy: { flex: 1, gap: 2 },
  medicationName: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  reminder: { color: colors.teal, fontSize: 12, lineHeight: 17 },
  reminderMuted: { color: colors.attention },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  indicator: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.info },
});
