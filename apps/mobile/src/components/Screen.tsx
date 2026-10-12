import { PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, radii, spacing } from '../theme/tokens';

export function Screen({ children, scroll = true, showHelp = true }: PropsWithChildren<{ scroll?: boolean; showHelp?: boolean }>) {
  const content = <View style={styles.content}>{children}</View>;
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll}>{content}</ScrollView> : content}
      {showHelp ? <View pointerEvents="box-none" style={styles.helpOverlay}><Pressable accessibilityRole="button" accessibilityLabel="Necesito ayuda urgente" accessibilityHint="Abre la pantalla de ayuda y opciones de emergencia" onPress={() => router.push('/help')} style={styles.helpButton}><Text style={styles.helpText}>Necesito ayuda</Text></Pressable></View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flexGrow: 1, paddingBottom: spacing.xxl + 64 },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: spacing.md, gap: spacing.md },
  helpOverlay: { ...StyleSheet.absoluteFill, alignItems: 'flex-end', justifyContent: 'flex-end', paddingHorizontal: spacing.md, paddingBottom: 84 },
  helpButton: { minHeight: 48, borderRadius: radii.pill, backgroundColor: colors.urgent, paddingHorizontal: spacing.md, justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 8, elevation: 4 },
  helpText: { color: colors.textPrimary, fontSize: 15, fontWeight: '800' },
});
