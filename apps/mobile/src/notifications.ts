import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Medication } from './types/care';

const MEDICATION_CHANNEL = 'medications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type ReminderPermission = 'granted' | 'permission_denied' | 'unavailable';

async function ensurePermission(): Promise<ReminderPermission> {
  if (Platform.OS === 'web') return 'unavailable';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(MEDICATION_CHANNEL, {
      name: 'Recordatorios de medicamentos',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FFBE55',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const result = current.status === 'granted' ? current : await Notifications.requestPermissionsAsync();
  return result.status === 'granted' ? 'granted' : 'permission_denied';
}

export async function scheduleMedicationReminder(medication: Medication): Promise<{ state: ReminderPermission; notificationId?: string }> {
  const permission = await ensurePermission();
  if (permission !== 'granted') return { state: permission };

  const trigger: Notifications.SchedulableNotificationTriggerInput = Platform.OS === 'android'
    ? { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: medication.hour, minute: medication.minute, channelId: MEDICATION_CHANNEL }
    : { type: Notifications.SchedulableTriggerInputTypes.CALENDAR, hour: medication.hour, minute: medication.minute, repeats: true };

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: `Recordatorio: ${medication.name}`,
      body: `Hora de tomar ${medication.doseText}. Sigue las instrucciones de tu equipo de salud.`,
      data: { url: '/care', medicationId: medication.id },
    },
    trigger,
  });
  return { state: permission, notificationId };
}

export async function cancelMedicationReminder(notificationId?: string) {
  if (notificationId && Platform.OS !== 'web') {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }
}
