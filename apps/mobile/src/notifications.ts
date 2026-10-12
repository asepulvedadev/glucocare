import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Medication } from './types/care';
import type { Appointment } from './types/appointments';

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

export async function ensurePermission(): Promise<ReminderPermission> {
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

export async function scheduleMedicationSnooze(medication: Medication, minutes = 10): Promise<ReminderPermission> {
  const permission = await ensurePermission();
  if (permission !== 'granted') return permission;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Recordatorio pospuesto: ${medication.name}`,
      body: `Revisa la indicación de ${medication.doseText} en ${minutes} minutos.`,
      data: { url: '/care', medicationId: medication.id, snoozed: true },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + minutes * 60 * 1000), channelId: MEDICATION_CHANNEL },
  });
  return permission;
}

export async function cancelReminder(notificationId?: string) {
  if (notificationId && Platform.OS !== 'web') {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }
}

export const cancelMedicationReminder = cancelReminder;

async function hasScheduledNotification(notificationId?: string) {
  if (!notificationId || Platform.OS === 'web') return false;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.some((request) => request.identifier === notificationId);
}

export async function reconcileMedicationReminder(medication: Medication) {
  if (Platform.OS === 'web') return { state: 'unavailable' as const };
  const permission = await ensurePermission();
  if (permission !== 'granted') return { state: permission as ReminderPermission };
  if (await hasScheduledNotification(medication.notificationId)) return { state: 'granted' as const, notificationId: medication.notificationId };
  return scheduleMedicationReminder(medication);
}

export async function scheduleAppointmentReminder(appointment: Appointment): Promise<{ state: ReminderPermission; notificationId?: string }> {
  const appointmentAt = new Date(appointment.scheduledAt);
  const reminderAt = new Date(appointmentAt.getTime() - 24 * 60 * 60 * 1000);
  if (!Number.isFinite(appointmentAt.getTime()) || reminderAt.getTime() <= Date.now()) {
    return { state: 'unavailable' };
  }
  const permission = await ensurePermission();
  if (permission !== 'granted') return { state: permission };
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: `Cita mañana: ${appointment.title}`,
      body: `${appointment.provider} · Revisa los detalles de tu cita.`,
      data: { url: '/care', appointmentId: appointment.id },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderAt, channelId: MEDICATION_CHANNEL },
  });
  return { state: permission, notificationId };
}

export async function reconcileAppointmentReminder(appointment: Appointment) {
  if (appointment.status === 'completed' || appointment.status === 'cancelled') {
    await cancelReminder(appointment.notificationId);
    return { state: 'unavailable' as const };
  }
  if (Platform.OS === 'web') return { state: 'unavailable' as const };
  const permission = await ensurePermission();
  if (permission !== 'granted') return { state: permission as ReminderPermission };
  if (await hasScheduledNotification(appointment.notificationId)) return { state: 'granted' as const, notificationId: appointment.notificationId };
  return scheduleAppointmentReminder(appointment);
}
