import { router } from 'expo-router';
import { Alert, Linking, StyleSheet, Text } from 'react-native';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../components/Typography';
import { Panel } from '../components/Panel';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/tokens';

export default function HelpScreen() {
  async function callEmergency() {
    const url = 'tel:123';
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else Alert.alert('Llama a emergencias', 'No pudimos abrir el marcador. Usa el número local de emergencias.');
  }
  return (
    <Screen>
      <PrimaryButton label="Volver" tone="quiet" onPress={() => router.back()} />
      <Eyebrow>Ayuda inmediata</Eyebrow>
      <Heading>Si te sientes muy mal</Heading>
      <Body>Busca ayuda humana ahora. GlucoCare no puede diagnosticarte ni garantizar que una alerta llegue.</Body>
      <Panel tone="urgent">
        <Caption>EMERGENCIA</Caption>
        <Text style={styles.title}>Llama al número local de emergencias</Text>
        <Body>Si estás en Colombia, el número general es 123. Si estás en otro lugar, usa el número local.</Body>
        <PrimaryButton label="Llamar a emergencias" tone="urgent" onPress={() => void callEmergency()} />
      </Panel>
      <Panel>
        <Caption>CONTACTO DE APOYO</Caption>
        <Text style={styles.title}>No hay contacto configurado</Text>
        <Body>Configura una persona de confianza desde tu perfil. La app te mostrará si el aviso fue creado, enviado o falló.</Body>
      </Panel>
      <Text style={styles.disclaimer}>Si estás inconsciente, confundido o no puedes mantenerte a salvo, no esperes una notificación de la app.</Text>
    </Screen>
  );
}
const styles = StyleSheet.create({ title: { color: colors.textPrimary, fontSize: 21, fontWeight: '700' }, disclaimer: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center' } });
