import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { insertMedication, listMedications } from './db/careRepository';
import { insertAppointment, listAppointments, updateAppointmentStatus as updateStoredAppointmentStatus } from './db/appointmentsRepository';
import { getMeasurementPlan, upsertMeasurementPlan } from './db/measurementRepository';
import { getCarePlan, upsertCarePlan } from './db/carePlanRepository';
import { ensureTodaysMedicationOccurrences, listTodaysMedicationOccurrences, recordMedicationOccurrence } from './db/medicationOccurrenceRepository';
import { ensureTodaysMeasurementOccurrences, listTodaysMeasurementOccurrences, recordMeasurementOccurrence } from './db/measurementOccurrenceRepository';
import { cancelReminder, scheduleAppointmentReminder, scheduleMedicationReminder, type ReminderPermission } from './notifications';
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

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [storedMedications, storedAppointments, storedPlan, storedCarePlan] = await Promise.all([listMedications(db), listAppointments(db), getMeasurementPlan(db), getCarePlan(db)]);
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
    } finally { setIsLoading(false); }
  }, [db]);

  useEffect(() => {
    let active = true;
    void Promise.all([listMedications(db), listAppointments(db), getMeasurementPlan(db), getCarePlan(db)]).then(async ([storedMedications, storedAppointments, storedPlan, storedCarePlan]) => {
      await ensureTodaysMedicationOccurrences(db, storedMedications);
      const storedOccurrences = await listTodaysMedicationOccurrences(db);
      await ensureTodaysMeasurementOccurrences(db, storedPlan);
      const storedMeasurementOccurrences = await listTodaysMeasurementOccurrences(db);
      if (active) {
        setMedications(storedMedications);
        setMedicationOccurrences(storedOccurrences);
        setMeasurementOccurrences(storedMeasurementOccurrences);
        setCarePlan(storedCarePlan);
        setAppointments(storedAppointments);
        setMeasurementPlan(storedPlan);
      }
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [db]);

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

  const markMeasurementOccurrence = useCallback(async (occurrenceId: string, status: MeasurementOccurrenceStatus) => {
    const updated = await recordMeasurementOccurrence(db, occurrenceId, status);
    setMeasurementOccurrences((current) => current.map((occurrence) => occurrence.id === updated.id ? updated : occurrence));
  }, [db]);

  const updateAppointmentStatus = useCallback(async (appointmentId: string, status: Appointment['status']) => {
    const updated = await updateStoredAppointmentStatus(db, appointmentId, status);
    if (status === 'completed' || status === 'cancelled') await cancelReminder(updated.notificationId);
    setAppointments((current) => current.map((appointment) => appointment.id === updated.id ? updated : appointment));
  }, [db]);

  const value = useMemo(() => ({ medications, medicationOccurrences, measurementOccurrences, appointments, measurementPlan, carePlan, isLoading, addMedication, addAppointment, saveMeasurementPlan, saveCarePlan, markMedicationOccurrence, markMeasurementOccurrence, updateAppointmentStatus, refresh }), [medications, medicationOccurrences, measurementOccurrences, appointments, measurementPlan, carePlan, isLoading, addMedication, addAppointment, saveMeasurementPlan, saveCarePlan, markMedicationOccurrence, markMeasurementOccurrence, updateAppointmentStatus, refresh]);
  return <CareContext.Provider value={value}>{children}</CareContext.Provider>;
}

export function useCare() {
  const value = useContext(CareContext);
  if (!value) throw new Error('useCare must be used inside CareProvider');
  return value;
}
