import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Screen } from '../../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../../components/Typography';
import { Panel } from '../../components/Panel';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors } from '../../theme/tokens';

export default function ProfileScreen() {
  return (
    <Screen>
      <Eyebrow>Perfil</Eyebrow>
      <Heading>Tu información</Heading>
      <Body>Completa solo lo necesario y decide qué compartir con una persona de confianza.</Body>
      <Panel tone="urgent">
        <Caption>TARJETA DE EMERGENCIA</Caption>
        <Text style={styles.title}>Aún no está configurada</Text>
        <Body>Incluye información útil para una emergencia y se guarda de forma local.</Body>
        <PrimaryButton label="Configurar más adelante" tone="quiet" onPress={() => undefined} />
      </Panel>
      <Panel>
        <Caption>PERSONA DE APOYO</Caption>
        <Text style={styles.title}>Sin contacto registrado</Text>
        <Body>Agrega un número o correo solo después de dar tu consentimiento explícito.</Body>
      </Panel>
      <PrimaryButton label="Abrir ayuda" tone="urgent" onPress={() => router.push('/help')} />
    </Screen>
  );
}
const styles = StyleSheet.create({ title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' } });
