import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Screen } from '../../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../../components/Typography';
import { Panel } from '../../components/Panel';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useSafety } from '../../safetyContext';
import { colors } from '../../theme/tokens';

export default function ProfileScreen() {
  const { emergencyCard, trustedContacts, isLoading } = useSafety();
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
      <PrimaryButton label="Abrir ayuda" tone="urgent" onPress={() => router.push('/help')} />
    </Screen>
  );
}
const styles = StyleSheet.create({ title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' }, contact: { color: colors.textPrimary, fontSize: 16, lineHeight: 24 } });
