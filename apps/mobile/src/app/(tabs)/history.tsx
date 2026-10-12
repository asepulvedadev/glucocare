import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../../components/Typography';
import { Panel } from '../../components/Panel';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useGlucose } from '../../context';
import { glucoseContextLabel } from '../../types/domain';
import { colors, spacing } from '../../theme/tokens';

export default function HistoryScreen() {
  const { readings, isLoading } = useGlucose();
  return (
    <Screen>
      <Eyebrow>Historial</Eyebrow>
      <Heading>Tus registros</Heading>
      <Body>Revisa lo que has registrado. Este historial pertenece a tu dispositivo hasta que actives una sincronización.</Body>
      {isLoading ? <Panel><Body>Cargando registros…</Body></Panel> : readings.length === 0 ? (
        <Panel>
          <Text style={styles.emptyTitle}>Todavía no hay registros</Text>
          <Body>Empieza con una lectura y añade el contexto que te ayude a recordarla.</Body>
          <PrimaryButton label="Registrar glucosa" onPress={() => router.push('/log')} />
        </Panel>
      ) : readings.map((reading) => (
        <Panel key={reading.id}>
          <View style={styles.row}>
            <View>
              <Text style={styles.value}>{reading.value} <Text style={styles.unit}>{reading.unit}</Text></Text>
              <Caption>{glucoseContextLabel[reading.context]}</Caption>
            </View>
            <Caption>{new Date(reading.recordedAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</Caption>
          </View>
          {reading.symptoms ? <Body>Síntomas: {reading.symptoms}</Body> : null}
          {reading.note ? <Body>Nota: {reading.note}</Body> : null}
          <Text style={styles.local}>{reading.syncState === 'synced' ? 'Sincronizado' : reading.syncState === 'failed' ? 'Sincronización pendiente' : 'Guardado localmente'}</Text>
        </Panel>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  value: { color: colors.textPrimary, fontSize: 26, fontWeight: '700' },
  unit: { color: colors.textSecondary, fontSize: 15, fontWeight: '500' },
  local: { color: colors.teal, fontSize: 12 },
});
