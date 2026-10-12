import { supabase } from './supabase';

export type EmergencyAlertResult = { alertId: string; status: 'queued'; deliveries: { contactId: string; channel: string; status: string }[] };

export async function queueEmergencyAlert(input: { incidentId: string; contactIds: string[]; timezone: string; channels: ('email' | 'sms' | 'push' | 'voice')[] }): Promise<EmergencyAlertResult | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke<EmergencyAlertResult>('emergency-alert', { body: { ...input, share: { eventType: true, location: false, glucoseValue: false } } });
  if (error) throw error;
  return data;
}
