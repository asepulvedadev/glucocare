import { router } from 'expo-router';
import { Alert, Linking, StyleSheet, Text } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../components/Typography';
import { Panel } from '../components/Panel';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/tokens';
import { useSafety } from '../safetyContext';
import { recordHelpEvent } from '../db/helpRepository';
import { useAuth } from '../authContext';
import { syncPendingData } from '../sync';
import { queueEmergencyAlert } from '../alerts';

export default function HelpScreen() {
  const db = useSQLiteContext();
  const { trustedContacts } = useSafety();
  const { session, isConfigured: isCloudConfigured } = useAuth();
  const primaryContact = trustedContacts.find((contact) => contact.consentGranted);
  async function callEmergency() {
    const url = 'tel:123';
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else Alert.alert('Llama a emergencias', 'No pudimos abrir el marcador. Usa el número local de emergencias.');
  }

  async function registerAndContact() {
    const incidentId = await recordHelpEvent(db, 'user_requested_help');
    let remoteQueued = false;
    if (session && isCloudConfigured && primaryContact) {
      try {
        await syncPendingData(db, session);
        const channel = primaryContact.email ? 'email' : primaryContact.phone ? 'sms' : null;
        if (channel) remoteQueued = Boolean(await queueEmergencyAlert({ incidentId, contactIds: trustedContacts.filter((contact) => contact.consentGranted).map((contact) => contact.id), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', channels: [channel] }));
      } catch {
        // Local event and direct-call fallback remain available if the cloud path fails.
      }
    }
    if (!primaryContact?.phone) {
      Alert.alert('Alerta registrada', remoteQueued ? 'El aviso remoto quedó encolado. No hay un número consentido para abrir una llamada.' : 'Guardamos el evento en este dispositivo, pero no hay un número consentido para contactar.');
      return;
    }
    const url = `tel:${primaryContact.phone}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else Alert.alert('Alerta registrada', 'Guardamos el evento, pero no pudimos abrir el marcador.');
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
        <Text style={styles.title}>{primaryContact ? primaryContact.name : 'No hay contacto configurado'}</Text>
        <Body>{primaryContact ? 'Puedes registrar la alerta y abrir una llamada. La app no puede confirmar que la persona conteste.' : 'Configura una persona de confianza desde tu perfil. La app te mostrará si el aviso fue creado, enviado o falló.'}</Body>
        <PrimaryButton label="Registrar alerta y contactar" tone="urgent" onPress={() => void registerAndContact()} />
      </Panel>
      <Text style={styles.disclaimer}>Si estás inconsciente, confundido o no puedes mantenerte a salvo, no esperes una notificación de la app.</Text>
    </Screen>
  );
}
const styles = StyleSheet.create({ title: { color: colors.textPrimary, fontSize: 21, fontWeight: '700' }, disclaimer: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center' } });
