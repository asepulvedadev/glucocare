import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Medication } from './types/care';
import type { Appointment } from './types/appointments';
import type { GlucoseRiskClassification } from './types/carePlan';
import type { MeasurementPlan } from './types/measurement';
import type { MealEvent } from './types/meals';
import { medicationReminderDates } from './domain/medicationReminder';
import { measurementReminderDates } from './domain/measurementReminder';
import { listMedications, updateMedicationReminder } from './db/careRepository';
import { listAppointments, updateAppointmentReminder } from './db/appointmentsRepository';
import { getMeasurementPlan } from './db/measurementRepository';
import { listMealEvents } from './db/mealRepository';
import type { SQLiteDatabase } from 'expo-sqlite';
import { isTerminalAppointmentStatus } from './domain/appointmentState';
import { selectNotificationCandidates, type NotificationCandidate } from './domain/notificationSchedule';

const MEDICATION_CHANNEL = 'medications';
const APPOINTMENT_CHANNEL = 'appointments';
const MEASUREMENT_CHANNEL = 'measurements';
const GLUCOSE_RISK_CHANNEL = 'glucose-risk';
let notificationPreferences = { sound: true, vibration: true };
let notificationRefreshInFlight: Promise<void> | null = null;

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
export type ReminderScheduleState = 'scheduled' | 'scheduled_limited' | 'permission_denied' | 'unavailable';

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
    await ensureAndroidChannel(MEASUREMENT_CHANNEL, 'Recordatorios de mediciones', Notifications.AndroidImportance.DEFAULT, [0, 180, 120, 180], '#75B7D8');
    await ensureAndroidChannel(GLUCOSE_RISK_CHANNEL, 'Alertas de glucosa', Notifications.AndroidImportance.HIGH, [0, 350, 200, 350], '#FF7A5C');
  }
  const current = await Notifications.getPermissionsAsync();
  // A denied permission must not trigger a prompt loop on every app resume.
  // Profile exposes the explicit system-settings action for this state.
  if (current.status === 'denied') return 'permission_denied';
  const result = current.status === 'granted' ? current : await Notifications.requestPermissionsAsync();
  return result.status === 'granted' ? 'granted' : 'permission_denied';
}

export async function scheduleMedicationReminder(medication: Medication, meals: MealEvent[] = []): Promise<{ state: ReminderPermission; notificationId?: string; notificationIds?: string[] }> {
  const dates = medicationReminderDates(medication, new Date(), undefined, meals);
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
        data: { kind: 'medication', url: '/care', medicationId: medication.id, scheduledAt: date.toISOString() },
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
      data: { kind: 'medication_snooze', url: '/care', medicationId: medication.id, snoozed: true },
      sound: notificationPreferences.sound ? 'default' : undefined,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + minutes * 60 * 1000), channelId: channelId(MEDICATION_CHANNEL) },
  });
  return permission;
}

export async function cancelMeasurementPlanReminders() {
  if (Platform.OS === 'web') return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ids = scheduled
    .filter((request) => request.content.data && typeof request.content.data === 'object' && (request.content.data as Record<string, unknown>).kind === 'measurement')
    .map((request) => request.identifier);
  await cancelReminder(ids);
}

/** Rebuilds bounded fixed and meal-relative glucose-check reminders. */
export async function refreshMeasurementPlanReminders(plan: MeasurementPlan | null, meals: MealEvent[]) {
  if (Platform.OS === 'web') return { state: 'unavailable' as const, notificationIds: [] as string[] };
  await cancelMeasurementPlanReminders();
  const dates = measurementReminderDates(plan, meals);
  if (!dates.length) return { state: 'unavailable' as const, notificationIds: [] as string[] };
  const permission = await ensurePermission();
  if (permission !== 'granted') return { state: permission, notificationIds: [] as string[] };
  const notificationIds: string[] = [];
  for (const item of dates) {
    const trigger: Notifications.SchedulableNotificationTriggerInput = Platform.OS === 'android'
      ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.scheduledAt, channelId: channelId(MEASUREMENT_CHANNEL) }
      : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.scheduledAt };
    notificationIds.push(await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Medición de glucosa',
        body: 'Tienes una medición planificada. Registra el valor y sigue las instrucciones de tu equipo de salud.',
        data: { kind: 'measurement', url: '/log', scheduledAt: item.scheduledAt.toISOString(), windowIndex: item.windowIndex, mealEventId: item.mealEventId },
        sound: notificationPreferences.sound ? 'default' : undefined,
      },
      trigger,
    }));
  }
  return { state: permission, notificationIds };
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

/** Removes every local reminder owned by this app during a replace/delete flow. */
export async function cancelAllScheduledReminders() {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export const cancelMedicationReminder = cancelReminder;

async function hasScheduledNotifications(notificationIds: string[]) {
  if (!notificationIds.length || Platform.OS === 'web') return false;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const scheduledIds = new Set(scheduled.map((request) => request.identifier));
  return notificationIds.every((id) => scheduledIds.has(id));
}

export async function reconcileMedicationReminder(medication: Medication, meals: MealEvent[] = []) {
  if (Platform.OS === 'web') return { state: 'unavailable' as const };
  const notificationIds = medication.notificationIds ?? (medication.notificationId ? [medication.notificationId] : []);
  const expectedDates = medicationReminderDates(medication, new Date(), undefined, meals);
  if (!expectedDates.length) {
    await cancelReminder(notificationIds);
    return { state: 'unavailable' as const, notificationId: undefined, notificationIds: [] };
  }
  const permission = await ensurePermission();
  if (permission !== 'granted') return { state: permission as ReminderPermission };
  if (notificationIds.length === expectedDates.length && await hasScheduledNotifications(notificationIds)) return { state: 'granted' as const, notificationId: notificationIds[0], notificationIds };
  await cancelReminder(notificationIds);
  return scheduleMedicationReminder(medication, meals);
}

export async function scheduleAppointmentReminder(appointment: Appointment): Promise<{ state: ReminderPermission; notificationId?: string }> {
  if (isTerminalAppointmentStatus(appointment.status)) {
    return { state: 'unavailable' };
  }
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
      data: { kind: 'appointment', url: '/care', appointmentId: appointment.id },
      sound: notificationPreferences.sound ? 'default' : undefined,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderAt, channelId: channelId(APPOINTMENT_CHANNEL) },
  });
  return { state: permission, notificationId };
}

export async function reconcileAppointmentReminder(appointment: Appointment) {
  if (isTerminalAppointmentStatus(appointment.status)) {
    await cancelReminder(appointment.notificationId);
    return { state: 'unavailable' as const };
  }
  if (Platform.OS === 'web') return { state: 'unavailable' as const };
  const permission = await ensurePermission();
  if (permission !== 'granted') return { state: permission as ReminderPermission };
  if (await hasScheduledNotifications(appointment.notificationId ? [appointment.notificationId] : [])) return { state: 'granted' as const, notificationId: appointment.notificationId };
  return scheduleAppointmentReminder(appointment);
}

type ManagedSchedule = {
  candidate: NotificationCandidate;
  channel: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
};

function isManagedNotification(request: Notifications.NotificationRequest) {
  const data = request.content.data;
  if (!data || typeof data !== 'object') return false;
  const values = data as Record<string, unknown>;
  if (values.kind === 'medication_snooze') return false;
  return values.kind === 'medication' || values.kind === 'appointment' || values.kind === 'measurement'
    || typeof values.medicationId === 'string' || typeof values.appointmentId === 'string';
}

async function cancelManagedReminders() {
  if (Platform.OS === 'web') return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await cancelReminder(scheduled.filter(isManagedNotification).map((request) => request.identifier));
}

function asDateTrigger(date: Date, baseChannel: string): Notifications.SchedulableNotificationTriggerInput {
  return Platform.OS === 'android'
    ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: channelId(baseChannel) }
    : { type: Notifications.SchedulableTriggerInputTypes.DATE, date };
}

function buildManagedSchedules(
  medications: Medication[],
  appointments: Appointment[],
  measurementPlan: MeasurementPlan | null,
  meals: MealEvent[],
  now = new Date(),
): ManagedSchedule[] {
  const schedules: ManagedSchedule[] = [];
  for (const medication of medications) {
    for (const date of medicationReminderDates(medication, now, undefined, meals)) {
      schedules.push({
        candidate: { key: `medication:${medication.id}:${date.toISOString()}`, kind: 'medication', ownerId: medication.id, scheduledAt: date },
        channel: MEDICATION_CHANNEL,
        title: 'Recordatorio de rutina',
        body: 'Tienes una tarea de salud programada. Abre GlucoCare para ver los detalles.',
        data: { kind: 'medication', url: '/care', medicationId: medication.id, scheduledAt: date.toISOString() },
      });
    }
  }
  for (const appointment of appointments) {
    if (isTerminalAppointmentStatus(appointment.status)) continue;
    const appointmentAt = new Date(appointment.scheduledAt);
    const reminderAt = new Date(appointmentAt.getTime() - 24 * 60 * 60 * 1000);
    if (!Number.isFinite(appointmentAt.getTime()) || reminderAt.getTime() <= now.getTime()) continue;
    schedules.push({
      candidate: { key: `appointment:${appointment.id}:${reminderAt.toISOString()}`, kind: 'appointment', ownerId: appointment.id, scheduledAt: reminderAt },
      channel: APPOINTMENT_CHANNEL,
      title: 'Recordatorio de cita',
      body: 'Tienes una cita próxima. Abre GlucoCare para ver los detalles.',
      data: { kind: 'appointment', url: '/care', appointmentId: appointment.id, scheduledAt: appointmentAt.toISOString() },
    });
  }
  for (const item of measurementReminderDates(measurementPlan, meals, now)) {
    const ownerId = measurementPlan?.id ?? 'default';
    const key = `measurement:${ownerId}:${item.scheduledAt.toISOString()}:${item.windowIndex}:${item.mealEventId ?? ''}`;
    schedules.push({
      candidate: { key, kind: 'measurement', ownerId, scheduledAt: item.scheduledAt, mealEventId: item.mealEventId, windowIndex: item.windowIndex },
      channel: MEASUREMENT_CHANNEL,
      title: 'Medición de glucosa',
      body: 'Tienes una medición planificada. Registra el valor y sigue las instrucciones de tu equipo de salud.',
      data: { kind: 'measurement', url: '/log', scheduledAt: item.scheduledAt.toISOString(), windowIndex: item.windowIndex, mealEventId: item.mealEventId },
    });
  }
  return schedules;
}

/**
 * Rebuilds all managed native reminders from one bounded queue. The native
 * pending-notification limit is shared across medications, measurements, and
 * appointments; omitted future reminders are recreated on the next resume.
 */
async function refreshNotificationSchedulesInternal(db: SQLiteDatabase) {
  if (Platform.OS === 'web') return;
  const [medications, appointments, measurementPlan, meals] = await Promise.all([listMedications(db), listAppointments(db), getMeasurementPlan(db), listMealEvents(db)]);
  await cancelManagedReminders();
  const now = new Date();
  const schedules = buildManagedSchedules(medications, appointments, measurementPlan, meals, now);
  if (!schedules.length) {
    await Promise.all([
      ...medications.map((medication) => updateMedicationReminder(db, medication.id, 'unavailable', undefined, [])),
      ...appointments.map((appointment) => updateAppointmentReminder(db, appointment.id, 'unavailable', undefined)),
    ]);
    return;
  }
  const permission = await ensurePermission();
  if (permission !== 'granted') {
    await Promise.all([
      ...medications.map((medication) => updateMedicationReminder(db, medication.id, permission, undefined, [])),
      ...appointments.map((appointment) => updateAppointmentReminder(db, appointment.id, permission, undefined)),
    ]);
    return;
  }

  const selected = new Map(selectNotificationCandidates(schedules.map(({ candidate }) => candidate)).map((candidate) => [candidate.key, candidate]));
  const scheduledIds = new Map<string, string[]>();
  for (const schedule of schedules) {
    if (!selected.has(schedule.candidate.key)) continue;
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: schedule.title, body: schedule.body, data: schedule.data, sound: notificationPreferences.sound ? 'default' : undefined },
        trigger: asDateTrigger(schedule.candidate.scheduledAt, schedule.channel),
      });
      const current = scheduledIds.get(schedule.candidate.ownerId) ?? [];
      current.push(id);
      scheduledIds.set(schedule.candidate.ownerId, current);
    } catch {
      // Keep the remaining candidates eligible for the next reconciliation.
    }
  }

  await Promise.all(medications.map(async (medication) => {
    const expected = medicationReminderDates(medication, now, undefined, meals).length;
    const ids = scheduledIds.get(medication.id) ?? [];
    const state: ReminderScheduleState = expected === 0 ? 'unavailable' : ids.length === expected ? 'scheduled' : ids.length > 0 ? 'scheduled_limited' : 'unavailable';
    await updateMedicationReminder(db, medication.id, state, ids[0], ids);
  }));
  await Promise.all(appointments.map(async (appointment) => {
    const expected = !isTerminalAppointmentStatus(appointment.status) && (() => {
      const at = new Date(appointment.scheduledAt).getTime();
      return Number.isFinite(at) && at - 24 * 60 * 60 * 1000 > now.getTime();
    })();
    const ids = scheduledIds.get(appointment.id) ?? [];
    const state: ReminderScheduleState = !expected ? 'unavailable' : ids.length ? 'scheduled' : 'scheduled_limited';
    await updateAppointmentReminder(db, appointment.id, state, ids[0]);
  }));
}

/** Serializes rebuilds triggered by app resume, focus, and preference changes. */
export async function refreshNotificationSchedules(db: SQLiteDatabase) {
  if (notificationRefreshInFlight) return notificationRefreshInFlight;
  notificationRefreshInFlight = refreshNotificationSchedulesInternal(db).finally(() => {
    notificationRefreshInFlight = null;
  });
  return notificationRefreshInFlight;
}
