import { Pressable, StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radii, spacing } from '../theme/tokens';
import { useAccessibility } from '../accessibilityContext';

export function PrimaryButton({ label, onPress, tone = 'primary', disabled = false }: { label: string; onPress: () => void; tone?: 'primary' | 'urgent' | 'quiet'; disabled?: boolean }) {
  const { preferences } = useAccessibility();
  function press() {
    if (preferences.touchFeedback) void Haptics.selectionAsync().catch(() => undefined);
    onPress();
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={press}
      disabled={disabled}
      style={({ pressed }) => [styles.base, tone === 'urgent' && styles.urgent, tone === 'quiet' && styles.quiet, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={[styles.label, tone === 'quiet' && styles.quietLabel, preferences.largeText && styles.labelLarge, preferences.highContrast && styles.highContrastLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 52, borderRadius: radii.sm, backgroundColor: colors.amber, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  urgent: { backgroundColor: colors.urgent },
  quiet: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  label: { color: colors.canvas, fontSize: 16, fontWeight: '700' },
  quietLabel: { color: colors.textPrimary },
  labelLarge: { fontSize: 19, lineHeight: 25 },
  highContrastLabel: { fontWeight: '800' },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.45 },
});
