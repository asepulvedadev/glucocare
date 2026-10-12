const baseUrl = process.env.API_URL ?? 'http://127.0.0.1:18084';

async function call(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = ['synthetic', 'smoke', 'password'].join('-');
const first = await call('/v1/auth/signup', { method: 'POST', body: JSON.stringify({ email: `smoke-${suffix}@example.invalid`, password }) });
const second = await call('/v1/auth/signup', { method: 'POST', body: JSON.stringify({ email: `other-${suffix}@example.invalid`, password }) });
const eventId = crypto.randomUUID();
const entityId = crypto.randomUUID();
const initialRecordedAt = new Date(Date.now() - 3_000).toISOString();
const event = { eventId, eventType: 'glucose.reading.recorded.v1', entityType: 'glucose_reading', entityId, payload: { value: 120, unit: 'mg/dL', recordedAt: initialRecordedAt, context: 'fasting' } };
const accepted = await call('/v1/sync/events', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}`, 'idempotency-key': eventId }, body: JSON.stringify(event) });
if (accepted.status !== 'accepted') throw new Error(`expected accepted event, got ${accepted.status}`);
const repeated = await call('/v1/sync/events', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify(event) });
if (repeated.status !== 'already_accepted') throw new Error(`expected idempotent replay, got ${repeated.status}`);
const conflict = await fetch(`${baseUrl}/v1/sync/events`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({ ...event, payload: { ...event.payload, value: 121 } }) });
if (conflict.status !== 409) throw new Error(`expected idempotency conflict, got ${conflict.status}`);
const newerPayload = { ...event.payload, value: 125, updatedAt: new Date(Date.now() - 500).toISOString() };
await call('/v1/sync/events', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({ eventId: crypto.randomUUID(), eventType: 'glucose.reading.corrected.v1', entityType: 'glucose_reading', entityId, payload: newerPayload }) });
const olderPayload = { ...event.payload, value: 118, updatedAt: new Date(Date.now() - 2_000).toISOString() };
await call('/v1/sync/events', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({ eventId: crypto.randomUUID(), eventType: 'glucose.reading.corrected.v1', entityType: 'glucose_reading', entityId, payload: olderPayload }) });
const own = await call('/v1/sync?since=1970-01-01T00:00:00.000Z', { headers: { authorization: `Bearer ${first.session.accessToken}` } });
const ownReading = own.records.find((record) => record.entity_id === entityId);
if (!ownReading) throw new Error('owner cannot read its own record');
if (ownReading.payload.value !== 125) throw new Error(`stale event regressed projection: ${JSON.stringify(ownReading.payload)}`);
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
const emailContactId = crypto.randomUUID();
await call('/v1/sync/events', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({
  eventId: crypto.randomUUID(),
  eventType: 'trusted_contact.created.v1',
  entityType: 'trusted_contact',
  entityId: emailContactId,
  payload: { id: emailContactId, name: 'Email contact', email: 'email-contact@example.invalid', updatedAt: new Date().toISOString() },
}) });
const incidentId = crypto.randomUUID();
const blockedAlert = await fetch(`${baseUrl}/v1/emergency-alerts`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({ incidentId, contactIds: [contactId, emailContactId], channels: ['sms', 'email'] }) });
if (blockedAlert.status !== 400) throw new Error('unaccepted contact was allowed to receive an alert');
const invitation = await call('/v1/contact-invitations', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({ contactId, channel: 'email' }) });
const acceptedInvitation = new URL(invitation.acceptUrl);
const invitationAcceptance = await call(`${acceptedInvitation.pathname}${acceptedInvitation.search}`);
if (invitationAcceptance.status !== 'accepted') throw new Error('invitation was not accepted');
const emailInvitation = await call('/v1/contact-invitations', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({ contactId: emailContactId, channel: 'email' }) });
const emailInvitationUrl = new URL(emailInvitation.acceptUrl);
await call(`${emailInvitationUrl.pathname}${emailInvitationUrl.search}`);
const alert = await call('/v1/emergency-alerts', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({ incidentId, contactIds: [contactId, emailContactId], channels: ['sms', 'email'] }) });
if (alert.status !== 'queued' || alert.deliveries.length !== 2 || !alert.deliveries.every((delivery) => delivery.status === 'queued')) throw new Error('alert was not queued honestly per contact channel');
const replayedAlert = await call('/v1/emergency-alerts', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({ incidentId, contactIds: [contactId, emailContactId], channels: ['sms', 'email'] }) });
if (replayedAlert.alertId !== alert.alertId || replayedAlert.deliveries.length !== 2 || replayedAlert.deliveries.some((delivery) => delivery.status !== 'queued')) throw new Error('alert replay was not idempotent');
const alertConflict = await fetch(`${baseUrl}/v1/emergency-alerts`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({ incidentId, contactIds: [contactId, emailContactId], channels: ['email'] }) });
if (alertConflict.status !== 409) throw new Error('alert incident accepted a different delivery set');
const deliveries = await call(`/v1/emergency-alerts/${incidentId}/deliveries`, { headers: { authorization: `Bearer ${first.session.accessToken}` } });
if (deliveries.deliveries.length !== 2) throw new Error('expected one delivery per available contact channel');
const revokedContactId = crypto.randomUUID();
await call('/v1/sync/events', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({
  eventId: crypto.randomUUID(),
  eventType: 'trusted_contact.created.v1',
  entityType: 'trusted_contact',
  entityId: revokedContactId,
  payload: { id: revokedContactId, name: 'Revoked contact', phone: '+10000000001', updatedAt: new Date().toISOString() },
}) });
const revokedInvitation = await call('/v1/contact-invitations', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({ contactId: revokedContactId, channel: 'sms' }) });
const revokedInvitationUrl = new URL(revokedInvitation.acceptUrl);
await call(`${revokedInvitationUrl.pathname}${revokedInvitationUrl.search}`);
await call('/v1/sync/events', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({
  eventId: crypto.randomUUID(),
  eventType: 'contact.revoked.v1',
  entityType: 'trusted_contact',
  entityId: revokedContactId,
  payload: { id: revokedContactId, revoked: true, updatedAt: new Date().toISOString() },
}) });
const revokedAlert = await fetch(`${baseUrl}/v1/emergency-alerts`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({ incidentId: crypto.randomUUID(), contactIds: [revokedContactId], channels: ['sms'] }) });
if (revokedAlert.status !== 400) throw new Error('revoked contact remained eligible for an alert');
const deletion = await fetch(`${baseUrl}/v1/account`, { method: 'DELETE', headers: { authorization: `Bearer ${second.session.accessToken}` } });
if (deletion.status !== 204) throw new Error(`account deletion returned ${deletion.status}`);
const deletedSession = await fetch(`${baseUrl}/v1/sync?since=1970-01-01T00:00:00.000Z`, { headers: { authorization: `Bearer ${second.session.accessToken}` } });
if (deletedSession.status !== 401) throw new Error('deleted account session remained usable');
console.log('api-smoke=passed');
