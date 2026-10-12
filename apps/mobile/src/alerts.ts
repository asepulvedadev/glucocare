import { supabase } from './supabase';

export type EmergencyAlertResult = { alertId: string; status: 'queued'; deliveries: { contactId: string; channel: string; status: string }[] };
export type EmergencyDelivery = { id: string; contactId: string; channel: string; status: string; queuedAt: string; deliveredAt?: string; failureCode?: string };

export async function queueEmergencyAlert(input: { incidentId: string; contactIds: string[]; timezone: string; channels: ('email' | 'sms' | 'push' | 'voice')[] }): Promise<EmergencyAlertResult | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke<EmergencyAlertResult>('emergency-alert', { body: { ...input, share: { eventType: true, location: false, glucoseValue: false } } });
  if (error) throw error;
  return data;
}

export async function getEmergencyAlertDeliveries(incidentId: string): Promise<EmergencyDelivery[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('alert_deliveries')
    .select('id,contact_id,channel,status,queued_at,delivered_at,failure_code')
    .eq('incident_id', incidentId)
    .order('queued_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((delivery) => ({
    id: delivery.id,
    contactId: delivery.contact_id,
    channel: delivery.channel,
    status: delivery.status,
    queuedAt: delivery.queued_at,
    deliveredAt: delivery.delivered_at ?? undefined,
    failureCode: delivery.failure_code ?? undefined,
  }));
}
