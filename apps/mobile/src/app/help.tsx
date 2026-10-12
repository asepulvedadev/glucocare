import { router } from 'expo-router';
import { Alert, Linking, Platform, StyleSheet, Text } from 'react-native';
import { useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../components/Typography';
import { Panel } from '../components/Panel';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/tokens';
import { useSafety } from '../safetyContext';
import { useCare } from '../careContext';
import { medicationRouteLabel } from '../types/care';
import { listHelpEvents, recordHelpEvent, updateHelpEventState, type HelpEvent } from '../db/helpRepository';
import { useAuth } from '../authContext';
import { syncPendingData } from '../sync';
import { getEmergencyAlertDeliveries, queueEmergencyAlert, type EmergencyDelivery } from '../alerts';
import { getEmergencyConfig } from '../config';
import { usePrivacy } from '../privacyContext';
import { newId } from '../ids';
import { selectPrimaryTrustedContact } from '../domain/trustedContactSelection';
import { canQueueRemoteEmergencyAlert } from '../domain/helpFlow';

export default function HelpScreen() {
  const db = useSQLiteContext();
  const { trustedContacts, emergencyCard } = useSafety();
  const { medications } = useCare();
  const { session, isConfigured: isCloudConfigured } = useAuth();
  const { consent } = usePrivacy();
  const consentedContacts = trustedContacts.filter((contact) => contact.consentGranted);
  // Prefer a consented phone contact for the immediate call fallback. An
  // email-only contact may still receive the remote alert, but must not hide a
  // different consented contact who can actually be called.
  const primaryContact = selectPrimaryTrustedContact(trustedContacts);
  const configuredEmergency = getEmergencyConfig(emergencyCard);
  const [processing, setProcessing] = useState(false);
  const [helpEvents, setHelpEvents] = useState<HelpEvent[]>([]);
  const [deliveryStatuses, setDeliveryStatuses] = useState<EmergencyDelivery[]>([]);
  const [deliveryIncidentId, setDeliveryIncidentId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void listHelpEvents(db).then((events) => { if (active) setHelpEvents(events); });
    return () => { active = false; };
  }, [db]);
  async function callEmergency() {
    const url = `tel:${configuredEmergency.number}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else Alert.alert('Llama a emergencias', 'No pudimos abrir el marcador. Usa el número local de emergencias.');
  }

  async function registerAndContact() {
    setProcessing(true);
    try {
      const canRecordLocally = Boolean(consent?.localDataConsent);
      const incidentId = newId();
      if (canRecordLocally) {
        await recordHelpEvent(db, 'user_requested_help', incidentId);
        setHelpEvents(await listHelpEvents(db));
      }
      let remoteQueued = false;
      if (canQueueRemoteEmergencyAlert({
        authenticated: Boolean(session),
        cloudConfigured: isCloudConfigured,
        localDataConsent: Boolean(consent?.localDataConsent),
        cloudSyncConsent: Boolean(consent?.cloudSyncConsent),
        emergencySharingConsent: Boolean(consent?.emergencySharingConsent),
        consentedContactCount: consentedContacts.length,
      }) && session && primaryContact) {
        try {
          await syncPendingData(db, session);
          const channels = [...new Set(consentedContacts.flatMap((contact) => [contact.email ? 'email' as const : null, contact.phone ? 'sms' as const : null].filter((channel): channel is 'email' | 'sms' => channel !== null)))];
          if (channels.length) {
            remoteQueued = Boolean(await queueEmergencyAlert({ incidentId, contactIds: consentedContacts.map((contact) => contact.id), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', channels }));
            if (remoteQueued) {
              setDeliveryIncidentId(incidentId);
              setDeliveryStatuses(await getEmergencyAlertDeliveries(incidentId));
            }
          }
        } catch {
          // Local event and direct-call fallback remain available if the cloud path fails.
        }
      }
      if (!primaryContact?.phone) {
        if (canRecordLocally) {
          await updateHelpEventState(db, incidentId, remoteQueued ? 'remote_queued' : 'queued_local');
          setHelpEvents(await listHelpEvents(db));
        }
        Alert.alert('Ayuda registrada', remoteQueued ? 'El aviso remoto quedó encolado. No hay un número consentido para abrir una llamada.' : canRecordLocally ? 'Guardamos el evento en este dispositivo, pero no hay un número consentido para contactar.' : 'No guardamos el evento porque falta consentimiento local. Usa el número de emergencias si necesitas ayuda inmediata.');
        return;
      }
      const url = `tel:${primaryContact.phone}`;
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        if (canRecordLocally) {
          await updateHelpEventState(db, incidentId, 'call_opened');
          setHelpEvents(await listHelpEvents(db));
        }
        await Linking.openURL(url);
      } else {
        if (canRecordLocally) {
          await updateHelpEventState(db, incidentId, remoteQueued ? 'remote_queued' : 'call_unavailable');
          setHelpEvents(await listHelpEvents(db));
        }
        Alert.alert('No se pudo abrir el marcador', canRecordLocally ? 'Guardamos el evento, pero no pudimos abrir el marcador.' : 'No guardamos el evento porque falta consentimiento local. Usa el número de emergencias configurado.');
      }
    } finally {
      setProcessing(false);
    }
  }

  function confirmContact() {
    const continueAction = () => void registerAndContact();
    if (!consent?.localDataConsent) {
      Alert.alert('Consentimiento pendiente', 'Puedes llamar a tu contacto de apoyo sin guardar el evento en este dispositivo. Si estás en peligro inmediato, llama a emergencias.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Continuar con la llamada', onPress: continueAction },
      ]);
      return;
    }
    if (!consent.emergencySharingConsent) {
      Alert.alert('Aviso remoto desactivado', 'Puedes registrar el evento local y llamar a tu contacto. No se enviará un aviso remoto hasta activar ese consentimiento.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Registrar y llamar', onPress: continueAction },
      ]);
      return;
    }
    const confirm = continueAction;
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
    <Screen showHelp={false}>
      <PrimaryButton label="Volver" tone="quiet" onPress={() => router.back()} />
      <Eyebrow>Ayuda inmediata</Eyebrow>
      <Heading>Si te sientes muy mal</Heading>
      <Body>Busca ayuda humana ahora. GlucoCare no puede diagnosticarte ni garantizar que una alerta llegue.</Body>
      <Panel tone="urgent">
        <Caption>EMERGENCIA</Caption>
        <Text style={styles.title}>Llama al número local de emergencias</Text>
        <Body>En {configuredEmergency.region}, el número configurado es {configuredEmergency.number}. Si estás en otro lugar, usa el número local de emergencias.</Body>
        <PrimaryButton label="Llamar a emergencias" tone="urgent" onPress={() => void callEmergency()} />
      </Panel>
      <Panel>
        <Caption>TARJETA OFFLINE</Caption>
        {emergencyCard ? <><Text style={styles.title}>{emergencyCard.fullName}</Text>{emergencyCard.diabetesType ? <Body>Tipo: {emergencyCard.diabetesType}</Body> : null}{emergencyCard.insulinUse && emergencyCard.insulinUse !== 'unknown' ? <Body>Usa insulina: {emergencyCard.insulinUse === 'yes' ? 'sí' : 'no'}</Body> : null}{emergencyCard.allergies ? <Body>Alergias: {emergencyCard.allergies}</Body> : null}{emergencyCard.criticalConditions ? <Body>Condiciones críticas: {emergencyCard.criticalConditions}</Body> : null}{emergencyCard.careFacility ? <Body>Lugar habitual: {emergencyCard.careFacility}</Body> : null}{emergencyCard.careProvider ? <Body>Contacto de atención: {emergencyCard.careProvider}</Body> : null}{emergencyCard.insurer ? <Body>EPS/asegurador: {emergencyCard.insurer}</Body> : null}{emergencyCard.policyNumber ? <Body>Afiliación/póliza: {emergencyCard.policyNumber}</Body> : null}{emergencyCard.emergencyNumber ? <Body>Emergencias ({emergencyCard.emergencyRegion ?? 'región configurada'}): {emergencyCard.emergencyNumber}</Body> : null}{medications.filter((medication) => medication.enabled).length > 0 ? <><Caption>MEDICAMENTOS REGISTRADOS</Caption>{medications.filter((medication) => medication.enabled).map((medication) => <Body key={medication.id}>{medication.name}: {medication.doseText} · {medicationRouteLabel[medication.route]}</Body>)}<Caption>Esta lista es informativa y puede estar desactualizada.</Caption></> : null}</> : <Body>Configura una tarjeta para que esta información esté disponible sin cuenta ni conexión.</Body>}
        <PrimaryButton label={emergencyCard ? 'Editar tarjeta' : 'Configurar tarjeta'} tone="quiet" onPress={() => router.push('/emergency-card')} />
      </Panel>
      <Panel>
        <Caption>CONTACTO DE APOYO</Caption>
        <Text style={styles.title}>{primaryContact ? primaryContact.name : 'No hay contacto configurado'}</Text>
        {primaryContact?.phone ? <Body>Teléfono: {primaryContact.phone}</Body> : null}
        {primaryContact?.email ? <Body>Correo: {primaryContact.email}</Body> : null}
        <Body>{primaryContact ? 'Puedes registrar la alerta y abrir una llamada. La app no puede confirmar que la persona conteste.' : 'Configura una persona de confianza desde tu perfil. La app te mostrará si el aviso fue creado, enviado o falló.'}</Body>
        <PrimaryButton label={processing ? 'Registrando…' : 'Registrar alerta y contactar'} tone="urgent" disabled={processing} onPress={confirmContact} />
      </Panel>
      <Panel>
        <Caption>HISTORIAL DE AYUDA</Caption>
        {helpEvents.length === 0 ? <Body>Aún no hay eventos registrados.</Body> : helpEvents.slice(0, 5).map((event) => (
          <Text key={event.id} style={styles.event}>{new Date(event.createdAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })} · {event.contactState === 'queued_local' ? 'Guardado en este dispositivo' : event.contactState === 'remote_queued' ? 'Aviso remoto encolado' : event.contactState === 'call_opened' ? 'Marcador abierto' : event.contactState === 'call_unavailable' ? 'Marcador no disponible' : event.contactState}</Text>
        ))}
        <Body>Este historial solo indica que se registró una solicitud; no confirma que alguien haya respondido.</Body>
      </Panel>
      {deliveryStatuses.length > 0 ? <Panel>
        <Caption>ESTADO DEL AVISO REMOTO</Caption>
        {deliveryStatuses.map((delivery) => <Text key={delivery.id} style={styles.event}>{delivery.channel}: {delivery.status === 'queued' ? 'Encolado' : delivery.status === 'provider_accepted' ? 'Proveedor aceptó' : delivery.status === 'delivered' ? 'Entregado' : delivery.status === 'failed' ? 'Falló' : delivery.status === 'unknown' ? 'Estado desconocido' : delivery.status}{delivery.failureCode ? ` · ${delivery.failureCode}` : ''}</Text>)}
        <Body>Estos estados dependen del proveedor y no sustituyen una llamada a emergencias.</Body>
        {deliveryIncidentId ? <PrimaryButton label="Actualizar estado" tone="quiet" onPress={() => void (async () => {
          try { setDeliveryStatuses(await getEmergencyAlertDeliveries(deliveryIncidentId)); }
          catch { Alert.alert('Estado no disponible', 'No se pudo consultar el proveedor. El aviso conserva su último estado conocido.'); }
        })()} /> : null}
      </Panel> : null}
      <Text style={styles.disclaimer}>Si estás inconsciente, confundido o no puedes mantenerte a salvo, no esperes una notificación de la app.</Text>
    </Screen>
  );
}
const styles = StyleSheet.create({ title: { color: colors.textPrimary, fontSize: 21, fontWeight: '700' }, event: { color: colors.textPrimary, fontSize: 15, lineHeight: 22, marginBottom: 8 }, disclaimer: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center' } });
