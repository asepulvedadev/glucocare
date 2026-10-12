import { StyleSheet, Text, type TextProps } from 'react-native';
import { colors } from '../theme/tokens';
import { useAccessibility } from '../accessibilityContext';

export function Eyebrow(props: TextProps) { return <Text {...props} style={[styles.eyebrow, props.style]} />; }
export function Heading(props: TextProps) { const { preferences } = useAccessibility(); return <Text {...props} style={[styles.heading, preferences.largeText && styles.headingLarge, props.style]} />; }
export function Body(props: TextProps) { const { preferences } = useAccessibility(); return <Text {...props} style={[styles.body, preferences.highContrast && styles.highContrast, preferences.largeText && styles.bodyLarge, props.style]} />; }
export function Caption(props: TextProps) { const { preferences } = useAccessibility(); return <Text {...props} style={[styles.caption, preferences.highContrast && styles.highContrast, preferences.largeText && styles.captionLarge, props.style]} />; }

const styles = StyleSheet.create({
  eyebrow: { color: colors.amber, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
  heading: { color: colors.textPrimary, fontSize: 30, fontWeight: '700', lineHeight: 36 },
  headingLarge: { fontSize: 36, lineHeight: 44 },
  body: { color: colors.textSecondary, fontSize: 16, lineHeight: 24 },
  bodyLarge: { fontSize: 19, lineHeight: 29 },
  caption: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  captionLarge: { fontSize: 16, lineHeight: 23 },
  highContrast: { color: colors.textPrimary },
});
