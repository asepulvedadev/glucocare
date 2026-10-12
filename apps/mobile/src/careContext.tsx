import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { insertMedication, listMedications, updateMedication as updateStoredMedication } from './db/careRepository';
import { insertAppointment, listAppointments, updateAppointment as updateStoredAppointment, updateAppointmentStatus as updateStoredAppointmentStatus } from './db/appointmentsRepository';
import { getMeasurementPlan, upsertMeasurementPlan } from './db/measurementRepository';
import { getCarePlan, upsertCarePlan } from './db/carePlanRepository';
import { ensureTodaysMedicationOccurrences, listTodaysMedicationOccurrences, recordMedicationOccurrence } from './db/medicationOccurrenceRepository';
import { ensureTodaysMeasurementOccurrences, listTodaysMeasurementOccurrences, recordMeasurementOccurrence } from './db/measurementOccurrenceRepository';
import { refreshNotificationSchedules, scheduleMedicationSnooze, type ReminderPermission, type ReminderScheduleState } from './notifications';
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
  addMedication: (input: NewMedication) => Promise<ReminderScheduleState>;
  updateMedication: (medicationId: string, input: NewMedication) => Promise<ReminderScheduleState>;
  addAppointment: (input: NewAppointment) => Promise<ReminderScheduleState>;
  updateAppointment: (appointmentId: string, input: NewAppointment) => Promise<ReminderScheduleState>;
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

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      await refreshNotificationSchedules(db).catch(() => undefined);
      const [storedMedications, storedAppointments, storedPlan, storedCarePlan, storedMeals] = await Promise.all([listMedications(db), listAppointments(db), getMeasurementPlan(db), getCarePlan(db), listMealEvents(db)]);
      await ensureTodaysMedicationOccurrences(db, storedMedications);
      const storedOccurrences = await listTodaysMedicationOccurrences(db);
      await ensureTodaysMeasurementOccurrences(db, storedPlan);
      const storedMeasurementOccurrences = await listTodaysMeasurementOccurrences(db);
      setMedications(storedMedications);
      setMedicationOccurrences(storedOccurrences);
      setMeasurementOccurrences(storedMeasurementOccurrences);
      setCarePlan(storedCarePlan);
      setAppointments(storedAppointments);
      setMeasurementPlan(storedPlan);
      setMealEvents(storedMeals);
    } finally { setIsLoading(false); }
  }, [db]);

  useEffect(() => {
    let active = true;
    void Promise.all([listMedications(db), listAppointments(db), getMeasurementPlan(db), getCarePlan(db), listMealEvents(db)]).then(async ([storedMedications, storedAppointments, storedPlan, storedCarePlan, storedMeals]) => {
      await refreshNotificationSchedules(db).catch(() => undefined);
      const [reconciledMedications, reconciledAppointments] = await Promise.all([listMedications(db), listAppointments(db)]);
      await ensureTodaysMedicationOccurrences(db, reconciledMedications);
      const storedOccurrences = await listTodaysMedicationOccurrences(db);
      await ensureTodaysMeasurementOccurrences(db, storedPlan);
      const storedMeasurementOccurrences = await listTodaysMeasurementOccurrences(db);
      if (active) {
        setMedications(reconciledMedications);
        setMedicationOccurrences(storedOccurrences);
        setMeasurementOccurrences(storedMeasurementOccurrences);
        setCarePlan(storedCarePlan);
        setAppointments(reconciledAppointments);
        setMeasurementPlan(storedPlan);
        setMealEvents(storedMeals);
      }
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [db]);

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
    await insertMedication(db, medication);
    await refreshNotificationSchedules(db).catch(() => undefined);
    const stored = (await listMedications(db)).find((item) => item.id === medication.id) ?? medication;
    await ensureTodaysMedicationOccurrences(db, [stored]);
    setMedications(await listMedications(db));
    setMedicationOccurrences(await listTodaysMedicationOccurrences(db));
    return stored.reminderState;
  }, [db]);

  const updateMedication = useCallback(async (medicationId: string, input: NewMedication) => {
    const current = medications.find((item) => item.id === medicationId);
    if (!current) throw new Error('Medication not found.');
    const medication: Medication = { ...input, id: current.id, createdAt: current.createdAt, reminderState: 'unavailable' };
    await updateStoredMedication(db, medication);
    await refreshNotificationSchedules(db).catch(() => undefined);
    const stored = (await listMedications(db)).find((item) => item.id === medication.id) ?? medication;
    await ensureTodaysMedicationOccurrences(db, [stored]);
    setMedications(await listMedications(db));
    setMedicationOccurrences(await listTodaysMedicationOccurrences(db));
    return stored.reminderState;
  }, [db, medications]);

  const addAppointment = useCallback(async (input: NewAppointment) => {
    const appointment: Appointment = {
      ...input,
      id: newId(),
      createdAt: new Date().toISOString(),
      reminderState: 'unavailable',
    };
    await insertAppointment(db, appointment);
    await refreshNotificationSchedules(db).catch(() => undefined);
    const stored = (await listAppointments(db)).find((item) => item.id === appointment.id) ?? appointment;
    setAppointments(await listAppointments(db));
    return stored.reminderState;
  }, [db]);

  const updateAppointment = useCallback(async (appointmentId: string, input: NewAppointment) => {
    const current = appointments.find((item) => item.id === appointmentId);
    if (!current) throw new Error('Appointment not found.');
    const appointment: Appointment = {
      ...input,
      id: current.id,
      createdAt: current.createdAt,
      reminderState: 'unavailable',
    };
    await updateStoredAppointment(db, appointment);
    await refreshNotificationSchedules(db).catch(() => undefined);
    const stored = (await listAppointments(db)).find((item) => item.id === appointment.id) ?? appointment;
    setAppointments(await listAppointments(db));
    return stored.reminderState;
  }, [appointments, db]);

  const saveMeasurementPlan = useCallback(async (input: NewMeasurementPlan) => {
    const plan: MeasurementPlan = { id: 'default', ...input, updatedAt: new Date().toISOString() };
    await upsertMeasurementPlan(db, plan);
    await ensureTodaysMeasurementOccurrences(db, plan);
    await refreshNotificationSchedules(db).catch(() => undefined);
    setMeasurementPlan(plan);
    setMeasurementOccurrences(await listTodaysMeasurementOccurrences(db));
  }, [db]);

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
    await refreshNotificationSchedules(db).catch(() => undefined);
    setMeasurementOccurrences(await listTodaysMeasurementOccurrences(db, occurredAt));
  }, [db]);

  const markMedicationOccurrence = useCallback(async (occurrenceId: string, status: MedicationOccurrenceStatus) => {
    const updated = await recordMedicationOccurrence(db, occurrenceId, status);
    setMedicationOccurrences((current) => current.map((occurrence) => occurrence.id === updated.id ? updated : occurrence));
  }, [db]);

  const snoozeMedicationOccurrence = useCallback(async (occurrenceId: string) => {
    const occurrence = medicationOccurrences.find((item) => item.id === occurrenceId);
    const medication = occurrence ? medications.find((item) => item.id === occurrence.medicationId) : undefined;
    if (!medication) throw new Error('Medication not found.');
    const permission = await scheduleMedicationSnooze(medication).catch(() => 'unavailable' as const);
    const updated = await recordMedicationOccurrence(db, occurrenceId, 'snoozed');
    setMedicationOccurrences((current) => current.map((item) => item.id === updated.id ? updated : item));
    return permission;
  }, [db, medicationOccurrences, medications]);

  const markMeasurementOccurrence = useCallback(async (occurrenceId: string, status: MeasurementOccurrenceStatus) => {
    const updated = await recordMeasurementOccurrence(db, occurrenceId, status);
    setMeasurementOccurrences((current) => current.map((occurrence) => occurrence.id === updated.id ? updated : occurrence));
  }, [db]);

  const updateAppointmentStatus = useCallback(async (appointmentId: string, status: Appointment['status']) => {
    await updateStoredAppointmentStatus(db, appointmentId, status);
    await refreshNotificationSchedules(db).catch(() => undefined);
    setAppointments(await listAppointments(db));
  }, [db]);

  const value = useMemo(() => ({ medications, medicationOccurrences, measurementOccurrences, appointments, measurementPlan, carePlan, mealEvents, isLoading, addMedication, updateMedication, addAppointment, updateAppointment, saveMeasurementPlan, saveCarePlan, addMealEvent, markMedicationOccurrence, snoozeMedicationOccurrence, markMeasurementOccurrence, updateAppointmentStatus, refresh }), [medications, medicationOccurrences, measurementOccurrences, appointments, measurementPlan, carePlan, mealEvents, isLoading, addMedication, updateMedication, addAppointment, updateAppointment, saveMeasurementPlan, saveCarePlan, addMealEvent, markMedicationOccurrence, snoozeMedicationOccurrence, markMeasurementOccurrence, updateAppointmentStatus, refresh]);
  return <CareContext.Provider value={value}>{children}</CareContext.Provider>;
}

export function useCare() {
  const value = useContext(CareContext);
  if (!value) throw new Error('useCare must be used inside CareProvider');
  return value;
}
