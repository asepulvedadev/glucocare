import { router } from 'expo-router';
import { Alert, StyleSheet, Text } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Screen } from '../../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../../components/Typography';
import { Panel } from '../../components/Panel';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useSafety } from '../../safetyContext';
import { useGlucose } from '../../context';
import { useCare } from '../../careContext';
import { deleteAllLocalData, shareExport } from '../../dataLifecycle';
import { colors } from '../../theme/tokens';

export default function ProfileScreen() {
  const { emergencyCard, trustedContacts, isLoading, refresh: refreshSafety } = useSafety();
  const db = useSQLiteContext();
  const { refresh: refreshGlucose } = useGlucose();
  const { refresh: refreshCare } = useCare();

  async function exportData(format: 'json' | 'csv') {
    try {
      const result = await shareExport(db, format);
      Alert.alert(result.shared ? 'Exportación lista' : 'Exportación preparada', result.shared ? `Se creó ${result.filename}.` : `No se pudo abrir el menú de compartir. Archivo: ${result.filename}`);
    } catch { Alert.alert('No se pudo exportar', 'Vuelve a intentarlo.'); }
  }

  function requestDelete() {
    Alert.alert('Borrar datos locales', 'Esta acción elimina lecturas, medicamentos, citas, contactos, tarjeta y eventos de ayuda de este dispositivo.', [
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
        {trustedContacts.length === 0 ? <><Text style={styles.title}>Sin contacto registrado</Text><Body>Agrega un número o correo solo después de dar tu consentimiento explícito.</Body></> : trustedContacts.map((contact) => <Text key={contact.id} style={styles.contact}>{contact.name}{contact.phone ? ` · ${contact.phone}` : ''}{contact.consentGranted ? ' · Consentimiento activo' : ' · Consentimiento pendiente'}</Text>)}
        <PrimaryButton label="Agregar contacto" tone="quiet" onPress={() => router.push('/trusted-contact')} />
      </Panel>
      <Panel>
        <Caption>TUS DATOS</Caption>
        <Body>Exporta una copia legible o elimina la información guardada en este dispositivo.</Body>
        <PrimaryButton label="Exportar JSON" tone="quiet" onPress={() => void exportData('json')} />
        <PrimaryButton label="Exportar lecturas CSV" tone="quiet" onPress={() => void exportData('csv')} />
        <PrimaryButton label="Borrar datos locales" tone="urgent" onPress={requestDelete} />
      </Panel>
      <PrimaryButton label="Abrir ayuda" tone="urgent" onPress={() => router.push('/help')} />
    </Screen>
  );
}
const styles = StyleSheet.create({ title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' }, contact: { color: colors.textPrimary, fontSize: 16, lineHeight: 24 } });
