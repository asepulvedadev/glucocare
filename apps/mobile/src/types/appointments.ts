export type AppointmentStatus = 'requested' | 'pending_authorization' | 'authorized' | 'scheduled' | 'completed' | 'missed' | 'denied' | 'cancelled';
export type AppointmentReminderState = 'scheduled' | 'scheduled_limited' | 'permission_denied' | 'unavailable';

export type Appointment = {
  id: string;
  title: string;
  provider: string;
  specialty?: string;
  insurer?: string;
  authorizationNumber?: string;
  facility?: string;
  scheduledAt: string;
  requestedAt?: string;
  status: AppointmentStatus;
  location?: string;
  virtualUrl?: string;
  preparationNotes?: string;
  notes?: string;
  reminderState: AppointmentReminderState;
  notificationId?: string;
  createdAt: string;
};

export type NewAppointment = Omit<Appointment, 'id' | 'notificationId' | 'createdAt' | 'reminderState'>;

export const appointmentStatusLabel: Record<AppointmentStatus, string> = {
  requested: 'Por solicitar',
  pending_authorization: 'Por autorizar',
  authorized: 'Autorizada',
  scheduled: 'Agendada',
  completed: 'Completada',
  missed: 'No asistida',
  denied: 'No autorizada',
  cancelled: 'Cancelada',
};
