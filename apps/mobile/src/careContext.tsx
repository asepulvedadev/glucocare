import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { insertMedication, listMedications } from './db/careRepository';
import { insertAppointment, listAppointments } from './db/appointmentsRepository';
import { getMeasurementPlan, upsertMeasurementPlan } from './db/measurementRepository';
import { scheduleAppointmentReminder, scheduleMedicationReminder, type ReminderPermission } from './notifications';
import type { Medication, NewMedication } from './types/care';
import type { Appointment, NewAppointment } from './types/appointments';
import type { MeasurementPlan, NewMeasurementPlan } from './types/measurement';
import { newId } from './ids';

type CareContextValue = {
  medications: Medication[];
  appointments: Appointment[];
  measurementPlan: MeasurementPlan | null;
  isLoading: boolean;
  addMedication: (input: NewMedication) => Promise<ReminderPermission>;
  addAppointment: (input: NewAppointment) => Promise<ReminderPermission>;
  saveMeasurementPlan: (input: NewMeasurementPlan) => Promise<void>;
  refresh: () => Promise<void>;
};

const CareContext = createContext<CareContextValue | null>(null);

export function CareProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [measurementPlan, setMeasurementPlan] = useState<MeasurementPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [storedMedications, storedAppointments, storedPlan] = await Promise.all([listMedications(db), listAppointments(db), getMeasurementPlan(db)]);
      setMedications(storedMedications);
      setAppointments(storedAppointments);
      setMeasurementPlan(storedPlan);
    } finally { setIsLoading(false); }
  }, [db]);

  useEffect(() => {
    let active = true;
    void Promise.all([listMedications(db), listAppointments(db), getMeasurementPlan(db)]).then(([storedMedications, storedAppointments, storedPlan]) => {
      if (active) {
        setMedications(storedMedications);
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
    setMedications((current) => [...current, stored].sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute)));
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
    setMeasurementPlan(plan);
  }, [db]);

  const value = useMemo(() => ({ medications, appointments, measurementPlan, isLoading, addMedication, addAppointment, saveMeasurementPlan, refresh }), [medications, appointments, measurementPlan, isLoading, addMedication, addAppointment, saveMeasurementPlan, refresh]);
  return <CareContext.Provider value={value}>{children}</CareContext.Provider>;
}

export function useCare() {
  const value = useContext(CareContext);
  if (!value) throw new Error('useCare must be used inside CareProvider');
  return value;
}
