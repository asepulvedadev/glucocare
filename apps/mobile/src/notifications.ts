import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Medication } from './types/care';
import type { Appointment } from './types/appointments';
import type { GlucoseRiskClassification } from './types/carePlan';
import { medicationReminderDates } from './domain/medicationReminder';
import { listMedications, updateMedicationReminder } from './db/careRepository';
import { listAppointments, updateAppointmentReminder } from './db/appointmentsRepository';
import type { SQLiteDatabase } from 'expo-sqlite';

const MEDICATION_CHANNEL = 'medications';
const APPOINTMENT_CHANNEL = 'appointments';
const GLUCOSE_RISK_CHANNEL = 'glucose-risk';
let notificationPreferences = { sound: true, vibration: true };

export function configureNotificationPreferences(preferences: { notificationSound: boolean; notificationVibration: boolean }) {
  notificationPreferences = { sound: preferences.notificationSound, vibration: preferences.notificationVibration };
}

function channelId(base: string) {
  return `${base}-${notificationPreferences.sound ? 'sound' : 'silent'}-${notificationPreferences.vibration ? 'vibrate' : 'quiet'}`;
}

async function ensureAndroidChannel(base: string, name: string, importance: Notifications.AndroidImportance, vibrationPattern: number[], lightColor: string) {
  const id = channelId(base);
  await Notifications.setNotificationChannelAsync(id, {
    name,
    importance,
    sound: notificationPreferences.sound ? 'default' : null,
    vibrationPattern: notificationPreferences.vibration ? vibrationPattern : null,
    lightColor,
  });
  return id;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: notificationPreferences.sound,
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
    await ensureAndroidChannel(MEDICATION_CHANNEL, 'Recordatorios de medicamentos', Notifications.AndroidImportance.HIGH, [0, 250, 250, 250], '#FFBE55');
    await ensureAndroidChannel(APPOINTMENT_CHANNEL, 'Recordatorios de citas', Notifications.AndroidImportance.DEFAULT, [0, 180, 120, 180], '#54D6C0');
    await ensureAndroidChannel(GLUCOSE_RISK_CHANNEL, 'Alertas de glucosa', Notifications.AndroidImportance.HIGH, [0, 350, 200, 350], '#FF7A5C');
  }
  const current = await Notifications.getPermissionsAsync();
  const result = current.status === 'granted' ? current : await Notifications.requestPermissionsAsync();
  return result.status === 'granted' ? 'granted' : 'permission_denied';
}

export async function scheduleMedicationReminder(medication: Medication): Promise<{ state: ReminderPermission; notificationId?: string; notificationIds?: string[] }> {
  const dates = medicationReminderDates(medication);
  if (!dates.length) return { state: 'unavailable' };
  const permission = await ensurePermission();
  if (permission !== 'granted') return { state: permission };

  const notificationIds: string[] = [];
  for (const date of dates) {
    const trigger: Notifications.SchedulableNotificationTriggerInput = Platform.OS === 'android'
      ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: channelId(MEDICATION_CHANNEL) }
      : { type: Notifications.SchedulableTriggerInputTypes.DATE, date };
    notificationIds.push(await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Recordatorio de rutina',
        body: 'Tienes una tarea de salud programada. Abre GlucoCare para ver los detalles.',
        data: { url: '/care', medicationId: medication.id, scheduledAt: date.toISOString() },
        sound: notificationPreferences.sound ? 'default' : undefined,
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
      sound: notificationPreferences.sound ? 'default' : undefined,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + minutes * 60 * 1000), channelId: channelId(MEDICATION_CHANNEL) },
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
      sound: notificationPreferences.sound ? 'default' : undefined,
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
    await ensureAndroidChannel(GLUCOSE_RISK_CHANNEL, 'Alertas de glucosa', Notifications.AndroidImportance.HIGH, [0, 350, 200, 350], '#FF7A5C');
  }
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return 'permission_denied';
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Revisa tu plan de glucosa',
      body: 'Tu última lectura quedó fuera del rango urgente guardado. Abre GlucoCare y sigue las instrucciones de tu equipo de salud.',
      data: { url: '/help', risk },
      sound: notificationPreferences.sound ? 'default' : undefined,
    },
    trigger: Platform.OS === 'android' ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId: channelId(GLUCOSE_RISK_CHANNEL) } : null,
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
  const expectedDates = medicationReminderDates(medication);
  if (!expectedDates.length) {
    await cancelReminder(notificationIds);
    return { state: 'unavailable' as const, notificationId: undefined, notificationIds: [] };
  }
  const permission = await ensurePermission();
  if (permission !== 'granted') return { state: permission as ReminderPermission };
  if (notificationIds.length === expectedDates.length && await hasScheduledNotifications(notificationIds)) return { state: 'granted' as const, notificationId: notificationIds[0], notificationIds };
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
      sound: notificationPreferences.sound ? 'default' : undefined,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderAt, channelId: channelId(APPOINTMENT_CHANNEL) },
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

/** Rebuilds already scheduled native reminders after a sound/vibration change. */
export async function refreshNotificationSchedules(db: SQLiteDatabase) {
  if (Platform.OS === 'web') return;
  const [medications, appointments] = await Promise.all([listMedications(db), listAppointments(db)]);
  await Promise.all(medications.map(async (medication) => {
    await cancelReminder(medication.notificationIds ?? (medication.notificationId ? [medication.notificationId] : []));
    const scheduled = await scheduleMedicationReminder(medication);
    await updateMedicationReminder(db, medication.id, scheduled.state === 'granted' ? 'scheduled' : scheduled.state === 'permission_denied' ? 'permission_denied' : 'unavailable', scheduled.notificationId, scheduled.notificationIds);
  }));
  await Promise.all(appointments.map(async (appointment) => {
    await cancelReminder(appointment.notificationId);
    const scheduled = await scheduleAppointmentReminder(appointment);
    await updateAppointmentReminder(db, appointment.id, scheduled.state === 'granted' ? 'scheduled' : scheduled.state === 'permission_denied' ? 'permission_denied' : 'unavailable', scheduled.notificationId);
  }));
}
