import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../theme/tokens';

export function Panel({ children, tone = 'default' }: PropsWithChildren<{ tone?: 'default' | 'urgent' | 'teal' }>) {
  return <View style={[styles.panel, tone === 'urgent' && styles.urgent, tone === 'teal' && styles.teal]}>{children}</View>;
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  urgent: { borderColor: colors.urgent, backgroundColor: '#211516' },
  teal: { borderColor: colors.teal, backgroundColor: '#10231F' },
});
