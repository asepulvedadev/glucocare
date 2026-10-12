import { router } from 'expo-router';
import { Alert, Linking, Platform, StyleSheet, Text } from 'react-native';
import { useState } from 'react';
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
import { emergencyConfig } from '../config';

export default function HelpScreen() {
  const db = useSQLiteContext();
  const { trustedContacts, emergencyCard } = useSafety();
  const { session, isConfigured: isCloudConfigured } = useAuth();
  const primaryContact = trustedContacts.find((contact) => contact.consentGranted);
  const [processing, setProcessing] = useState(false);
  async function callEmergency() {
    const url = `tel:${emergencyConfig.number}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else Alert.alert('Llama a emergencias', 'No pudimos abrir el marcador. Usa el número local de emergencias.');
  }

  async function registerAndContact() {
    setProcessing(true);
    try {
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
    } finally {
      setProcessing(false);
    }
  }

  function confirmContact() {
    const confirm = () => void registerAndContact();
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.('¿Necesitas ayuda ahora? Esto registra un evento local y puede abrir una llamada al contacto consentido.')) confirm();
      return;
    }
    Alert.alert('¿Necesitas ayuda ahora?', 'Esto registra un evento local y puede abrir una llamada al contacto consentido. La app no confirma que alguien responda.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí, continuar', style: 'destructive', onPress: confirm },
    ]);
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
        <Body>En {emergencyConfig.region}, el número configurado es {emergencyConfig.number}. Si estás en otro lugar, usa el número local de emergencias.</Body>
        <PrimaryButton label="Llamar a emergencias" tone="urgent" onPress={() => void callEmergency()} />
      </Panel>
      <Panel>
        <Caption>TARJETA OFFLINE</Caption>
        {emergencyCard ? <><Text style={styles.title}>{emergencyCard.fullName}</Text>{emergencyCard.diabetesType ? <Body>Tipo: {emergencyCard.diabetesType}</Body> : null}{emergencyCard.allergies ? <Body>Alergias: {emergencyCard.allergies}</Body> : null}{emergencyCard.careFacility ? <Body>Lugar habitual: {emergencyCard.careFacility}</Body> : null}{emergencyCard.careProvider ? <Body>Contacto de atención: {emergencyCard.careProvider}</Body> : null}</> : <Body>Configura una tarjeta para que esta información esté disponible sin cuenta ni conexión.</Body>}
        <PrimaryButton label={emergencyCard ? 'Editar tarjeta' : 'Configurar tarjeta'} tone="quiet" onPress={() => router.push('/emergency-card')} />
      </Panel>
      <Panel>
        <Caption>CONTACTO DE APOYO</Caption>
        <Text style={styles.title}>{primaryContact ? primaryContact.name : 'No hay contacto configurado'}</Text>
        <Body>{primaryContact ? 'Puedes registrar la alerta y abrir una llamada. La app no puede confirmar que la persona conteste.' : 'Configura una persona de confianza desde tu perfil. La app te mostrará si el aviso fue creado, enviado o falló.'}</Body>
        <PrimaryButton label={processing ? 'Registrando…' : 'Registrar alerta y contactar'} tone="urgent" disabled={processing} onPress={confirmContact} />
      </Panel>
      <Text style={styles.disclaimer}>Si estás inconsciente, confundido o no puedes mantenerte a salvo, no esperes una notificación de la app.</Text>
    </Screen>
  );
}
const styles = StyleSheet.create({ title: { color: colors.textPrimary, fontSize: 21, fontWeight: '700' }, disclaimer: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center' } });
