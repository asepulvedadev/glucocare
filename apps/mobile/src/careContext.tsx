import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { insertMedication, listMedications } from './db/careRepository';
import { insertAppointment, listAppointments } from './db/appointmentsRepository';
import { scheduleAppointmentReminder, scheduleMedicationReminder, type ReminderPermission } from './notifications';
import type { Medication, NewMedication } from './types/care';
import type { Appointment, NewAppointment } from './types/appointments';

type CareContextValue = {
  medications: Medication[];
  appointments: Appointment[];
  isLoading: boolean;
  addMedication: (input: NewMedication) => Promise<ReminderPermission>;
  addAppointment: (input: NewAppointment) => Promise<ReminderPermission>;
  refresh: () => Promise<void>;
};

const CareContext = createContext<CareContextValue | null>(null);

export function CareProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [storedMedications, storedAppointments] = await Promise.all([listMedications(db), listAppointments(db)]);
      setMedications(storedMedications);
      setAppointments(storedAppointments);
    } finally { setIsLoading(false); }
  }, [db]);

  useEffect(() => {
    let active = true;
    void Promise.all([listMedications(db), listAppointments(db)]).then(([storedMedications, storedAppointments]) => {
      if (active) {
        setMedications(storedMedications);
        setAppointments(storedAppointments);
      }
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [db]);

  const addMedication = useCallback(async (input: NewMedication) => {
    const medication: Medication = {
      ...input,
      id: `medication_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
      id: `appointment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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

  const value = useMemo(() => ({ medications, appointments, isLoading, addMedication, addAppointment, refresh }), [medications, appointments, isLoading, addMedication, addAppointment, refresh]);
  return <CareContext.Provider value={value}>{children}</CareContext.Provider>;
}

export function useCare() {
  const value = useContext(CareContext);
  if (!value) throw new Error('useCare must be used inside CareProvider');
  return value;
}
