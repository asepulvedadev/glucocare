import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { pool, runMigrations, closeDatabase } from './db.js';
import { authenticate, bearerToken, deleteAccount, revokeSession, signIn, signUp, type AuthUser } from './auth.js';
import { consumeRateLimit } from './rateLimit.js';
import { isAlertChannelConfigured, sendContactInvitation } from './alertProviders.js';

const port = Number(process.env.PORT ?? 8080);
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES ?? 1_048_576);
const apiBaseUrl = (process.env.PUBLIC_API_URL ?? `http://127.0.0.1:${port}`).replace(/\/$/, '');

const supportedEntityTypes = new Set([
  'glucose_reading', 'medication', 'medication_occurrence', 'appointment', 'measurement_plan',
  'measurement_occurrence', 'meal_event', 'care_plan', 'emergency_card', 'trusted_contact',
  'emergency_incident',
]);

type JsonObject = Record<string, unknown>;
type AuthenticatedRequest = IncomingMessage & { user?: AuthUser; token?: string };

function send(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const serialized = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': process.env.CORS_ORIGIN ?? '*',
    'access-control-allow-headers': 'authorization, content-type, idempotency-key',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    ...headers,
  });
  response.end(serialized);
}

function errorBody(code: string, message: string, retryable = false) {
  return { error: { code, message, retryable, correlationId: randomUUID() } };
}

function fail(response: ServerResponse, status: number, code: string, message: string, retryable = false) {
  send(response, status, errorBody(code, message, retryable));
}

function rateLimited(response: ServerResponse, retryAfterSeconds: number) {
  send(response, 429, errorBody('RATE_LIMITED', 'Demasiadas solicitudes. Intenta de nuevo más tarde.', true), { 'retry-after': String(retryAfterSeconds) });
}

function requestAddress(request: IncomingMessage) {
  return request.socket.remoteAddress ?? 'unknown';
}

async function readJson(request: IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBodyBytes) throw new Error('BODY_TOO_LARGE');
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('INVALID_JSON');
  return parsed as JsonObject;
}

function stringValue(value: unknown, maxLength = 4096) {
  return typeof value === 'string' && value.length <= maxLength ? value : null;
}

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function eventDate(payload: JsonObject) {
  const candidate = [payload.updatedAt, payload.createdAt, payload.recordedAt, payload.occurredAt, payload.scheduledAt]
    .find((value): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value)));
  return candidate ?? new Date().toISOString();
}

function hashToken(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as JsonObject).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalJson(item)]));
  }
  return value;
}

function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(canonicalJson(value))).digest('hex');
}

async function requireUser(request: AuthenticatedRequest, response: ServerResponse) {
  const token = bearerTokenFromNodeRequest(request);
  const user = await authenticate(token);
  if (!user) {
    fail(response, 401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.');
    return null;
  }
  request.user = user;
  request.token = token;
  return user;
}

function bearerTokenFromNodeRequest(request: IncomingMessage) {
  const header = request.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined;
}

async function authRoute(request: AuthenticatedRequest, response: ServerResponse, pathname: string) {
  let body: JsonObject;
  try { body = await readJson(request); } catch (error) {
    fail(response, error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 413 : 400, 'INVALID_JSON', 'El cuerpo de la solicitud no es válido.');
    return;
  }
  try {
    if (pathname === '/v1/auth/signup') {
      send(response, 201, { session: await signUp(body.email, body.password) });
      return;
    }
    if (pathname === '/v1/auth/signin') {
      send(response, 200, { session: await signIn(body.email, body.password) });
      return;
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : 'AUTH_FAILED';
    const map: Record<string, [number, string]> = {
      EMAIL_REQUIRED: [400, 'El correo es obligatorio.'], EMAIL_INVALID: [400, 'El correo no es válido.'],
      PASSWORD_INVALID: [400, 'La contraseña debe tener entre 12 y 256 caracteres.'], EMAIL_IN_USE: [409, 'El correo ya está registrado.'],
      INVALID_CREDENTIALS: [401, 'El correo o la contraseña no son correctos.'],
    };
    const [status, message] = map[code] ?? [500, 'No se pudo completar la autenticación.'];
    fail(response, status, code, message);
    return;
  }
  fail(response, 404, 'NOT_FOUND', 'Ruta no encontrada.');
}

async function acceptSyncEvent(user: AuthUser, body: JsonObject, response: ServerResponse) {
  const eventId = stringValue(body.eventId, 128);
  const eventType = stringValue(body.eventType, 128);
  const entityType = stringValue(body.entityType, 64);
  const entityId = stringValue(body.entityId, 256);
  const payload = objectValue(body.payload);
  if (!eventId || !eventType || !entityType || !entityId || !payload || !/^[0-9a-f-]{36}$/i.test(eventId) || !supportedEntityTypes.has(entityType)) {
    fail(response, 400, 'INVALID_SYNC_EVENT', 'El evento de sincronización no es válido.');
    return;
  }
  const occurredAt = eventDate(payload);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO sync_events (id, patient_id, event_type, entity_type, entity_id, payload, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [eventId, user.id, eventType, entityType, entityId, JSON.stringify(payload), occurredAt],
    );
    if (!inserted.rowCount) {
      const existing = await client.query<{ patient_id: string; payload: JsonObject }>(
        `SELECT patient_id, payload FROM sync_events WHERE id = $1`, [eventId],
      );
      const matchingEvent = existing.rows[0]?.patient_id === user.id && hashJson(existing.rows[0]?.payload) === hashJson(payload);
      await client.query('ROLLBACK');
      if (!matchingEvent) {
        fail(response, 409, 'IDEMPOTENCY_CONFLICT', 'El identificador de evento ya fue usado con otros datos.');
        return;
      }
      send(response, 200, { status: 'already_accepted', eventId });
      return;
    }
    if (inserted.rowCount) {
      await client.query(
        `INSERT INTO health_records (patient_id, entity_type, entity_id, payload, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, NULL)
         ON CONFLICT (patient_id, entity_type, entity_id)
         DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at, deleted_at = NULL
         WHERE health_records.updated_at <= excluded.updated_at`,
        [user.id, entityType, entityId, JSON.stringify(payload), occurredAt],
      );
      // A local contact edit/removal or consent event carries a revocation
      // marker. Revoke the server-side invitation in the same transaction so
      // a stale accepted invitation can never keep the contact eligible for a
      // future alert.
      const contactRevoked = entityType === 'trusted_contact'
        && (payload.revoked === true || payload.consentGranted === false || payload.consent_status === 'revoked' || eventType.includes('revoked'));
      if (contactRevoked) {
        await client.query(
          `UPDATE contact_invitations SET status = 'revoked'
           WHERE patient_id = $1 AND contact_id = $2 AND status IN ('pending', 'accepted')`,
          [user.id, entityId],
        );
      }
      if (eventType.includes('corrected') || entityType === 'care_plan' || entityType === 'medication' || entityType === 'appointment' || entityType === 'emergency_card' || entityType === 'trusted_contact' || entityType === 'measurement_plan') {
        await client.query(
          `INSERT INTO audit_events (id, patient_id, action, entity_type, entity_id, occurred_at, before_data, after_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
           ON CONFLICT (id) DO NOTHING`,
          [eventId, user.id, eventType, entityType, entityId, occurredAt, payload.before ? JSON.stringify(payload.before) : null, payload.after ? JSON.stringify(payload.after) : JSON.stringify(payload)],
        );
      }
    }
    await client.query('COMMIT');
    send(response, inserted.rowCount ? 201 : 200, { status: inserted.rowCount ? 'accepted' : 'already_accepted', eventId });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (typeof error === 'object' && error && 'code' in error && (error as { code?: string }).code === '22P02') {
      fail(response, 400, 'INVALID_SYNC_EVENT', 'El evento contiene una fecha o identificador no válido.');
    } else {
      fail(response, 500, 'SYNC_WRITE_FAILED', 'No se pudo guardar el evento. Intenta de nuevo.', true);
    }
  } finally {
    client.release();
  }
}

async function pullSync(user: AuthUser, requestUrl: URL, response: ServerResponse) {
  const since = requestUrl.searchParams.get('since') ?? '1970-01-01T00:00:00.000Z';
  if (Number.isNaN(Date.parse(since))) { fail(response, 400, 'INVALID_CURSOR', 'El cursor de sincronización no es válido.'); return; }
  const until = new Date().toISOString();
  const result = await pool.query(
    `SELECT entity_type, entity_id, payload, updated_at
     FROM health_records WHERE patient_id = $1 AND updated_at >= $2 AND updated_at <= $3
     ORDER BY updated_at ASC, entity_type ASC, entity_id ASC`, [user.id, since, until],
  );
  send(response, 200, { until, records: result.rows });
}

async function createInvitation(user: AuthUser, body: JsonObject, response: ServerResponse) {
  const contactId = stringValue(body.contactId, 256);
  const channel = body.channel === 'sms' ? 'sms' : body.channel === 'email' ? 'email' : null;
  if (!contactId || !channel) { fail(response, 400, 'INVALID_INVITATION', 'El contacto y el canal son obligatorios.'); return; }
  const contact = await pool.query<{ payload: JsonObject }>(
    `SELECT payload FROM health_records WHERE patient_id = $1 AND entity_type = 'trusted_contact' AND entity_id = $2`, [user.id, contactId],
  );
  if (!contact.rows[0]) { fail(response, 404, 'CONTACT_NOT_FOUND', 'El contacto no existe.'); return; }
  const contactPayload = contact.rows[0].payload;
  const destination = channel === 'email' ? contactPayload.email : contactPayload.phone;
  if (typeof destination !== 'string' || !destination.trim()) {
    fail(response, 400, 'INVITATION_CHANNEL_UNAVAILABLE', 'El contacto no tiene un dato válido para el canal seleccionado.');
    return;
  }
  const token = randomBytes(32).toString('base64url');
  const id = randomUUID();
  await pool.query(
    `UPDATE contact_invitations SET status = 'revoked' WHERE patient_id = $1 AND contact_id = $2 AND status IN ('pending', 'accepted')`, [user.id, contactId],
  );
  await pool.query(
    `INSERT INTO contact_invitations (id, patient_id, contact_id, channel, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5, now() + interval '72 hours')`,
    [id, user.id, contactId, channel, hashToken(token)],
  );
  const acceptUrl = `${apiBaseUrl}/v1/contact-invitations/accept?token=${encodeURIComponent(token)}`;
  let deliveryStatus: 'provider_accepted' | 'not_configured' | 'failed' = 'not_configured';
  // Never send an invitation containing a localhost link. The patient can
  // still share the returned URL manually in a reviewed public deployment.
  if (apiBaseUrl.startsWith('https://') && isAlertChannelConfigured(channel)) {
    try {
      await sendContactInvitation(channel, { ...contactPayload, [channel === 'email' ? 'email' : 'phone']: destination }, acceptUrl);
      deliveryStatus = 'provider_accepted';
    } catch {
      deliveryStatus = 'failed';
    }
  }
  send(response, 201, { invitationId: id, status: 'pending', deliveryStatus, acceptUrl });
}

async function invitationStatuses(user: AuthUser, response: ServerResponse) {
  const result = await pool.query(
    `SELECT contact_id, status, expires_at FROM contact_invitations
     WHERE patient_id = $1 AND (status = 'accepted' OR (status = 'pending' AND expires_at > now()))
     ORDER BY created_at DESC`, [user.id],
  );
  send(response, 200, { invitations: result.rows });
}

async function revokeInvitation(user: AuthUser, body: JsonObject, response: ServerResponse) {
  const contactId = stringValue(body.contactId, 256);
  if (!contactId) { fail(response, 400, 'INVALID_INVITATION', 'El contacto es obligatorio.'); return; }
  await pool.query(`UPDATE contact_invitations SET status = 'revoked' WHERE patient_id = $1 AND contact_id = $2 AND status IN ('pending', 'accepted')`, [user.id, contactId]);
  send(response, 200, { status: 'revoked' });
}

async function acceptInvitation(token: string | null, response: ServerResponse) {
  if (!token || token.length > 512) { fail(response, 400, 'INVALID_INVITATION_TOKEN', 'El enlace de invitación no es válido.'); return; }
  const accepted = await pool.query<{ id: string; contact_id: string }>(
    `UPDATE contact_invitations SET status = 'accepted'
     WHERE token_hash = $1 AND status = 'pending' AND expires_at > now()
     RETURNING id, contact_id`, [hashToken(token)],
  );
  if (!accepted.rows[0]) { fail(response, 410, 'INVITATION_EXPIRED', 'La invitación ya no está disponible.'); return; }
  send(response, 200, { invitationId: accepted.rows[0].id, contactId: accepted.rows[0].contact_id, status: 'accepted' });
}

async function emergencyAlert(user: AuthUser, body: JsonObject, response: ServerResponse) {
  const incidentId = stringValue(body.incidentId, 256);
  const contactIds = Array.isArray(body.contactIds) ? [...new Set(body.contactIds.filter((value): value is string => typeof value === 'string' && value.length <= 256))] : [];
  const channels = Array.isArray(body.channels) ? [...new Set(body.channels.filter((value): value is string => ['email', 'sms', 'push', 'voice'].includes(String(value))).map(String))] : [];
  if (!incidentId || !contactIds.length || !channels.length) { fail(response, 400, 'INVALID_ALERT', 'El incidente, los contactos y los canales son obligatorios.'); return; }
  const contacts = await pool.query<{ entity_id: string; payload: JsonObject }>(
    `SELECT r.entity_id, r.payload FROM health_records r
     WHERE r.patient_id = $1 AND r.entity_type = 'trusted_contact' AND r.entity_id = ANY($2::text[])
       AND EXISTS (
         SELECT 1 FROM contact_invitations i
         WHERE i.patient_id = r.patient_id AND i.contact_id = r.entity_id
           AND i.status = 'accepted'
       )`,
    [user.id, contactIds],
  );
  if (contacts.rowCount !== contactIds.length) { fail(response, 400, 'INVALID_ALERT_CONTACTS', 'Uno o más contactos no pertenecen a tu cuenta.'); return; }
  // A request may contain several contacts with different channels. Build the
  // delivery ledger from each contact's available address instead of taking a
  // cartesian product that would create impossible email/SMS deliveries.
  const deliveryPairs = contacts.rows.flatMap(({ entity_id: contactId, payload }) => channels
    .filter((channel) => (channel === 'email' && typeof payload.email === 'string' && payload.email.trim().length > 0)
      || ((channel === 'sms' || channel === 'voice') && typeof payload.phone === 'string' && payload.phone.trim().length > 0))
    .map((channel) => ({ contactId, channel })));
  if (!deliveryPairs.length) { fail(response, 400, 'INVALID_ALERT_CHANNELS', 'Ningún contacto tiene una dirección disponible para los canales solicitados.'); return; }
  const alertId = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const alert = await client.query<{ id: string }>(
      `INSERT INTO emergency_alerts (id, patient_id, incident_id, status) VALUES ($1, $2, $3, 'queued')
       ON CONFLICT (patient_id, incident_id) DO NOTHING RETURNING id`, [alertId, user.id, incidentId],
    );
    if (!alert.rowCount) {
      const existing = await client.query<{ id: string; status: string }>(
        `SELECT id, status FROM emergency_alerts WHERE patient_id = $1 AND incident_id = $2 FOR UPDATE`, [user.id, incidentId],
      );
      const existingAlert = existing.rows[0];
      if (!existingAlert) throw new Error('ALERT_IDEMPOTENCY_LOOKUP_FAILED');
      const existingDeliveries = await client.query<{ contact_id: string; channel: string; status: string }>(
        `SELECT contact_id, channel, status FROM alert_deliveries WHERE alert_id = $1 ORDER BY queued_at ASC`, [existingAlert.id],
      );
      const requestedKeys = deliveryPairs.map(({ contactId, channel }) => `${contactId}:${channel}`).sort();
      const existingKeys = existingDeliveries.rows.map((delivery) => `${delivery.contact_id}:${delivery.channel}`).sort();
      if (requestedKeys.length !== existingKeys.length || requestedKeys.some((key, index) => key !== existingKeys[index])) {
        await client.query('ROLLBACK');
        fail(response, 409, 'IDEMPOTENCY_CONFLICT', 'El incidente ya fue registrado con otros contactos o canales.');
        return;
      }
      await client.query('COMMIT');
      send(response, 200, {
        alertId: existingAlert.id,
        status: existingAlert.status,
        deliveries: existingDeliveries.rows.map((delivery) => ({ contactId: delivery.contact_id, channel: delivery.channel, status: delivery.status })),
      });
      return;
    }
    const persistedAlertId = alert.rows[0].id;
    await client.query('DELETE FROM alert_deliveries WHERE alert_id = $1', [persistedAlertId]);
    for (const { contactId, channel } of deliveryPairs) {
      await client.query(
        `INSERT INTO alert_deliveries (id, alert_id, contact_id, channel, status, failure_code, next_attempt_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), persistedAlertId, contactId, channel, 'queued', null, new Date()],
      );
    }
    await client.query('COMMIT');
    send(response, 202, { alertId: persistedAlertId, status: 'queued', deliveries: deliveryPairs.map(({ contactId, channel }) => ({ contactId, channel, status: 'queued' })) });
    return;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(response, 500, 'ALERT_WRITE_FAILED', 'No se pudo registrar la alerta. Intenta usar la llamada de emergencia.', true);
    return;
  } finally { client.release(); }
}

async function deliveries(user: AuthUser, incidentId: string, response: ServerResponse) {
  const result = await pool.query(
    `SELECT d.id, d.contact_id, d.channel, d.status, d.queued_at, d.delivered_at, d.failure_code
     FROM alert_deliveries d JOIN emergency_alerts a ON a.id = d.alert_id
     WHERE a.patient_id = $1 AND a.incident_id = $2 ORDER BY d.queued_at ASC`, [user.id, incidentId],
  );
  send(response, 200, { deliveries: result.rows });
}

async function route(request: AuthenticatedRequest, response: ServerResponse) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  if (request.method === 'OPTIONS') { response.writeHead(204, { 'access-control-allow-origin': process.env.CORS_ORIGIN ?? '*', 'access-control-allow-headers': 'authorization, content-type, idempotency-key', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS' }); response.end(); return; }
  if (request.method === 'GET' && url.pathname === '/healthz') {
    try { await pool.query('SELECT 1'); send(response, 200, { status: 'ok', database: 'ok' }); } catch { fail(response, 503, 'DATABASE_UNAVAILABLE', 'La base de datos no está disponible.', true); }
    return;
  }
  if (request.method === 'POST' && (url.pathname === '/v1/auth/signup' || url.pathname === '/v1/auth/signin')) {
    const limit = consumeRateLimit(`auth:${requestAddress(request)}`, 10, 60_000);
    if (!limit.allowed) { rateLimited(response, limit.retryAfterSeconds); return; }
    await authRoute(request, response, url.pathname); return;
  }
  if (request.method === 'POST' && url.pathname === '/v1/auth/signout') { await revokeSession(bearerTokenFromNodeRequest(request)); send(response, 204, {}); return; }
  if (request.method === 'GET' && url.pathname === '/v1/contact-invitations/accept') {
    const limit = consumeRateLimit(`invitation-accept:${requestAddress(request)}`, 30, 60_000);
    if (!limit.allowed) { rateLimited(response, limit.retryAfterSeconds); return; }
    await acceptInvitation(url.searchParams.get('token'), response); return;
  }

  const user = await requireUser(request, response);
  if (!user) return;
  if (request.method === 'DELETE' && url.pathname === '/v1/account') { await deleteAccount(user.id, request.token); send(response, 204, {}); return; }
  if (request.method === 'GET' && url.pathname === '/v1/sync') { await pullSync(user, url, response); return; }
  if (request.method === 'POST' && url.pathname === '/v1/sync/events') { try { await acceptSyncEvent(user, await readJson(request), response); } catch { fail(response, 400, 'INVALID_JSON', 'El evento no contiene JSON válido.'); } return; }
  if (request.method === 'POST' && url.pathname === '/v1/contact-invitations') {
    const limit = consumeRateLimit(`invitation:${user.id}`, 10, 60 * 60_000);
    if (!limit.allowed) { rateLimited(response, limit.retryAfterSeconds); return; }
    try { await createInvitation(user, await readJson(request), response); } catch { fail(response, 400, 'INVALID_JSON', 'La invitación no es válida.'); } return;
  }
  if (request.method === 'POST' && url.pathname === '/v1/contact-invitations/revoke') { try { await revokeInvitation(user, await readJson(request), response); } catch { fail(response, 400, 'INVALID_JSON', 'La revocación no es válida.'); } return; }
  if (request.method === 'GET' && url.pathname === '/v1/contact-invitations') { await invitationStatuses(user, response); return; }
  if (request.method === 'POST' && url.pathname === '/v1/emergency-alerts') {
    const limit = consumeRateLimit(`alert:${user.id}`, 5, 10 * 60_000);
    if (!limit.allowed) { rateLimited(response, limit.retryAfterSeconds); return; }
    try { await emergencyAlert(user, await readJson(request), response); } catch { fail(response, 400, 'INVALID_JSON', 'La alerta no es válida.'); } return;
  }
  const deliveriesMatch = request.method === 'GET' ? url.pathname.match(/^\/v1\/emergency-alerts\/([^/]+)\/deliveries$/) : null;
  if (deliveriesMatch) { await deliveries(user, decodeURIComponent(deliveriesMatch[1]), response); return; }
  fail(response, 404, 'NOT_FOUND', 'Ruta no encontrada.');
}

const server = createServer((request, response) => {
  void route(request as AuthenticatedRequest, response).catch(() => fail(response, 500, 'INTERNAL_ERROR', 'Ocurrió un error inesperado.', true));
});

await runMigrations();
server.listen(port, '0.0.0.0', () => console.log(`glucocare-api listening on ${port}`));

async function shutdown() {
  server.close();
  await closeDatabase();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
