import type { AppointmentStatus } from '../types/appointments';

const transitions: Record<AppointmentStatus, AppointmentStatus[]> = {
  requested: ['pending_authorization', 'cancelled'],
  pending_authorization: ['authorized', 'cancelled'],
  authorized: ['scheduled', 'cancelled'],
  scheduled: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransitionAppointment(from: AppointmentStatus, to: AppointmentStatus) {
  return transitions[from].includes(to);
}

export function availableAppointmentTransitions(from: AppointmentStatus) {
  return [...transitions[from]];
}

export function transitionAppointment(from: AppointmentStatus, to: AppointmentStatus) {
  if (!canTransitionAppointment(from, to)) throw new Error(`Invalid appointment transition: ${from} -> ${to}`);
  return to;
}
