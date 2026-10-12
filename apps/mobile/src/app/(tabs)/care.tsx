import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../../components/Typography';
import { Panel } from '../../components/Panel';
import { colors, spacing } from '../../theme/tokens';

export default function CareScreen() {
  return (
    <Screen>
      <Eyebrow>Cuidado</Eyebrow>
      <Heading>Tu rutina</Heading>
      <Body>Aquí verás los medicamentos, mediciones y citas que configures con tu equipo de salud.</Body>
      <Panel>
        <Caption>MEDICAMENTOS</Caption>
        <Text style={styles.title}>Aún no hay medicamentos</Text>
        <Body>Cuando agregues uno, GlucoCare podrá recordarte la hora configurada. No modifica dosis.</Body>
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
const styles = StyleSheet.create({ title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' }, planRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, indicator: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.info } });
