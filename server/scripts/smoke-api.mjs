const baseUrl = process.env.API_URL ?? 'http://127.0.0.1:18084';

async function call(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'synthetic-smoke-password';
const first = await call('/v1/auth/signup', { method: 'POST', body: JSON.stringify({ email: `smoke-${suffix}@example.invalid`, password }) });
const second = await call('/v1/auth/signup', { method: 'POST', body: JSON.stringify({ email: `other-${suffix}@example.invalid`, password }) });
const eventId = crypto.randomUUID();
const entityId = crypto.randomUUID();
const event = { eventId, eventType: 'glucose.reading.recorded.v1', entityType: 'glucose_reading', entityId, payload: { value: 120, unit: 'mg/dL', recordedAt: new Date().toISOString(), context: 'fasting' } };
const accepted = await call('/v1/sync/events', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}`, 'idempotency-key': eventId }, body: JSON.stringify(event) });
if (accepted.status !== 'accepted') throw new Error(`expected accepted event, got ${accepted.status}`);
const repeated = await call('/v1/sync/events', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify(event) });
if (repeated.status !== 'already_accepted') throw new Error(`expected idempotent replay, got ${repeated.status}`);
const own = await call('/v1/sync?since=1970-01-01T00:00:00.000Z', { headers: { authorization: `Bearer ${first.session.accessToken}` } });
if (!own.records.some((record) => record.entity_id === entityId)) throw new Error('owner cannot read its own record');
const other = await call('/v1/sync?since=1970-01-01T00:00:00.000Z', { headers: { authorization: `Bearer ${second.session.accessToken}` } });
if (other.records.some((record) => record.entity_id === entityId)) throw new Error('cross-patient record leaked');
const contactId = crypto.randomUUID();
const contactEventId = crypto.randomUUID();
await call('/v1/sync/events', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({
  eventId: contactEventId,
  eventType: 'trusted_contact.created.v1',
  entityType: 'trusted_contact',
  entityId: contactId,
  payload: { id: contactId, name: 'Synthetic contact', phone: '+10000000000', updatedAt: new Date().toISOString() },
}) });
const incidentId = crypto.randomUUID();
const alert = await call('/v1/emergency-alerts', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({ incidentId, contactIds: [contactId], channels: ['sms'] }) });
if (alert.status !== 'queued' || alert.deliveries[0]?.status !== 'not_configured') throw new Error('alert was not queued honestly');
const deliveries = await call(`/v1/emergency-alerts/${incidentId}/deliveries`, { headers: { authorization: `Bearer ${first.session.accessToken}` } });
if (deliveries.deliveries.length !== 1) throw new Error('expected one alert delivery');
console.log('api-smoke=passed');
