import { createHmac } from 'node:crypto';

const baseUrl = process.env.API_URL ?? 'http://127.0.0.1:18084';
const expectedSmsInvitationStatus = process.env.EXPECTED_SMS_INVITATION_STATUS ?? 'not_configured';
const expectedEmailInvitationStatus = process.env.EXPECTED_EMAIL_INVITATION_STATUS ?? 'not_configured';

async function call(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = ['synthetic', 'smoke', 'password'].join('-');
const firstEmail = `smoke-${suffix}@example.invalid`;
const first = await call('/v1/auth/signup', { method: 'POST', body: JSON.stringify({ email: firstEmail, password }) });
// A second session for the same patient represents another device. The VPS
// projection must remain patient-scoped while stale events cannot regress it.
const firstDeviceTwo = await call('/v1/auth/signin', { method: 'POST', body: JSON.stringify({ email: firstEmail, password }) });
const second = await call('/v1/auth/signup', { method: 'POST', body: JSON.stringify({ email: `other-${suffix}@example.invalid`, password }) });
const anonymousSync = await fetch(`${baseUrl}/v1/sync?since=1970-01-01T00:00:00.000Z`);
if (anonymousSync.status !== 401) throw new Error(`anonymous sync returned ${anonymousSync.status}`);
const invalidMedication = await fetch(`${baseUrl}/v1/sync/events`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({
  eventId: crypto.randomUUID(), eventType: 'medication.created.v1', entityType: 'medication', entityId: crypto.randomUUID(),
  payload: { id: crypto.randomUUID(), name: 'Invalid', schedule: { kind: 'interval', anchorTime: '25:00', intervalHours: 0 } },
}) });
if (invalidMedication.status !== 400) throw new Error(`invalid medication schedule returned ${invalidMedication.status}`);
const invalidEventType = await fetch(`${baseUrl}/v1/sync/events`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({
  eventId: crypto.randomUUID(), eventType: 'not valid', entityType: 'glucose_reading', entityId: crypto.randomUUID(), payload: { value: 120, unit: 'mg/dL' },
}) });
if (invalidEventType.status !== 400) throw new Error(`invalid event type returned ${invalidEventType.status}`);
const mismatchedEntity = await fetch(`${baseUrl}/v1/sync/events`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({
  eventId: crypto.randomUUID(), eventType: 'glucose.reading.recorded.v1', entityType: 'glucose_reading', entityId: crypto.randomUUID(),
  payload: { id: crypto.randomUUID(), value: 120, unit: 'mg/dL', recordedAt: new Date().toISOString(), context: 'fasting' },
}) });
if (mismatchedEntity.status !== 400) throw new Error(`mismatched entity identity returned ${mismatchedEntity.status}`);
const invalidGlucoseValue = await fetch(`${baseUrl}/v1/sync/events`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({
  eventId: crypto.randomUUID(), eventType: 'glucose.reading.recorded.v1', entityType: 'glucose_reading', entityId: crypto.randomUUID(),
  payload: { value: 1001, unit: 'mg/dL', recordedAt: new Date().toISOString(), context: 'fasting' },
}) });
if (invalidGlucoseValue.status !== 400) throw new Error(`invalid glucose value returned ${invalidGlucoseValue.status}`);
const invalidCanonicalValue = await fetch(`${baseUrl}/v1/sync/events`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({
  eventId: crypto.randomUUID(), eventType: 'glucose.reading.recorded.v1', entityType: 'glucose_reading', entityId: crypto.randomUUID(),
  payload: { value: 100, unit: 'mmol/L', valueMgDl: 100, recordedAt: new Date().toISOString(), context: 'fasting' },
}) });
if (invalidCanonicalValue.status !== 400) throw new Error(`invalid glucose conversion returned ${invalidCanonicalValue.status}`);
const invalidRiskRule = await fetch(`${baseUrl}/v1/sync/events`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({
  eventId: crypto.randomUUID(), eventType: 'glucose.reading.recorded.v1', entityType: 'glucose_reading', entityId: crypto.randomUUID(),
  payload: { value: 120, unit: 'mg/dL', recordedAt: new Date().toISOString(), context: 'fasting', riskClassification: 'urgent', riskRuleId: 'unsafe rule' },
}) });
if (invalidRiskRule.status !== 400) throw new Error(`invalid glucose risk metadata returned ${invalidRiskRule.status}`);
const invalidNestedCorrection = await fetch(`${baseUrl}/v1/sync/events`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({
  eventId: crypto.randomUUID(), eventType: 'glucose.reading.corrected.v1', entityType: 'glucose_reading', entityId: crypto.randomUUID(),
  payload: { before: { value: 120, unit: 'mg/dL' }, after: { value: 100, unit: 'mmol/L', valueMgDl: 100 } },
}) });
if (invalidNestedCorrection.status !== 400) throw new Error(`invalid nested glucose correction returned ${invalidNestedCorrection.status}`);
const acceptedMmolBoundary = await call('/v1/sync/events', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({
  eventId: crypto.randomUUID(), eventType: 'glucose.reading.recorded.v1', entityType: 'glucose_reading', entityId: crypto.randomUUID(),
  payload: { value: 1000, unit: 'mmol/L', valueMgDl: 18018.2, recordedAt: new Date().toISOString(), context: 'other' },
}) });
if (acceptedMmolBoundary.status !== 'accepted') throw new Error('valid mmol/L canonical boundary was rejected');
const callbackPayload = JSON.stringify({ providerMessageId: `unknown-${suffix}`, status: 'delivered' });
const callbackHeaders = { 'content-type': 'application/json' };
const callbackSecret = process.env.PROVIDER_CALLBACK_SECRET?.trim();
if (callbackSecret) callbackHeaders['x-glucocare-callback-signature'] = createHmac('sha256', callbackSecret).update(callbackPayload).digest('hex');
const callbackResponse = await fetch(`${baseUrl}/v1/internal/provider-callback`, { method: 'POST', headers: callbackHeaders, body: callbackPayload });
if (callbackSecret ? callbackResponse.status !== 202 : callbackResponse.status !== 503) throw new Error(`unexpected provider callback status: ${callbackResponse.status}`);
if (callbackSecret) {
  const invalidCallback = await fetch(`${baseUrl}/v1/internal/provider-callback`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-glucocare-callback-signature': '00'.repeat(32) }, body: callbackPayload });
  if (invalidCallback.status !== 401) throw new Error(`invalid callback signature returned ${invalidCallback.status}`);
}
const eventId = crypto.randomUUID();
const entityId = crypto.randomUUID();
const initialRecordedAt = new Date(Date.now() - 3_000).toISOString();
const event = { eventId, eventType: 'glucose.reading.recorded.v1', entityType: 'glucose_reading', entityId, payload: { value: 120, unit: 'mg/dL', recordedAt: initialRecordedAt, context: 'fasting', riskClassification: 'in_range', riskRuleId: 'care-plan.in-range', riskPlanUpdatedAt: initialRecordedAt } };
const accepted = await call('/v1/sync/events', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}`, 'idempotency-key': eventId }, body: JSON.stringify(event) });
if (accepted.status !== 'accepted') throw new Error(`expected accepted event, got ${accepted.status}`);
const repeated = await call('/v1/sync/events', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify(event) });
if (repeated.status !== 'already_accepted') throw new Error(`expected idempotent replay, got ${repeated.status}`);
const conflict = await fetch(`${baseUrl}/v1/sync/events`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({ ...event, payload: { ...event.payload, value: 121 } }) });
if (conflict.status !== 409) throw new Error(`expected idempotency conflict, got ${conflict.status}`);
const newerPayload = { ...event.payload, value: 125, updatedAt: new Date(Date.now() - 500).toISOString() };
await call('/v1/sync/events', { method: 'POST', headers: { authorization: `Bearer ${firstDeviceTwo.session.accessToken}` }, body: JSON.stringify({ eventId: crypto.randomUUID(), eventType: 'glucose.reading.corrected.v1', entityType: 'glucose_reading', entityId, payload: newerPayload }) });
const olderPayload = { ...event.payload, value: 118, updatedAt: new Date(Date.now() - 2_000).toISOString() };
await call('/v1/sync/events', { method: 'POST', headers: { authorization: `Bearer ${firstDeviceTwo.session.accessToken}` }, body: JSON.stringify({ eventId: crypto.randomUUID(), eventType: 'glucose.reading.corrected.v1', entityType: 'glucose_reading', entityId, payload: olderPayload }) });
const own = await call('/v1/sync?since=1970-01-01T00:00:00.000Z', { headers: { authorization: `Bearer ${first.session.accessToken}` } });
const ownReading = own.records.find((record) => record.entity_id === entityId);
if (!ownReading) throw new Error('owner cannot read its own record');
if (ownReading.payload.value !== 125) throw new Error(`stale event regressed projection: ${JSON.stringify(ownReading.payload)}`);
if (ownReading.payload.riskRuleId !== 'care-plan.in-range') throw new Error('risk rule provenance was not preserved');
const secondDeviceView = await call('/v1/sync?since=1970-01-01T00:00:00.000Z', { headers: { authorization: `Bearer ${firstDeviceTwo.session.accessToken}` } });
const secondDeviceReading = secondDeviceView.records.find((record) => record.entity_id === entityId);
if (secondDeviceReading?.payload.value !== 125) throw new Error('second device did not converge on the newest projection');
const other = await call('/v1/sync?since=1970-01-01T00:00:00.000Z', { headers: { authorization: `Bearer ${second.session.accessToken}` } });
if (other.records.some((record) => record.entity_id === entityId)) throw new Error('cross-patient record leaked');
const syncIncidentId = crypto.randomUUID();
const incidentCreatedAt = new Date(Date.now() - 3_000).toISOString();
await call('/v1/sync/events', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({
  eventId: crypto.randomUUID(),
  eventType: 'emergency.incident.started.v1',
  entityType: 'emergency_incident',
  entityId: syncIncidentId,
  payload: { id: syncIncidentId, createdAt: incidentCreatedAt, reason: 'user_requested_help', contactState: 'queued_local' },
}) });
const syncIncidentUpdatedAt = new Date(Date.now() - 500).toISOString();
await call('/v1/sync/events', { method: 'POST', headers: { authorization: `Bearer ${firstDeviceTwo.session.accessToken}` }, body: JSON.stringify({
  eventId: crypto.randomUUID(),
  eventType: 'emergency.incident.status_changed.v1',
  entityType: 'emergency_incident',
  entityId: syncIncidentId,
  payload: { id: syncIncidentId, createdAt: incidentCreatedAt, reason: 'user_requested_help', contactState: 'remote_queued', updatedAt: syncIncidentUpdatedAt },
}) });
await call('/v1/sync/events', { method: 'POST', headers: { authorization: `Bearer ${firstDeviceTwo.session.accessToken}` }, body: JSON.stringify({
  eventId: crypto.randomUUID(),
  eventType: 'emergency.incident.status_changed.v1',
  entityType: 'emergency_incident',
  entityId: syncIncidentId,
  payload: { id: syncIncidentId, createdAt: incidentCreatedAt, reason: 'user_requested_help', contactState: 'call_unavailable', updatedAt: new Date(Date.now() - 2_000).toISOString() },
}) });
const syncedIncident = (await call('/v1/sync?since=1970-01-01T00:00:00.000Z', { headers: { authorization: `Bearer ${first.session.accessToken}` } })).records.find((record) => record.entity_id === syncIncidentId);
if (syncedIncident?.payload.contactState !== 'remote_queued') throw new Error(`incident projection regressed or is missing: ${JSON.stringify(syncedIncident)}`);
const secondDeviceIncident = (await call('/v1/sync?since=1970-01-01T00:00:00.000Z', { headers: { authorization: `Bearer ${firstDeviceTwo.session.accessToken}` } })).records.find((record) => record.entity_id === syncIncidentId);
if (secondDeviceIncident?.payload.contactState !== 'remote_queued') throw new Error('second device did not converge on the incident projection');
const otherIncident = (await call('/v1/sync?since=1970-01-01T00:00:00.000Z', { headers: { authorization: `Bearer ${second.session.accessToken}` } })).records.find((record) => record.entity_id === syncIncidentId);
if (otherIncident) throw new Error('cross-patient incident leaked');
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
const unavailableInvitation = await fetch(`${baseUrl}/v1/contact-invitations`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({ contactId, channel: 'email' }) });
if (unavailableInvitation.status !== 400) throw new Error('invitation allowed a channel without a contact address');
const invitation = await call('/v1/contact-invitations', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({ contactId, channel: 'sms' }) });
if (invitation.deliveryStatus !== expectedSmsInvitationStatus) throw new Error(`unexpected SMS invitation delivery state: ${invitation.deliveryStatus}`);
const acceptedInvitation = new URL(invitation.acceptUrl);
const invitationAcceptance = await call(`${acceptedInvitation.pathname}${acceptedInvitation.search}`);
if (invitationAcceptance.status !== 'accepted') throw new Error('invitation was not accepted');
const emailInvitation = await call('/v1/contact-invitations', { method: 'POST', headers: { authorization: `Bearer ${first.session.accessToken}` }, body: JSON.stringify({ contactId: emailContactId, channel: 'email' }) });
if (emailInvitation.deliveryStatus !== expectedEmailInvitationStatus) throw new Error(`unexpected email invitation delivery state: ${emailInvitation.deliveryStatus}`);
const emailInvitationUrl = new URL(emailInvitation.acceptUrl);
const invitationPageResponse = await fetch(`${baseUrl}${emailInvitationUrl.pathname}${emailInvitationUrl.search}`, { headers: { accept: 'text/html' } });
const invitationPage = await invitationPageResponse.text();
if (invitationPageResponse.status !== 200 || !invitationPage.includes('Aceptar invitación') || !invitationPage.includes('<form')) throw new Error('invitation landing page was not rendered');
const invitationFormResponse = await fetch(`${baseUrl}${emailInvitationUrl.pathname}`, {
  method: 'POST',
  headers: { accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' },
  body: `token=${encodeURIComponent(emailInvitationUrl.searchParams.get('token') ?? '')}`,
});
const invitationFormPage = await invitationFormResponse.text();
if (invitationFormResponse.status !== 200 || !invitationFormPage.includes('Invitación aceptada')) throw new Error('invitation form did not accept the invitation');
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
const firstDeletion = await fetch(`${baseUrl}/v1/account`, { method: 'DELETE', headers: { authorization: `Bearer ${first.session.accessToken}` } });
if (firstDeletion.status !== 204) throw new Error(`owner account deletion returned ${firstDeletion.status}`);
console.log('api-smoke=passed');
