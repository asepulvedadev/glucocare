import { Tabs } from 'expo-router';
import { colors } from '../../theme/tokens';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.amber,
      tabBarInactiveTintColor: colors.textSecondary,
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 72, paddingTop: 8 },
      tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Hoy', tabBarAccessibilityLabel: 'Hoy, siguiente acción' }} />
      <Tabs.Screen name="history" options={{ title: 'Historial', tabBarAccessibilityLabel: 'Historial de registros' }} />
      <Tabs.Screen name="care" options={{ title: 'Cuidado', tabBarAccessibilityLabel: 'Medicamentos y citas' }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarAccessibilityLabel: 'Perfil y tarjeta de emergencia' }} />
    </Tabs>
  );
}
