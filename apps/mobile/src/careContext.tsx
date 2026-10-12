import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { insertMedication, listMedications, updateMedication as updateStoredMedication, updateMedicationReminder } from './db/careRepository';
import { insertAppointment, listAppointments, updateAppointment as updateStoredAppointment, updateAppointmentReminder, updateAppointmentStatus as updateStoredAppointmentStatus } from './db/appointmentsRepository';
import { getMeasurementPlan, upsertMeasurementPlan } from './db/measurementRepository';
import { getCarePlan, upsertCarePlan } from './db/carePlanRepository';
import { ensureTodaysMedicationOccurrences, listTodaysMedicationOccurrences, recordMedicationOccurrence } from './db/medicationOccurrenceRepository';
import { ensureTodaysMeasurementOccurrences, listTodaysMeasurementOccurrences, recordMeasurementOccurrence } from './db/measurementOccurrenceRepository';
import { cancelReminder, reconcileAppointmentReminder, reconcileMedicationReminder, refreshMeasurementPlanReminders, scheduleAppointmentReminder, scheduleMedicationSnooze, scheduleMedicationReminder, type ReminderPermission } from './notifications';
import type { Medication, NewMedication } from './types/care';
import type { Appointment, NewAppointment } from './types/appointments';
import type { MeasurementPlan, NewMeasurementPlan } from './types/measurement';
import type { MedicationOccurrence, MedicationOccurrenceStatus } from './types/medicationOccurrences';
import type { MeasurementOccurrence, MeasurementOccurrenceStatus } from './types/measurementOccurrences';
import type { CarePlan, NewCarePlan } from './types/carePlan';
import { insertMealEvent, listMealEvents } from './db/mealRepository';
import type { MealEvent, NewMealEvent } from './types/meals';
import { newId } from './ids';

type CareContextValue = {
  medications: Medication[];
  medicationOccurrences: MedicationOccurrence[];
  measurementOccurrences: MeasurementOccurrence[];
  appointments: Appointment[];
  measurementPlan: MeasurementPlan | null;
  carePlan: CarePlan | null;
  mealEvents: MealEvent[];
  isLoading: boolean;
  addMedication: (input: NewMedication) => Promise<ReminderPermission>;
  updateMedication: (medicationId: string, input: NewMedication) => Promise<ReminderPermission>;
  addAppointment: (input: NewAppointment) => Promise<ReminderPermission>;
  updateAppointment: (appointmentId: string, input: NewAppointment) => Promise<ReminderPermission>;
  saveMeasurementPlan: (input: NewMeasurementPlan) => Promise<void>;
  saveCarePlan: (input: NewCarePlan) => Promise<void>;
  addMealEvent: (input: NewMealEvent) => Promise<void>;
  markMedicationOccurrence: (occurrenceId: string, status: MedicationOccurrenceStatus) => Promise<void>;
  snoozeMedicationOccurrence: (occurrenceId: string) => Promise<ReminderPermission>;
  markMeasurementOccurrence: (occurrenceId: string, status: MeasurementOccurrenceStatus) => Promise<void>;
  updateAppointmentStatus: (appointmentId: string, status: Appointment['status']) => Promise<void>;
  refresh: () => Promise<void>;
};

const CareContext = createContext<CareContextValue | null>(null);

export function CareProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [medicationOccurrences, setMedicationOccurrences] = useState<MedicationOccurrence[]>([]);
  const [measurementOccurrences, setMeasurementOccurrences] = useState<MeasurementOccurrence[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [measurementPlan, setMeasurementPlan] = useState<MeasurementPlan | null>(null);
  const [carePlan, setCarePlan] = useState<CarePlan | null>(null);
  const [mealEvents, setMealEvents] = useState<MealEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reconcileStoredReminders = useCallback(async (storedMedications: Medication[], storedAppointments: Appointment[]) => {
    const [medicationResults, appointmentResults] = await Promise.all([
      // Reconcile disabled/expired records too: this cancels stale OS
      // notifications instead of leaving a reminder alive after the plan ends.
      Promise.all(storedMedications.map(async (medication) => ({ medication, scheduled: await reconcileMedicationReminder(medication).catch(() => ({ state: 'unavailable' as const, notificationId: undefined, notificationIds: undefined })) }))),
      Promise.all(storedAppointments.map(async (appointment) => ({ appointment, scheduled: await reconcileAppointmentReminder(appointment).catch(() => ({ state: 'unavailable' as const, notificationId: undefined })) }))),
    ]);
    const updatedMedications = storedMedications.map((medication) => {
      const result = medicationResults.find((item) => item.medication.id === medication.id);
      if (!result) return medication;
      const next = { ...medication, notificationId: result.scheduled.notificationId, notificationIds: result.scheduled.notificationIds ?? (result.scheduled.notificationId ? [result.scheduled.notificationId] : []), reminderState: result.scheduled.state === 'granted' ? 'scheduled' as const : result.scheduled.state };
      if (next.reminderState !== medication.reminderState || next.notificationId !== medication.notificationId || JSON.stringify(next.notificationIds) !== JSON.stringify(medication.notificationIds)) void updateMedicationReminder(db, medication.id, next.reminderState, next.notificationId, next.notificationIds);
      return next;
    });
    const updatedAppointments = storedAppointments.map((appointment) => {
      const result = appointmentResults.find((item) => item.appointment.id === appointment.id);
      if (!result) return appointment;
      const next = { ...appointment, notificationId: result.scheduled.notificationId, reminderState: result.scheduled.state === 'granted' ? 'scheduled' as const : result.scheduled.state };
      if (next.reminderState !== appointment.reminderState || next.notificationId !== appointment.notificationId) void updateAppointmentReminder(db, appointment.id, next.reminderState, next.notificationId);
      return next;
    });
    return { medications: updatedMedications, appointments: updatedAppointments };
  }, [db]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [storedMedications, storedAppointments, storedPlan, storedCarePlan, storedMeals] = await Promise.all([listMedications(db), listAppointments(db), getMeasurementPlan(db), getCarePlan(db), listMealEvents(db)]);
      const reconciled = await reconcileStoredReminders(storedMedications, storedAppointments);
      await refreshMeasurementPlanReminders(storedPlan, storedMeals).catch(() => undefined);
      await ensureTodaysMedicationOccurrences(db, reconciled.medications);
      const storedOccurrences = await listTodaysMedicationOccurrences(db);
      await ensureTodaysMeasurementOccurrences(db, storedPlan);
      const storedMeasurementOccurrences = await listTodaysMeasurementOccurrences(db);
      setMedications(reconciled.medications);
      setMedicationOccurrences(storedOccurrences);
      setMeasurementOccurrences(storedMeasurementOccurrences);
      setCarePlan(storedCarePlan);
      setAppointments(reconciled.appointments);
      setMeasurementPlan(storedPlan);
      setMealEvents(storedMeals);
    } finally { setIsLoading(false); }
  }, [db, reconcileStoredReminders]);

  useEffect(() => {
    let active = true;
    void Promise.all([listMedications(db), listAppointments(db), getMeasurementPlan(db), getCarePlan(db), listMealEvents(db)]).then(async ([storedMedications, storedAppointments, storedPlan, storedCarePlan, storedMeals]) => {
      const reconciled = await reconcileStoredReminders(storedMedications, storedAppointments);
      await refreshMeasurementPlanReminders(storedPlan, storedMeals).catch(() => undefined);
      await ensureTodaysMedicationOccurrences(db, reconciled.medications);
      const storedOccurrences = await listTodaysMedicationOccurrences(db);
      await ensureTodaysMeasurementOccurrences(db, storedPlan);
      const storedMeasurementOccurrences = await listTodaysMeasurementOccurrences(db);
      if (active) {
        setMedications(reconciled.medications);
        setMedicationOccurrences(storedOccurrences);
        setMeasurementOccurrences(storedMeasurementOccurrences);
        setCarePlan(storedCarePlan);
        setAppointments(reconciled.appointments);
        setMeasurementPlan(storedPlan);
        setMealEvents(storedMeals);
      }
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [db, reconcileStoredReminders]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const addMedication = useCallback(async (input: NewMedication) => {
    const medication: Medication = {
      ...input,
      id: newId(),
      createdAt: new Date().toISOString(),
      reminderState: 'unavailable',
    };
    const scheduled = await scheduleMedicationReminder(medication);
    const stored: Medication = {
      ...medication,
      notificationId: scheduled.notificationId,
      notificationIds: scheduled.notificationIds,
      reminderState: scheduled.state === 'granted' ? 'scheduled' : scheduled.state,
    };
    await insertMedication(db, stored);
    await ensureTodaysMedicationOccurrences(db, [stored]);
    setMedications((current) => [...current, stored].sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute)));
    setMedicationOccurrences(await listTodaysMedicationOccurrences(db));
    return scheduled.state;
  }, [db]);

  const updateMedication = useCallback(async (medicationId: string, input: NewMedication) => {
    const current = medications.find((item) => item.id === medicationId);
    if (!current) throw new Error('Medication not found.');
    await cancelReminder(current.notificationIds ?? current.notificationId);
    const medication: Medication = { ...input, id: current.id, createdAt: current.createdAt, reminderState: 'unavailable' };
    const scheduled = await scheduleMedicationReminder(medication);
    const stored: Medication = { ...medication, notificationId: scheduled.notificationId, notificationIds: scheduled.notificationIds, reminderState: scheduled.state === 'granted' ? 'scheduled' : scheduled.state };
    await updateStoredMedication(db, stored);
    await ensureTodaysMedicationOccurrences(db, [stored]);
    setMedications((items) => items.map((item) => item.id === stored.id ? stored : item).sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute)));
    setMedicationOccurrences(await listTodaysMedicationOccurrences(db));
    return scheduled.state;
  }, [db, medications]);

  const addAppointment = useCallback(async (input: NewAppointment) => {
    const appointment: Appointment = {
      ...input,
      id: newId(),
      createdAt: new Date().toISOString(),
      reminderState: 'unavailable',
    };
    const scheduled = await scheduleAppointmentReminder(appointment);
    const stored: Appointment = {
      ...appointment,
      notificationId: scheduled.notificationId,
      reminderState: scheduled.state === 'granted' ? 'scheduled' : scheduled.state,
    };
    await insertAppointment(db, stored);
    setAppointments((current) => [...current, stored].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
    return scheduled.state;
  }, [db]);

  const updateAppointment = useCallback(async (appointmentId: string, input: NewAppointment) => {
    const current = appointments.find((item) => item.id === appointmentId);
    if (!current) throw new Error('Appointment not found.');
    await cancelReminder(current.notificationId);
    const appointment: Appointment = {
      ...input,
      id: current.id,
      createdAt: current.createdAt,
      reminderState: 'unavailable',
    };
    const scheduled = appointment.status === 'completed' || appointment.status === 'cancelled'
      ? { state: 'unavailable' as const, notificationId: undefined }
      : await scheduleAppointmentReminder(appointment);
    const stored: Appointment = {
      ...appointment,
      notificationId: scheduled.notificationId,
      reminderState: scheduled.state === 'granted' ? 'scheduled' : scheduled.state,
    };
    await updateStoredAppointment(db, stored);
    setAppointments((items) => items.map((item) => item.id === stored.id ? stored : item).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
    return scheduled.state;
  }, [appointments, db]);

  const saveMeasurementPlan = useCallback(async (input: NewMeasurementPlan) => {
    const plan: MeasurementPlan = { id: 'default', ...input, updatedAt: new Date().toISOString() };
    await upsertMeasurementPlan(db, plan);
    await ensureTodaysMeasurementOccurrences(db, plan);
    await refreshMeasurementPlanReminders(plan, mealEvents).catch(() => undefined);
    setMeasurementPlan(plan);
    setMeasurementOccurrences(await listTodaysMeasurementOccurrences(db));
  }, [db, mealEvents]);

  const saveCarePlan = useCallback(async (input: NewCarePlan) => {
    const plan: CarePlan = { id: 'default', ...input, updatedAt: new Date().toISOString() };
    await upsertCarePlan(db, plan);
    setCarePlan(plan);
  }, [db]);

  const addMealEvent = useCallback(async (input: NewMealEvent) => {
    const stored = await insertMealEvent(db, input);
    setMealEvents((current) => [stored, ...current]);
    const plan = await getMeasurementPlan(db);
    const occurredAt = new Date(input.occurredAt);
    await ensureTodaysMeasurementOccurrences(db, plan, occurredAt);
    await refreshMeasurementPlanReminders(plan, [stored, ...mealEvents]).catch(() => undefined);
    setMeasurementOccurrences(await listTodaysMeasurementOccurrences(db, occurredAt));
  }, [db, mealEvents]);

  const markMedicationOccurrence = useCallback(async (occurrenceId: string, status: MedicationOccurrenceStatus) => {
    const updated = await recordMedicationOccurrence(db, occurrenceId, status);
    setMedicationOccurrences((current) => current.map((occurrence) => occurrence.id === updated.id ? updated : occurrence));
  }, [db]);

  const snoozeMedicationOccurrence = useCallback(async (occurrenceId: string) => {
    const occurrence = medicationOccurrences.find((item) => item.id === occurrenceId);
    const medication = occurrence ? medications.find((item) => item.id === occurrence.medicationId) : undefined;
    if (!medication) throw new Error('Medication not found.');
    const permission = await scheduleMedicationSnooze(medication);
    const updated = await recordMedicationOccurrence(db, occurrenceId, 'snoozed');
    setMedicationOccurrences((current) => current.map((item) => item.id === updated.id ? updated : item));
    return permission;
  }, [db, medicationOccurrences, medications]);

  const markMeasurementOccurrence = useCallback(async (occurrenceId: string, status: MeasurementOccurrenceStatus) => {
    const updated = await recordMeasurementOccurrence(db, occurrenceId, status);
    setMeasurementOccurrences((current) => current.map((occurrence) => occurrence.id === updated.id ? updated : occurrence));
  }, [db]);

  const updateAppointmentStatus = useCallback(async (appointmentId: string, status: Appointment['status']) => {
    const updated = await updateStoredAppointmentStatus(db, appointmentId, status);
    if (status === 'completed' || status === 'cancelled') await cancelReminder(updated.notificationId);
    setAppointments((current) => current.map((appointment) => appointment.id === updated.id ? updated : appointment));
  }, [db]);

  const value = useMemo(() => ({ medications, medicationOccurrences, measurementOccurrences, appointments, measurementPlan, carePlan, mealEvents, isLoading, addMedication, updateMedication, addAppointment, updateAppointment, saveMeasurementPlan, saveCarePlan, addMealEvent, markMedicationOccurrence, snoozeMedicationOccurrence, markMeasurementOccurrence, updateAppointmentStatus, refresh }), [medications, medicationOccurrences, measurementOccurrences, appointments, measurementPlan, carePlan, mealEvents, isLoading, addMedication, updateMedication, addAppointment, updateAppointment, saveMeasurementPlan, saveCarePlan, addMealEvent, markMedicationOccurrence, snoozeMedicationOccurrence, markMeasurementOccurrence, updateAppointmentStatus, refresh]);
  return <CareContext.Provider value={value}>{children}</CareContext.Provider>;
}

export function useCare() {
  const value = useContext(CareContext);
  if (!value) throw new Error('useCare must be used inside CareProvider');
  return value;
}
