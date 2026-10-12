import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Alert, Platform, StyleSheet, Text } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Screen } from '../../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../../components/Typography';
import { Panel } from '../../components/Panel';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useSafety } from '../../safetyContext';
import { useGlucose } from '../../context';
import { useCare } from '../../careContext';
import { useAuth } from '../../authContext';
import { deleteAllLocalData, printClinicianReport, restoreFromExportContent, shareExport } from '../../dataLifecycle';
import { colors } from '../../theme/tokens';
import { syncPendingData } from '../../sync';
import { useAccessibility } from '../../accessibilityContext';
import { listOpenSyncConflicts, type SyncConflict } from '../../db/syncConflictRepository';
import { applyRemoteSyncConflict } from '../../db/syncConflictResolution';
import { usePrivacy } from '../../privacyContext';
import { supabase } from '../../supabase';
import { openNotificationSettings, sendTestNotification } from '../../notifications';

type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';

const invitationStatusLabel: Record<InvitationStatus, string> = {
  pending: 'Invitación pendiente de aceptación',
  accepted: 'Invitación aceptada',
  declined: 'Invitación rechazada',
  revoked: 'Invitación revocada',
  expired: 'Invitación vencida',
};

async function fetchInvitationStatuses(session: Session | null) {
  if (!session || !supabase) return {} as Record<string, InvitationStatus>;
  const { data } = await supabase
    .from('contact_invitations')
    .select('contact_id,status,created_at')
    .order('created_at', { ascending: false });
  const next: Record<string, InvitationStatus> = {};
  for (const invitation of data ?? []) {
    if (!next[invitation.contact_id]) next[invitation.contact_id] = invitation.status as InvitationStatus;
  }
  return next;
}

export default function ProfileScreen() {
  const { emergencyCard, trustedContacts, isLoading, refresh: refreshSafety, grantTrustedContactConsent, sendTrustedContactInvitation, revokeTrustedContact } = useSafety();
  const db = useSQLiteContext();
  const { refresh: refreshGlucose } = useGlucose();
  const { refresh: refreshCare } = useCare();
  const { session, isConfigured: isCloudConfigured } = useAuth();
  const { preferences, setPreference, refresh: refreshAccessibility } = useAccessibility();
  const { consent, refresh: refreshPrivacy } = usePrivacy();
  const [syncing, setSyncing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [invitingContactId, setInvitingContactId] = useState<string | null>(null);
  const [syncConflicts, setSyncConflicts] = useState<SyncConflict[]>([]);
  const [invitationStatuses, setInvitationStatuses] = useState<Record<string, InvitationStatus>>({});

  const refreshInvitationStatuses = useCallback(async () => {
    setInvitationStatuses(await fetchInvitationStatuses(session));
  }, [session]);

  useEffect(() => {
    let active = true;
    void fetchInvitationStatuses(session).then((next) => { if (active) setInvitationStatuses(next); });
    return () => { active = false; };
  }, [session]);

  const refreshSyncConflicts = useCallback(async () => {
    setSyncConflicts(await listOpenSyncConflicts(db));
  }, [db]);

  async function syncNow() {
    if (!session) return;
    setSyncing(true);
    try {
      const result = await syncPendingData(db, session);
      await Promise.all([refreshGlucose(), refreshCare(), refreshSafety(), refreshSyncConflicts(), refreshInvitationStatuses()]);
      if (result.state === 'disabled') Alert.alert('Sincronización no disponible', 'Este build no tiene configurada la conexión cloud.');
      else if (result.state === 'consent_required') Alert.alert('Consentimiento necesario', 'Activa la sincronización cloud desde Privacidad y consentimiento antes de enviar registros.');
      else if (result.state === 'failed') Alert.alert('Sincronización parcial', `Subidos: ${result.uploaded}. Descargados: ${result.downloaded}. Pendientes con error: ${result.failed}. Conservamos la copia local.`);
      else Alert.alert('Sincronización lista', `Subidos: ${result.uploaded}. Descargados: ${result.downloaded}.`);
    } catch { Alert.alert('Sincronización no disponible', 'No se pudo conectar. Tu información local permanece intacta.'); }
    finally { setSyncing(false); }
  }

  function requestRemoteConflict(conflict: SyncConflict) {
    Alert.alert('Usar versión cloud', 'Esto reemplazará el registro local pendiente con la versión descargada y descartará los eventos locales pendientes de este registro. ¿Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Usar cloud', style: 'destructive', onPress: () => void (async () => {
        setSyncing(true);
        try {
          await applyRemoteSyncConflict(db, conflict);
          await Promise.all([refreshGlucose(), refreshCare(), refreshSafety(), refreshSyncConflicts(), refreshInvitationStatuses()]);
          Alert.alert('Conflicto resuelto', 'Aplicamos la versión cloud.');
        } catch { Alert.alert('No se pudo resolver', 'Conservamos tu copia local. Vuelve a sincronizar antes de elegir otra versión.'); }
        finally { setSyncing(false); }
      })() },
    ]);
  }

  async function exportData(format: 'json' | 'csv') {
    try {
      const result = await shareExport(db, format);
      Alert.alert(result.shared ? 'Exportación lista' : 'Exportación preparada', result.shared ? `Se creó ${result.filename}.` : `No se pudo abrir el menú de compartir. Archivo: ${result.filename}`);
    } catch { Alert.alert('No se pudo exportar', 'Vuelve a intentarlo.'); }
  }

  async function exportClinicianReport() {
    setReporting(true);
    try {
      const result = await printClinicianReport(db);
      Alert.alert(result.shared ? 'Reporte listo' : 'Reporte preparado', result.shared ? 'Puedes imprimirlo o compartirlo con tu equipo de salud.' : 'El reporte se abrió en la vista de impresión.');
    } catch { Alert.alert('No se pudo preparar el reporte', 'Vuelve a intentarlo.'); }
    finally { setReporting(false); }
  }

  async function testNotifications() {
    try {
      const state = await sendTestNotification();
      if (state === 'granted') Alert.alert('Prueba enviada', 'Si no aparece en unos segundos, revisa el modo No molestar y los ajustes de notificaciones del dispositivo.');
      else if (state === 'permission_denied') Alert.alert('Permiso desactivado', 'Activa las notificaciones para probar los recordatorios.', [{ text: 'Ahora no', style: 'cancel' }, { text: 'Abrir ajustes', onPress: () => void openNotificationSettings() }]);
      else Alert.alert('No disponible', 'Las notificaciones locales requieren Android o iOS.');
    } catch { Alert.alert('No se pudo enviar la prueba', 'Vuelve a intentarlo desde un dispositivo Android o iOS.'); }
  }

  async function readPickedJson(asset: DocumentPicker.DocumentPickerAsset) {
    if (Platform.OS === 'web' && asset.file) return asset.file.text();
    return new File(asset.uri).text();
  }

  async function importData() {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const confirmRestore = async () => {
      try {
        const content = await readPickedJson(asset);
        const restored = await restoreFromExportContent(db, content);
        await Promise.all([refreshGlucose(), refreshCare(), refreshSafety(), refreshAccessibility(), refreshPrivacy()]);
        Alert.alert('Restauración lista', `${restored.imported} registros fueron restaurados localmente.${restored.contactsRequireConsent ? ' Los contactos importados requieren confirmar el consentimiento antes de usarlos.' : ''}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'El archivo no pudo restaurarse.';
        Alert.alert('No se pudo restaurar', message);
      }
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.('Esto reemplazará todos los datos locales. El consentimiento y la sincronización no se restauran automáticamente. ¿Continuar?')) await confirmRestore();
      return;
    }
    Alert.alert('Reemplazar datos locales', 'Esto reemplazará todos los datos locales. El consentimiento y la sincronización no se restauran automáticamente.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Restaurar', style: 'destructive', onPress: () => void confirmRestore() },
    ]);
  }

  function requestRevokeContact(contactId: string, name: string) {
    Alert.alert('Revocar contacto', `Dejar de compartir avisos con ${name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Revocar', style: 'destructive', onPress: () => void (async () => {
        try { await revokeTrustedContact(contactId); Alert.alert('Contacto revocado', 'No se enviarán nuevos avisos a esta persona.'); }
        catch { Alert.alert('No se pudo revocar', 'Vuelve a intentarlo.'); }
      })() },
    ]);
  }

  function requestGrantContact(contactId: string, name: string) {
    Alert.alert('Confirmar consentimiento', `Confirma que ${name} aceptó seguir recibiendo avisos de ayuda.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: () => void (async () => {
        try { await grantTrustedContactConsent(contactId); Alert.alert('Consentimiento activo', 'Este contacto puede recibir nuevos avisos cuando uses la ayuda.'); }
        catch { Alert.alert('No se pudo actualizar', 'Vuelve a intentarlo.'); }
      })() },
    ]);
  }

  function requestInvite(contact: typeof trustedContacts[number]) {
    if (!session) {
      Alert.alert('Conecta una cuenta', 'Necesitas una cuenta cloud para enviar una invitación verificada.');
      return;
    }
    const channels = [
      ...(contact.email ? [{ label: 'Correo', channel: 'email' as const }] : []),
      ...(contact.phone ? [{ label: 'SMS', channel: 'sms' as const }] : []),
    ];
    Alert.alert('Enviar invitación', `La invitación para ${contact.name} expirará en 48 horas y no dará acceso a tu historial.`, [
      { text: 'Cancelar', style: 'cancel' },
      ...channels.map(({ label, channel }) => ({ text: label, onPress: () => void (async () => {
        setInvitingContactId(contact.id);
        try {
          await sendTrustedContactInvitation(contact.id, channel);
          setInvitationStatuses((current) => ({ ...current, [contact.id]: 'pending' }));
          Alert.alert('Invitación enviada', `${contact.name} debe aceptar antes de recibir avisos.`);
        } catch { Alert.alert('No se pudo enviar', 'El proveedor de correo/SMS puede no estar configurado. Tu contacto sigue guardado localmente.'); }
        finally { setInvitingContactId(null); }
      })() })),
    ]);
  }

  function requestDelete() {
    Alert.alert('Borrar datos locales', 'Esta acción elimina lecturas, planes, tomas, medicamentos, citas, contactos, tarjeta y eventos de ayuda de este dispositivo.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar todo', style: 'destructive', onPress: () => void (async () => { try { await deleteAllLocalData(db); await Promise.all([refreshGlucose(), refreshCare(), refreshSafety()]); Alert.alert('Datos eliminados', 'La información local fue eliminada.'); } catch { Alert.alert('No se pudo borrar', 'Vuelve a intentarlo.'); } })() },
    ]);
  }
  return (
    <Screen>
      <Eyebrow>Perfil</Eyebrow>
      <Heading>Tu información</Heading>
      <Body>Completa solo lo necesario y decide qué compartir con una persona de confianza.</Body>
      <Panel tone="urgent">
        <Caption>TARJETA DE EMERGENCIA</Caption>
        {isLoading ? <Body>Cargando…</Body> : emergencyCard ? <><Text style={styles.title}>{emergencyCard.fullName}</Text><Body>Actualizada {new Date(emergencyCard.updatedAt).toLocaleDateString('es-CO')}</Body></> : <><Text style={styles.title}>Aún no está configurada</Text><Body>Incluye información útil para una emergencia y se guarda de forma local.</Body></>}
        <PrimaryButton label={emergencyCard ? 'Editar tarjeta' : 'Configurar tarjeta'} tone="quiet" onPress={() => router.push('/emergency-card')} />
      </Panel>
      <Panel>
        <Caption>PERSONA DE APOYO</Caption>
        {trustedContacts.length === 0 ? <><Text style={styles.title}>Sin contacto registrado</Text><Body>Agrega un número o correo solo después de dar tu consentimiento explícito.</Body></> : trustedContacts.map((contact) => {
          const invitationStatus = invitationStatuses[contact.id];
          const canSendInvitation = invitationStatus !== 'pending' && invitationStatus !== 'accepted';
          return <Panel key={contact.id}><Text style={styles.contact}>{contact.name}{contact.phone ? ` · ${contact.phone}` : ''}{contact.consentGranted ? ' · Consentimiento activo' : ' · Consentimiento pendiente'}</Text>{invitationStatus ? <Body>{invitationStatusLabel[invitationStatus]}</Body> : null}{contact.consentGranted ? <PrimaryButton label="Revocar consentimiento" tone="quiet" onPress={() => requestRevokeContact(contact.id, contact.name)} /> : <PrimaryButton label="Confirmar consentimiento" tone="quiet" onPress={() => requestGrantContact(contact.id, contact.name)} />}{contact.consentGranted && canSendInvitation && session && (contact.email || contact.phone) ? <PrimaryButton label={invitingContactId === contact.id ? 'Enviando invitación…' : 'Enviar invitación verificada'} tone="quiet" disabled={invitingContactId === contact.id} onPress={() => requestInvite(contact)} /> : null}</Panel>;
        })}
        <PrimaryButton label="Agregar contacto" tone="quiet" onPress={() => router.push('/trusted-contact')} />
      </Panel>
      <Panel>
        <Caption>ACCESIBILIDAD</Caption>
        <Body>Elige una lectura más cómoda. Estos ajustes se guardan solo en este dispositivo.</Body>
        <PrimaryButton label={`Texto grande: ${preferences.largeText ? 'activado' : 'desactivado'}`} tone="quiet" onPress={() => void setPreference('largeText', !preferences.largeText)} />
        <PrimaryButton label={`Alto contraste: ${preferences.highContrast ? 'activado' : 'desactivado'}`} tone="quiet" onPress={() => void setPreference('highContrast', !preferences.highContrast)} />
        <PrimaryButton label={`Modo simple: ${preferences.simpleMode ? 'activado' : 'desactivado'}`} tone="quiet" onPress={() => void setPreference('simpleMode', !preferences.simpleMode)} />
        <PrimaryButton label={`Reducir movimiento: ${preferences.reduceMotion ? 'activado' : 'desactivado'}`} tone="quiet" onPress={() => void setPreference('reduceMotion', !preferences.reduceMotion)} />
      </Panel>
      <Panel>
        <Caption>RECORDATORIOS</Caption>
        <Body>Prueba una notificación genérica sin datos clínicos para confirmar que el dispositivo puede mostrar avisos.</Body>
        <PrimaryButton label="Probar notificaciones" tone="quiet" onPress={() => void testNotifications()} />
      </Panel>
      <Panel>
        <Caption>PRIVACIDAD Y CONSENTIMIENTO</Caption>
        <Body>{consent?.localDataConsent ? 'Registro local autorizado.' : 'Falta confirmar el almacenamiento local.'} {consent?.cloudSyncConsent ? 'Sincronización cloud autorizada.' : 'Sincronización cloud desactivada.'} {consent?.emergencySharingConsent ? 'Avisos de ayuda autorizados.' : 'Avisos de ayuda desactivados.'}</Body>
        <PrimaryButton label="Revisar preferencias" tone="quiet" onPress={() => router.push('/privacy-consent')} />
      </Panel>
      <Panel>
        <Caption>SINCRONIZACIÓN OPCIONAL</Caption>
        {session ? <><Text style={styles.title}>Cuenta conectada</Text><Body>{session.user.email ?? 'Sesión activa'} · tus registros locales pueden sincronizarse.</Body></> : <><Text style={styles.title}>Solo este dispositivo</Text><Body>{isCloudConfigured ? 'Conecta una cuenta para continuar entre dispositivos.' : 'La nube aún no está configurada en este entorno. Tus datos locales siguen disponibles.'}</Body></>}
        <PrimaryButton label={session ? 'Administrar cuenta' : 'Conectar cuenta'} tone="quiet" onPress={() => router.push('/auth')} />
        {session ? <PrimaryButton label={syncing ? 'Sincronizando…' : 'Sincronizar ahora'} tone="quiet" disabled={syncing} onPress={() => void syncNow()} /> : null}
      </Panel>
      {syncConflicts.length > 0 ? <Panel tone="urgent">
        <Caption>CAMBIOS EN DOS DISPOSITIVOS</Caption>
        <Text style={styles.title}>{syncConflicts.length} cambio{syncConflicts.length === 1 ? '' : 's'} pendiente{syncConflicts.length === 1 ? '' : 's'}</Text>
        <Body>Conservamos tu cambio local para no sobrescribir información sin tu permiso. La aplicación intentará enviarlo de nuevo cuando haya conexión.</Body>
        {syncConflicts.slice(0, 3).map((conflict) => <Panel key={conflict.id}><Text style={styles.contact}>{conflict.entityType} · detectado {new Date(conflict.detectedAt).toLocaleString('es-CO')}</Text><PrimaryButton label="Usar versión cloud" tone="quiet" disabled={syncing} onPress={() => requestRemoteConflict(conflict)} /></Panel>)}
      </Panel> : null}
      <Panel>
        <Caption>TUS DATOS</Caption>
        <Body>Exporta una copia legible, restaura un respaldo o elimina la información guardada en este dispositivo.</Body>
        <PrimaryButton label="Exportar JSON" tone="quiet" onPress={() => void exportData('json')} />
        <PrimaryButton label="Exportar lecturas CSV" tone="quiet" onPress={() => void exportData('csv')} />
        <PrimaryButton label={reporting ? 'Preparando reporte…' : 'Imprimir reporte para mi médico'} tone="quiet" disabled={reporting} onPress={() => void exportClinicianReport()} />
        <PrimaryButton label="Restaurar respaldo JSON" tone="quiet" onPress={() => void importData()} />
        <PrimaryButton label="Borrar datos locales" tone="urgent" onPress={requestDelete} />
      </Panel>
      <PrimaryButton label="Abrir ayuda" tone="urgent" onPress={() => router.push('/help')} />
    </Screen>
  );
}
const styles = StyleSheet.create({ title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' }, contact: { color: colors.textPrimary, fontSize: 16, lineHeight: 24 } });
