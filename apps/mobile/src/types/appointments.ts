export type AppointmentStatus = 'requested' | 'pending_authorization' | 'authorized' | 'scheduled' | 'completed' | 'cancelled';
export type AppointmentReminderState = 'scheduled' | 'permission_denied' | 'unavailable';

export type Appointment = {
  id: string;
  title: string;
  provider: string;
  scheduledAt: string;
  status: AppointmentStatus;
  location?: string;
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
  cancelled: 'Cancelada',
};
