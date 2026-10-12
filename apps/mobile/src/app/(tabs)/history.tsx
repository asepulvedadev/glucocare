import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../../components/Typography';
import { Panel } from '../../components/Panel';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useGlucose } from '../../context';
import { glucoseContextLabel } from '../../types/domain';
import { glucoseRiskLabel } from '../../types/carePlan';
import { colors, radii, spacing } from '../../theme/tokens';
import type { GlucoseContext } from '../../types/domain';
import { summarizeGlucose } from '../../domain/glucoseSummary';

const filters: { value: 'all' | GlucoseContext; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'fasting', label: 'Ayuno' },
  { value: 'before_meal', label: 'Antes de comer' },
  { value: 'after_meal', label: 'Después de comer' },
  { value: 'bedtime', label: 'Noche' },
  { value: 'other', label: 'Otro' },
];

const trendLabel = { higher: 'Más alto que al inicio', lower: 'Más bajo que al inicio', stable: 'Estable', none: 'Sin datos suficientes' } as const;

export default function HistoryScreen() {
  const { readings, isLoading } = useGlucose();
  const [filter, setFilter] = useState<'all' | GlucoseContext>('all');
  const filteredReadings = filter === 'all' ? readings : readings.filter((reading) => reading.context === filter);
  const summary = summarizeGlucose(filteredReadings);
  const maxPoint = Math.max(...summary.points.map((point) => point.mgDl), 1);
  return (
    <Screen>
      <Eyebrow>Historial</Eyebrow>
      <Heading>Tus registros</Heading>
      <Body>Revisa lo que has registrado. Este historial pertenece a tu dispositivo hasta que actives una sincronización.</Body>
      {!isLoading && readings.length > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} accessibilityLabel="Filtrar historial por contexto">
        {filters.map((item) => <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: filter === item.value }} onPress={() => setFilter(item.value)} style={[styles.filter, filter === item.value && styles.filterSelected]}><Text style={[styles.filterText, filter === item.value && styles.filterTextSelected]}>{item.label}</Text></Pressable>)}
      </ScrollView> : null}
      {isLoading ? <Panel><Body>Cargando registros…</Body></Panel> : readings.length === 0 ? (
        <Panel>
          <Text style={styles.emptyTitle}>Todavía no hay registros</Text>
          <Body>Empieza con una lectura y añade el contexto que te ayude a recordarla.</Body>
          <PrimaryButton label="Registrar glucosa" onPress={() => router.push('/log')} />
        </Panel>
      ) : filteredReadings.length === 0 ? <Panel><Body>No hay registros con este contexto en tu historial.</Body></Panel> : <>
        <Panel>
          <Caption>ÚLTIMOS 7 DÍAS</Caption>
          {summary.count === 0 ? <Body>No hay registros en los últimos 7 días.</Body> : <>
            <View style={styles.summaryRow}><View><Text style={styles.summaryValue}>{summary.count}</Text><Caption>registros</Caption></View><View><Text style={styles.summaryValue}>{summary.averageMgDl?.toFixed(0)} <Text style={styles.unit}>mg/dL</Text></Text><Caption>promedio aproximado</Caption></View></View>
            <Body>Rango: {summary.minimumMgDl?.toFixed(0)}–{summary.maximumMgDl?.toFixed(0)} mg/dL · {trendLabel[summary.trend]}</Body>
            <View style={styles.chart} accessibilityLabel="Tendencia visual de tus últimos registros">
              {summary.points.slice(-7).map((point) => <View key={point.id} style={styles.barColumn} accessible accessibilityLabel={`${point.mgDl.toFixed(0)} miligramos por decilitro, ${new Date(point.recordedAt).toLocaleDateString('es-CO')}`}><View style={[styles.bar, { height: Math.max(8, (point.mgDl / maxPoint) * 64) }]} /><Caption>{new Date(point.recordedAt).toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '')}</Caption></View>)}
            </View>
          </>}
        </Panel>
        {filteredReadings.map((reading) => (
        <Panel key={reading.id}>
          <View style={styles.row}>
            <View>
              <Text style={styles.value}>{reading.value} <Text style={styles.unit}>{reading.unit}</Text></Text>
              <Caption>{glucoseContextLabel[reading.context]}{reading.mealOffsetMinutes !== undefined ? ` · ${reading.mealOffsetMinutes} min después` : ''}</Caption>
            </View>
            <Caption>{new Date(reading.recordedAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</Caption>
          </View>
          {reading.symptoms ? <Body>Síntomas: {reading.symptoms}</Body> : null}
          {reading.source && reading.source !== 'manual' ? <Body>Origen: {reading.source === 'glucometer' ? 'Glucómetro' : reading.source}</Body> : null}
          {reading.note ? <Body>Nota: {reading.note}</Body> : null}
          {reading.riskClassification && reading.riskClassification !== 'unclassified' ? <Text style={styles.risk}>{glucoseRiskLabel[reading.riskClassification]}</Text> : null}
          <Text style={styles.local}>{reading.syncState === 'synced' ? 'Sincronizado' : reading.syncState === 'failed' ? 'Sincronización pendiente' : 'Guardado localmente'}</Text>
        </Panel>
        ))}
      </>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  value: { color: colors.textPrimary, fontSize: 26, fontWeight: '700' },
  unit: { color: colors.textSecondary, fontSize: 15, fontWeight: '500' },
  local: { color: colors.teal, fontSize: 12 },
  risk: { color: colors.attention, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  filters: { gap: spacing.sm, paddingVertical: spacing.xs },
  filter: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  filterSelected: { backgroundColor: colors.amber, borderColor: colors.amber },
  filterText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  filterTextSelected: { color: colors.canvas },
  summaryRow: { flexDirection: 'row', gap: spacing.xl, marginVertical: spacing.sm },
  summaryValue: { color: colors.textPrimary, fontSize: 24, fontWeight: '700' },
  chart: { minHeight: 100, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', gap: spacing.xs, marginTop: spacing.md },
  barColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4, minHeight: 92 },
  bar: { width: '70%', minWidth: 10, maxWidth: 28, borderRadius: radii.sm, backgroundColor: colors.amber },
});
