type Contact = { email?: string | null; phone?: string | null; name?: string | null };

export type AlertChannel = 'email' | 'sms' | 'push' | 'voice';
export type ProviderResult = { providerMessageId: string };

const resendKey = process.env.RESEND_API_KEY?.trim();
const resendFrom = process.env.RESEND_FROM?.trim();
const twilioSid = process.env.TWILIO_ACCOUNT_SID?.trim();
const twilioToken = process.env.TWILIO_AUTH_TOKEN?.trim();
const twilioFrom = process.env.TWILIO_FROM?.trim();

export function isAlertChannelConfigured(channel: AlertChannel) {
  if (channel === 'email') return Boolean(resendKey && resendFrom);
  if (channel === 'sms') return Boolean(twilioSid && twilioToken && twilioFrom);
  return false;
}

function messageFor(contact: Contact, incidentId: string) {
  const name = contact.name?.trim() || 'Tu contacto';
  return `${name} registró una solicitud de ayuda en GlucoCare (incidente ${incidentId}). Comunícate directamente con esa persona y, si hay peligro inmediato, llama a emergencias.`;
}

async function responseId(response: Response) {
  const body = await response.text();
  if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const id = record.id ?? record.sid;
      if (typeof id === 'string' && id) return id;
    }
  } catch { /* Providers may return an empty success body. */ }
  return `accepted-${Date.now()}`;
}

async function sendEmail(contact: Contact, incidentId: string): Promise<ProviderResult> {
  if (!isAlertChannelConfigured('email') || !contact.email) throw new Error('PROVIDER_NOT_CONFIGURED');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: resendFrom,
      to: [contact.email],
      subject: 'Solicitud de ayuda de GlucoCare',
      text: messageFor(contact, incidentId),
    }),
  });
  return { providerMessageId: await responseId(response) };
}

async function sendSms(contact: Contact, incidentId: string): Promise<ProviderResult> {
  if (!isAlertChannelConfigured('sms') || !contact.phone) throw new Error('PROVIDER_NOT_CONFIGURED');
  const basic = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
  const body = new URLSearchParams({ To: contact.phone, From: twilioFrom!, Body: messageFor(contact, incidentId) });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilioSid!)}/Messages.json`, {
    method: 'POST',
    headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  return { providerMessageId: await responseId(response) };
}

export async function sendAlert(channel: AlertChannel, contact: Contact, incidentId: string) {
  if (channel === 'email') return sendEmail(contact, incidentId);
  if (channel === 'sms') return sendSms(contact, incidentId);
  throw new Error('PROVIDER_NOT_CONFIGURED');
}
