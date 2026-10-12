import { StyleSheet, Text, type TextProps } from 'react-native';
import { colors } from '../theme/tokens';

export function Eyebrow(props: TextProps) { return <Text {...props} style={[styles.eyebrow, props.style]} />; }
export function Heading(props: TextProps) { return <Text {...props} style={[styles.heading, props.style]} />; }
export function Body(props: TextProps) { return <Text {...props} style={[styles.body, props.style]} />; }
export function Caption(props: TextProps) { return <Text {...props} style={[styles.caption, props.style]} />; }

const styles = StyleSheet.create({
  eyebrow: { color: colors.amber, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
  heading: { color: colors.textPrimary, fontSize: 30, fontWeight: '700', lineHeight: 36 },
  body: { color: colors.textSecondary, fontSize: 16, lineHeight: 24 },
  caption: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
});
