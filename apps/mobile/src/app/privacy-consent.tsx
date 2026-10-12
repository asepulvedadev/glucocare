import { safeBack } from '../navigation';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../components/Typography';
import { Panel } from '../components/Panel';
import { PrimaryButton } from '../components/PrimaryButton';
import { usePrivacy } from '../privacyContext';
import { POLICY_VERSION } from '../db/privacyRepository';
import { useSafety } from '../safetyContext';
import { useAuth } from '../authContext';
import { cloudApi } from '../cloudApi';
import { colors, spacing } from '../theme/tokens';

function ConsentRow({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={styles.row}>
    <View style={[styles.checkbox, checked && styles.checked]}><Text style={styles.mark}>{checked ? '✓' : ''}</Text></View>
    <Body>{label}</Body>
  </Pressable>;
}

export default function PrivacyConsentScreen() {
  const { consent, saveConsent } = usePrivacy();
  const { trustedContacts, revokeAllTrustedContactConsent } = useSafety();
  const { session } = useAuth();
  const [localDataConsent, setLocalDataConsent] = useState(consent?.localDataConsent ?? false);
  const [cloudSyncConsent, setCloudSyncConsent] = useState(consent?.cloudSyncConsent ?? false);
  const [emergencySharingConsent, setEmergencySharingConsent] = useState(consent?.emergencySharingConsent ?? false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!localDataConsent) {
      Alert.alert('Falta una confirmación', 'Necesitamos tu autorización para guardar registros en este dispositivo.');
      return;
    }
    setSaving(true);
    try {
      const withdrawingContactSharing = consent?.emergencySharingConsent === true && !emergencySharingConsent;
      let remoteRevocationFailures = 0;
      if (withdrawingContactSharing && session) {
        for (const contact of trustedContacts) {
          try { await cloudApi.revokeInvitation(contact.id, session); } catch { remoteRevocationFailures += 1; }
        }
      }
      const revokedContacts = withdrawingContactSharing ? await revokeAllTrustedContactConsent() : 0;
      await saveConsent({ localDataConsent, cloudSyncConsent, emergencySharingConsent });
      const remoteMessage = remoteRevocationFailures > 0
        ? ' Guardamos la revocación local, pero algunos contactos cloud requieren volver a sincronizar.'
        : '';
      Alert.alert('Preferencias guardadas', `${revokedContacts > 0 ? `${revokedContacts} contacto(s) quedaron sin consentimiento. ` : ''}Puedes cambiarlas desde Perfil cuando quieras.${remoteMessage}`);
      safeBack();
    } catch {
      Alert.alert('No se pudo guardar', 'Vuelve a intentarlo.');
    } finally { setSaving(false); }
  }

  return <Screen>
    <PrimaryButton label="Volver" tone="quiet" onPress={() => safeBack()} />
    <Eyebrow>Privacidad y consentimiento</Eyebrow>
    <Heading>Tú decides qué se comparte</Heading>
    <Body>GlucoCare funciona localmente. Estas preferencias controlan los servicios opcionales y pueden cambiarse en cualquier momento.</Body>
    <Panel tone="teal">
      <Caption>AVISO DE PRIVACIDAD · VERSIÓN {consent?.policyVersion ?? POLICY_VERSION}</Caption>
      <Body>La app puede guardar registros de salud, medicamentos, citas, tarjeta de emergencia y contactos de apoyo. Los datos locales se usan para mostrar tu historial, recordatorios, plan de cuidado y exportaciones.</Body>
      <Body>La sincronización cloud es opcional. Los avisos a contactos solo se procesan cuando activas ese permiso y el contacto acepta la invitación. Un contacto no obtiene acceso a tu historial.</Body>
      <Caption>Este resumen técnico no reemplaza el texto legal final, que debe ser revisado y aprobado antes de producción.</Caption>
    </Panel>
    <Panel>
      <Caption>NECESARIO PARA USAR EL REGISTRO</Caption>
      <ConsentRow label="Autorizo guardar mis registros de salud en este dispositivo." checked={localDataConsent} onPress={() => setLocalDataConsent((value) => !value)} />
    </Panel>
    <Panel>
      <Caption>OPCIONAL</Caption>
      <ConsentRow label="Autorizo sincronizar mis registros cifrados con mi cuenta cloud cuando inicie sesión." checked={cloudSyncConsent} onPress={() => setCloudSyncConsent((value) => !value)} />
      <ConsentRow label="Autorizo enviar un aviso a mis contactos consentidos cuando active ayuda." checked={emergencySharingConsent} onPress={() => setEmergencySharingConsent((value) => !value)} />
    </Panel>
    <PrimaryButton label={saving ? 'Guardando…' : 'Guardar preferencias'} onPress={() => void save()} disabled={saving} />
    <Text style={styles.note}>No compartimos valores de glucosa en avisos de emergencia por defecto. La app no garantiza entrega ni sustituye servicios de emergencia.</Text>
  </Screen>;
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: { width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: colors.amber, borderColor: colors.amber },
  mark: { color: colors.canvas, fontSize: 20, fontWeight: '800' },
  note: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingBottom: spacing.lg },
});
