import { Component, PropsWithChildren } from 'react';
import { Linking, Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radii, spacing } from '../theme/tokens';

type State = { failed: boolean };

/** Keeps a rendering failure from hiding the emergency route or exposing error details. */
export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch() {
    // Deliberately avoid logging health data or error payloads. Operational
    // diagnostics belong in a redacted, consented native integration later.
  }

  reset = () => this.setState({ failed: false });

  openEmergencyHelp = () => {
    try { router.replace('/help'); } catch { /* Keep the direct dial action available if routing is also unavailable. */ }
  };

  callEmergency = async () => {
    const number = process.env.EXPO_PUBLIC_EMERGENCY_NUMBER || '123';
    if (Platform.OS === 'web') return;
    const url = `tel:${number}`;
    if (await Linking.canOpenURL(url)) await Linking.openURL(url);
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} accessible accessibilityLiveRegion="assertive">
          <Text style={styles.eyebrow}>GLUCOCARE</Text>
          <Text style={styles.heading}>La pantalla necesita reiniciarse</Text>
          <Text style={styles.body}>Tus datos locales no se borraron. Intenta volver a abrir la pantalla o usa la ayuda de emergencia si te sientes mal.</Text>
          <Pressable accessibilityRole="button" onPress={this.reset} style={styles.primary}><Text style={styles.primaryLabel}>Reintentar</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={this.openEmergencyHelp} style={styles.secondary}><Text style={styles.secondaryLabel}>Abrir ayuda de emergencia</Text></Pressable>
          {Platform.OS !== 'web' ? <Pressable accessibilityRole="button" onPress={() => void this.callEmergency()} style={styles.urgent}><Text style={styles.primaryLabel}>Llamar a emergencias</Text></Pressable> : null}
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  content: { flex: 1, justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  eyebrow: { color: colors.amber, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  heading: { color: colors.textPrimary, fontSize: 30, lineHeight: 36, fontWeight: '800' },
  body: { color: colors.textSecondary, fontSize: 17, lineHeight: 25 },
  primary: { minHeight: 52, borderRadius: radii.sm, backgroundColor: colors.amber, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  urgent: { minHeight: 52, borderRadius: radii.sm, backgroundColor: colors.urgent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  secondary: { minHeight: 52, borderRadius: radii.sm, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  primaryLabel: { color: colors.canvas, fontSize: 16, fontWeight: '800' },
  secondaryLabel: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
});
