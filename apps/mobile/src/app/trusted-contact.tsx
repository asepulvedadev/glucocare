import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../components/Typography';
import { Panel } from '../components/Panel';
import { PrimaryButton } from '../components/PrimaryButton';
import { useSafety } from '../safetyContext';
import type { TrustedContact } from '../types/safety';
import { colors, radii, spacing } from '../theme/tokens';

export default function TrustedContactScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { trustedContacts, isLoading } = useSafety();
  const existing = typeof id === 'string' ? trustedContacts.find((item) => item.id === id) : undefined;
  if (id && !existing && isLoading) return <Screen><Body>Cargando contacto…</Body></Screen>;
  if (id && !existing) return <Screen><PrimaryButton label="Volver" tone="quiet" onPress={() => router.back()} /><Body>No encontramos ese contacto en este dispositivo.</Body></Screen>;
  return <TrustedContactForm existing={existing} />;
}

function TrustedContactForm({ existing }: { existing?: TrustedContact }) {
  const { addTrustedContact, updateTrustedContact } = useSafety();
  const [name, setName] = useState(existing?.name ?? '');
  const [relationship, setRelationship] = useState(existing?.relationship ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [consentGranted, setConsentGranted] = useState(existing?.consentGranted ?? false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || (!phone.trim() && !email.trim()) || !consentGranted) {
      Alert.alert('Completa el consentimiento', 'Escribe el nombre, un teléfono o correo y confirma que esta persona aceptó ser tu contacto de apoyo.');
      return;
    }
    setSaving(true);
    try {
      const input = { name: name.trim(), relationship: relationship.trim() || undefined, phone: phone.trim() || undefined, email: email.trim() || undefined, consentGranted };
      if (existing) {
        await updateTrustedContact(existing.id, input);
        Alert.alert('Contacto actualizado', 'Por seguridad, el consentimiento anterior se reinició. Confirma nuevamente antes de enviar avisos.');
      } else {
        await addTrustedContact(input);
      }
      router.back();
    } catch {
      Alert.alert('No se pudo guardar', 'Vuelve a intentarlo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <PrimaryButton label="Volver" tone="quiet" onPress={() => router.back()} />
      <Eyebrow>{existing ? 'Editar persona de apoyo' : 'Persona de apoyo'}</Eyebrow>
      <Heading>{existing ? 'Actualiza sus datos' : 'Elige a quién avisar'}</Heading>
      <Body>Solo se usará cuando tú lo pidas. La app no promete que un aviso llegue ni reemplaza emergencias.</Body>
      <Panel>
        <Caption>NOMBRE</Caption>
        <TextInput accessibilityLabel="Nombre de la persona de apoyo" value={name} onChangeText={setName} placeholder="Nombre" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <Caption>RELACIÓN</Caption>
        <TextInput accessibilityLabel="Relación" value={relationship} onChangeText={setRelationship} placeholder="Ej. Hermana" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <Caption>CONTACTO</Caption>
        <TextInput accessibilityLabel="Teléfono" value={phone} onChangeText={setPhone} placeholder="Teléfono" placeholderTextColor={colors.textDisabled} keyboardType="phone-pad" style={styles.input} />
        <TextInput accessibilityLabel="Correo electrónico" value={email} onChangeText={setEmail} placeholder="Correo electrónico" placeholderTextColor={colors.textDisabled} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
      </Panel>
      <Panel>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consentGranted }} onPress={() => setConsentGranted((current) => !current)} style={styles.consentRow}>
          <View style={[styles.checkbox, consentGranted && styles.checkboxSelected]}><Text style={styles.checkmark}>{consentGranted ? '✓' : ''}</Text></View>
          <Body>Esta persona aceptó ser mi contacto de apoyo.</Body>
        </Pressable>
      </Panel>
      <PrimaryButton label={saving ? 'Guardando…' : existing ? 'Actualizar contacto' : 'Guardar contacto'} onPress={() => void save()} disabled={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { color: colors.textPrimary, backgroundColor: colors.surfaceRaised, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, minHeight: 52, fontSize: 16 },
  consentRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: { width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: colors.textSecondary, alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { borderColor: colors.amber, backgroundColor: colors.amber },
  checkmark: { color: colors.canvas, fontSize: 20, fontWeight: '800' },
});
