import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Medication } from './types/care';
import type { Appointment } from './types/appointments';
import type { GlucoseRiskClassification } from './types/carePlan';
import { isMedicationActive } from './domain/medication';

const MEDICATION_CHANNEL = 'medications';
const APPOINTMENT_CHANNEL = 'appointments';
const GLUCOSE_RISK_CHANNEL = 'glucose-risk';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type ReminderPermission = 'granted' | 'permission_denied' | 'unavailable';

/** Opens the operating system notification settings when the user denied access. */
export async function openNotificationSettings() {
  if (Platform.OS === 'web') return false;
  await Linking.openSettings();
  return true;
}

export async function ensurePermission(): Promise<ReminderPermission> {
  if (Platform.OS === 'web') return 'unavailable';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(MEDICATION_CHANNEL, {
      name: 'Recordatorios de medicamentos',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FFBE55',
    });
    await Notifications.setNotificationChannelAsync(APPOINTMENT_CHANNEL, {
      name: 'Recordatorios de citas',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: '#54D6C0',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const result = current.status === 'granted' ? current : await Notifications.requestPermissionsAsync();
  return result.status === 'granted' ? 'granted' : 'permission_denied';
}

export async function scheduleMedicationReminder(medication: Medication): Promise<{ state: ReminderPermission; notificationId?: string; notificationIds?: string[] }> {
  if (!isMedicationActive(medication)) return { state: 'unavailable' };
  const permission = await ensurePermission();
  if (permission !== 'granted') return { state: permission };

  const times = medication.times?.length ? medication.times : [`${String(medication.hour).padStart(2, '0')}:${String(medication.minute).padStart(2, '0')}`];
  const notificationIds: string[] = [];
  for (const time of times) {
    const [hour, minute] = time.split(':').map(Number);
    const trigger: Notifications.SchedulableNotificationTriggerInput = Platform.OS === 'android'
      ? { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: MEDICATION_CHANNEL }
      : { type: Notifications.SchedulableTriggerInputTypes.CALENDAR, hour, minute, repeats: true };
    notificationIds.push(await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Recordatorio de rutina',
        body: 'Tienes una tarea de salud programada. Abre GlucoCare para ver los detalles.',
        data: { url: '/care', medicationId: medication.id, time },
      },
      trigger,
    }));
  }
  return { state: permission, notificationId: notificationIds[0], notificationIds };
}

export async function scheduleMedicationSnooze(medication: Medication, minutes = 10): Promise<ReminderPermission> {
  const permission = await ensurePermission();
  if (permission !== 'granted') return permission;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Recordatorio pospuesto',
      body: 'Revisa tu tarea de salud en GlucoCare.',
      data: { url: '/care', medicationId: medication.id, snoozed: true },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + minutes * 60 * 1000), channelId: MEDICATION_CHANNEL },
  });
  return permission;
}

/** Sends a generic local notification so the user can verify current settings. */
export async function sendTestNotification(): Promise<ReminderPermission> {
  const permission = await ensurePermission();
  if (permission !== 'granted') return permission;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Prueba de recordatorios',
      body: 'Las notificaciones locales de GlucoCare están activas.',
      data: { url: '/care', test: true },
    },
    trigger: null,
  });
  return permission;
}

/**
 * Surfaces an urgent, clinician-configured risk without putting the glucose
 * value on the lock screen. It never requests permission by itself: saving a
 * reading must remain possible when notifications are disabled.
 */
export async function notifyUrgentGlucoseRisk(risk: GlucoseRiskClassification): Promise<ReminderPermission> {
  if (risk !== 'urgent_low' && risk !== 'urgent_high') return 'unavailable';
  if (Platform.OS === 'web') return 'unavailable';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(GLUCOSE_RISK_CHANNEL, {
      name: 'Alertas de glucosa',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 350, 200, 350],
      lightColor: '#FF7A5C',
    });
  }
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return 'permission_denied';
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Revisa tu plan de glucosa',
      body: 'Tu última lectura quedó fuera del rango urgente guardado. Abre GlucoCare y sigue las instrucciones de tu equipo de salud.',
      data: { url: '/help', risk },
    },
    trigger: Platform.OS === 'android' ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId: GLUCOSE_RISK_CHANNEL } : null,
  });
  return 'granted';
}

export async function cancelReminder(notificationId?: string | string[]) {
  if (!notificationId || Platform.OS === 'web') return;
  const ids = Array.isArray(notificationId) ? notificationId : [notificationId];
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
}

export const cancelMedicationReminder = cancelReminder;

async function hasScheduledNotifications(notificationIds: string[]) {
  if (!notificationIds.length || Platform.OS === 'web') return false;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const scheduledIds = new Set(scheduled.map((request) => request.identifier));
  return notificationIds.every((id) => scheduledIds.has(id));
}

export async function reconcileMedicationReminder(medication: Medication) {
  if (Platform.OS === 'web') return { state: 'unavailable' as const };
  const notificationIds = medication.notificationIds ?? (medication.notificationId ? [medication.notificationId] : []);
  if (!isMedicationActive(medication)) {
    await cancelReminder(notificationIds);
    return { state: 'unavailable' as const, notificationId: undefined, notificationIds: [] };
  }
  const permission = await ensurePermission();
  if (permission !== 'granted') return { state: permission as ReminderPermission };
  if (await hasScheduledNotifications(notificationIds)) return { state: 'granted' as const, notificationId: notificationIds[0], notificationIds };
  await cancelReminder(notificationIds);
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
      title: 'Recordatorio de cita',
      body: 'Tienes una cita próxima. Abre GlucoCare para ver los detalles.',
      data: { url: '/care', appointmentId: appointment.id },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderAt, channelId: APPOINTMENT_CHANNEL },
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
  if (await hasScheduledNotifications(appointment.notificationId ? [appointment.notificationId] : [])) return { state: 'granted' as const, notificationId: appointment.notificationId };
  return scheduleAppointmentReminder(appointment);
}
