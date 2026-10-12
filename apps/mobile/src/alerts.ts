import { cloudApi } from './cloudApi';

export type EmergencyAlertResult = { alertId: string; status: 'queued'; deliveries: { contactId: string; channel: string; status: string }[] };
export type EmergencyDelivery = { id: string; contactId: string; channel: string; status: string; queuedAt: string; deliveredAt?: string; failureCode?: string };

export async function queueEmergencyAlert(input: { incidentId: string; contactIds: string[]; timezone: string; channels: ('email' | 'sms' | 'push' | 'voice')[] }): Promise<EmergencyAlertResult | null> {
  const session = await cloudApi.getStoredSession();
  if (!session) return null;
  return cloudApi.queueEmergencyAlert(input, session);
}

export async function getEmergencyAlertDeliveries(incidentId: string): Promise<EmergencyDelivery[]> {
  const session = await cloudApi.getStoredSession();
  if (!session) return [];
  return cloudApi.getEmergencyAlertDeliveries(incidentId, session);
}
