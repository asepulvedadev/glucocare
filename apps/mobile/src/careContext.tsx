import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { insertMedication, listMedications, updateMedicationReminder } from './db/careRepository';
import { insertAppointment, listAppointments, updateAppointmentReminder, updateAppointmentStatus as updateStoredAppointmentStatus } from './db/appointmentsRepository';
import { getMeasurementPlan, upsertMeasurementPlan } from './db/measurementRepository';
import { getCarePlan, upsertCarePlan } from './db/carePlanRepository';
import { ensureTodaysMedicationOccurrences, listTodaysMedicationOccurrences, recordMedicationOccurrence } from './db/medicationOccurrenceRepository';
import { ensureTodaysMeasurementOccurrences, listTodaysMeasurementOccurrences, recordMeasurementOccurrence } from './db/measurementOccurrenceRepository';
import { cancelReminder, reconcileAppointmentReminder, reconcileMedicationReminder, scheduleAppointmentReminder, scheduleMedicationSnooze, scheduleMedicationReminder, type ReminderPermission } from './notifications';
import type { Medication, NewMedication } from './types/care';
import type { Appointment, NewAppointment } from './types/appointments';
import type { MeasurementPlan, NewMeasurementPlan } from './types/measurement';
import type { MedicationOccurrence, MedicationOccurrenceStatus } from './types/medicationOccurrences';
import type { MeasurementOccurrence, MeasurementOccurrenceStatus } from './types/measurementOccurrences';
import type { CarePlan, NewCarePlan } from './types/carePlan';
import { newId } from './ids';

type CareContextValue = {
  medications: Medication[];
  medicationOccurrences: MedicationOccurrence[];
  measurementOccurrences: MeasurementOccurrence[];
  appointments: Appointment[];
  measurementPlan: MeasurementPlan | null;
  carePlan: CarePlan | null;
  isLoading: boolean;
  addMedication: (input: NewMedication) => Promise<ReminderPermission>;
  addAppointment: (input: NewAppointment) => Promise<ReminderPermission>;
  saveMeasurementPlan: (input: NewMeasurementPlan) => Promise<void>;
  saveCarePlan: (input: NewCarePlan) => Promise<void>;
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
  const [isLoading, setIsLoading] = useState(true);

  const reconcileStoredReminders = useCallback(async (storedMedications: Medication[], storedAppointments: Appointment[]) => {
    const [medicationResults, appointmentResults] = await Promise.all([
      Promise.all(storedMedications.filter((medication) => medication.enabled).map(async (medication) => ({ medication, scheduled: await reconcileMedicationReminder(medication) }))),
      Promise.all(storedAppointments.map(async (appointment) => ({ appointment, scheduled: await reconcileAppointmentReminder(appointment) }))),
    ]);
    const updatedMedications = storedMedications.map((medication) => {
      const result = medicationResults.find((item) => item.medication.id === medication.id);
      if (!result) return medication;
      const next = { ...medication, notificationId: result.scheduled.notificationId, reminderState: result.scheduled.state === 'granted' ? 'scheduled' as const : result.scheduled.state };
      if (next.reminderState !== medication.reminderState || next.notificationId !== medication.notificationId) void updateMedicationReminder(db, medication.id, next.reminderState, next.notificationId);
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
      const [storedMedications, storedAppointments, storedPlan, storedCarePlan] = await Promise.all([listMedications(db), listAppointments(db), getMeasurementPlan(db), getCarePlan(db)]);
      const reconciled = await reconcileStoredReminders(storedMedications, storedAppointments);
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
    } finally { setIsLoading(false); }
  }, [db, reconcileStoredReminders]);

  useEffect(() => {
    let active = true;
    void Promise.all([listMedications(db), listAppointments(db), getMeasurementPlan(db), getCarePlan(db)]).then(async ([storedMedications, storedAppointments, storedPlan, storedCarePlan]) => {
      const reconciled = await reconcileStoredReminders(storedMedications, storedAppointments);
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
      }
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [db, reconcileStoredReminders]);

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
      reminderState: scheduled.state === 'granted' ? 'scheduled' : scheduled.state,
    };
    await insertMedication(db, stored);
    await ensureTodaysMedicationOccurrences(db, [stored]);
    setMedications((current) => [...current, stored].sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute)));
    setMedicationOccurrences(await listTodaysMedicationOccurrences(db));
    return scheduled.state;
  }, [db]);

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

  const saveMeasurementPlan = useCallback(async (input: NewMeasurementPlan) => {
    const plan: MeasurementPlan = { id: 'default', ...input, updatedAt: new Date().toISOString() };
    await upsertMeasurementPlan(db, plan);
    await ensureTodaysMeasurementOccurrences(db, plan);
    setMeasurementPlan(plan);
    setMeasurementOccurrences(await listTodaysMeasurementOccurrences(db));
  }, [db]);

  const saveCarePlan = useCallback(async (input: NewCarePlan) => {
    const plan: CarePlan = { id: 'default', ...input, updatedAt: new Date().toISOString() };
    await upsertCarePlan(db, plan);
    setCarePlan(plan);
  }, [db]);

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

  const value = useMemo(() => ({ medications, medicationOccurrences, measurementOccurrences, appointments, measurementPlan, carePlan, isLoading, addMedication, addAppointment, saveMeasurementPlan, saveCarePlan, markMedicationOccurrence, snoozeMedicationOccurrence, markMeasurementOccurrence, updateAppointmentStatus, refresh }), [medications, medicationOccurrences, measurementOccurrences, appointments, measurementPlan, carePlan, isLoading, addMedication, addAppointment, saveMeasurementPlan, saveCarePlan, markMedicationOccurrence, snoozeMedicationOccurrence, markMeasurementOccurrence, updateAppointmentStatus, refresh]);
  return <CareContext.Provider value={value}>{children}</CareContext.Provider>;
}

export function useCare() {
  const value = useContext(CareContext);
  if (!value) throw new Error('useCare must be used inside CareProvider');
  return value;
}
