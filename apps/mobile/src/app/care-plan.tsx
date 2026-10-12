import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, Heading } from '../components/Typography';
import { Panel } from '../components/Panel';
import { PrimaryButton } from '../components/PrimaryButton';
import { useCare } from '../careContext';
import { isCarePlanExpired, validateCarePlanThresholds } from '../domain/glucoseRisk';
import { colors, radii, spacing } from '../theme/tokens';

function fieldValue(value: number | undefined) {
  return value === undefined ? '' : String(value);
}

function parseOptional(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalDate(value: string) {
  if (!value.trim()) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const parsed = new Date(`${value.trim()}T23:59:59`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function dateInput(value?: string) {
  return value ? value.slice(0, 10) : '';
}

export default function CarePlanScreen() {
  const { carePlan, saveCarePlan } = useCare();
  const [urgentLow, setUrgentLow] = useState(fieldValue(carePlan?.urgentLowThreshold));
  const [low, setLow] = useState(fieldValue(carePlan?.lowThreshold));
  const [high, setHigh] = useState(fieldValue(carePlan?.highThreshold));
  const [urgentHigh, setUrgentHigh] = useState(fieldValue(carePlan?.urgentHighThreshold));
  const [instructions, setInstructions] = useState(carePlan?.instructions ?? '');
  const [source, setSource] = useState(carePlan?.source ?? '');
  const [effectiveTo, setEffectiveTo] = useState(dateInput(carePlan?.effectiveTo));
  const [clinicianVerified, setClinicianVerified] = useState(carePlan?.clinicianVerified ?? false);
  const [saving, setSaving] = useState(false);
  const planExpired = isCarePlanExpired(carePlan);

  async function save() {
    const values = {
      urgentLowThreshold: parseOptional(urgentLow),
      lowThreshold: parseOptional(low),
      highThreshold: parseOptional(high),
      urgentHighThreshold: parseOptional(urgentHigh),
    };
    const thresholds = {
      urgentLowThreshold: values.urgentLowThreshold === null ? undefined : values.urgentLowThreshold,
      lowThreshold: values.lowThreshold === null ? undefined : values.lowThreshold,
      highThreshold: values.highThreshold === null ? undefined : values.highThreshold,
      urgentHighThreshold: values.urgentHighThreshold === null ? undefined : values.urgentHighThreshold,
    };
    const parsedEffectiveTo = parseOptionalDate(effectiveTo);
    if (parsedEffectiveTo === null) {
      Alert.alert('Revisa la vigencia', 'Usa una fecha válida en formato AAAA-MM-DD o deja el campo vacío.');
      return;
    }
    if (Object.values(values).some((value) => value === null) || !validateCarePlanThresholds(thresholds)) {
      Alert.alert('Revisa los umbrales', 'Usa números positivos en mg/dL y conserva el orden: urgente bajo, bajo, alto, urgente alto.');
      return;
    }
    setSaving(true);
    try {
      await saveCarePlan({ ...thresholds, instructions: instructions.trim() || undefined, source: source.trim() || undefined, effectiveTo: parsedEffectiveTo, effectiveFrom: carePlan?.effectiveFrom ?? new Date().toISOString(), clinicianVerified });
      router.back();
    } catch {
      Alert.alert('No se pudo guardar', 'Vuelve a intentarlo.');
    } finally { setSaving(false); }
  }

  return (
    <Screen>
      <PrimaryButton label="Volver" tone="quiet" onPress={() => router.back()} />
      <Eyebrow>Plan clínico</Eyebrow>
      <Heading>Umbrales de tu equipo</Heading>
      <Body>Solo escribe valores que te haya entregado tu equipo de salud. GlucoCare no inventa objetivos, diagnostica ni calcula dosis.</Body>
      {planExpired ? <Panel tone="urgent"><Caption>PLAN VENCIDO</Caption><Body>Estas reglas ya no se usan para clasificar nuevas lecturas. Actualiza la fecha solo con indicaciones de tu equipo de salud.</Body></Panel> : null}
      <Panel>
        <Caption>VALORES EN MG/DL (OPCIONALES)</Caption>
        {[
          ['urgentLow', 'Urgente bajo', urgentLow, setUrgentLow],
          ['low', 'Bajo', low, setLow],
          ['high', 'Alto', high, setHigh],
          ['urgentHigh', 'Urgente alto', urgentHigh, setUrgentHigh],
        ].map(([key, label, value, setter]) => <View key={String(key)} style={styles.field}>
          <Caption>{String(label).toUpperCase()}</Caption>
          <TextInput accessibilityLabel={String(label)} value={String(value)} onChangeText={setter as (value: string) => void} keyboardType="decimal-pad" placeholder="Sin configurar" placeholderTextColor={colors.textDisabled} style={styles.input} />
        </View>)}
        <Body>Si dejas todos los valores vacíos, las lecturas quedarán sin clasificación automática.</Body>
      </Panel>
      <Panel>
        <Caption>VIGENCIA Y FUENTE</Caption>
        <TextInput accessibilityLabel="Fuente del plan clínico" value={source} onChangeText={setSource} placeholder="Ej. endocrinología · 2026-10-12" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <TextInput accessibilityLabel="Fecha de revisión del plan clínico" value={effectiveTo} onChangeText={setEffectiveTo} placeholder="Vigente hasta AAAA-MM-DD (opcional)" placeholderTextColor={colors.textDisabled} style={styles.input} />
        <Body>Si el plan vence, la app dejará de clasificar nuevas lecturas con esos umbrales hasta que tu equipo lo revise.</Body>
      </Panel>
      <Panel>
        <Caption>INSTRUCCIONES DE TU EQUIPO</Caption>
        <TextInput accessibilityLabel="Instrucciones del plan clínico" value={instructions} onChangeText={setInstructions} placeholder="Qué hacer si una lectura coincide con tu plan" placeholderTextColor={colors.textDisabled} style={[styles.input, styles.multiline]} multiline />
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: clinicianVerified }} onPress={() => setClinicianVerified((current) => !current)} style={styles.checkRow}>
          <View style={[styles.checkbox, clinicianVerified && styles.checkboxChecked]}><Text style={styles.checkmark}>{clinicianVerified ? '✓' : ''}</Text></View>
          <Body>Confirmo que estos valores e instrucciones provienen de mi equipo de salud.</Body>
        </Pressable>
      </Panel>
      <PrimaryButton label={saving ? 'Guardando…' : 'Guardar plan clínico'} onPress={() => void save()} disabled={saving} />
      <Text style={styles.disclaimer}>Si te sientes muy mal, no esperes una clasificación de la app: llama a emergencias y sigue tu plan de atención.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs, marginBottom: spacing.sm },
  input: { color: colors.textPrimary, backgroundColor: colors.surfaceRaised, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, minHeight: 52, fontSize: 16 },
  multiline: { minHeight: 96, textAlignVertical: 'top', paddingTop: spacing.sm },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, marginTop: spacing.sm },
  checkbox: { width: 28, height: 28, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.amber, borderColor: colors.amber },
  checkmark: { color: colors.canvas, fontSize: 20, fontWeight: '800' },
  disclaimer: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingBottom: spacing.lg },
});
