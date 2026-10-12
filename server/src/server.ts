import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
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

function sendInvitationHtml(response: ServerResponse, status: number, title: string, message: string, action?: { label: string; url: string; token: string }) {
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
  const actionMarkup = action
    ? `<form method="post" action="${escapeHtml(action.url)}"><input type="hidden" name="token" value="${escapeHtml(action.token)}"><button type="submit">${escapeHtml(action.label)}</button></form>`
    : '';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title><style>body{margin:0;background:#0b0d0f;color:#fff7e8;font:16px system-ui,sans-serif;line-height:1.5}main{max-width:38rem;margin:12vh auto;padding:2rem}h1{font-size:1.8rem}p{color:#b8b2a7}button{border:0;border-radius:999px;background:#ffbe55;color:#0b0d0f;font:inherit;font-weight:700;padding:.8rem 1.2rem;cursor:pointer}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${actionMarkup}</main></body></html>`;
  response.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
  });
  response.end(html);
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

async function readRawBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBodyBytes) throw new Error('BODY_TOO_LARGE');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function readJson(request: IncomingMessage): Promise<JsonObject> {
  const raw = await readRawBody(request);
  if (!raw.length) return {};
  const parsed: unknown = JSON.parse(raw.toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('INVALID_JSON');
  return parsed as JsonObject;
}

function stringValue(value: unknown, maxLength = 4096) {
  return typeof value === 'string' && value.length <= maxLength ? value : null;
}

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function isValidTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(':').map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function isValidMedicationSchedule(value: unknown) {
  const schedule = objectValue(value);
  if (!schedule) return false;
  const weekdays = schedule.weekdays;
  if (weekdays !== undefined && (!Array.isArray(weekdays)
    || weekdays.some((day) => !Number.isInteger(day) || Number(day) < 1 || Number(day) > 7)
    || new Set(weekdays).size !== weekdays.length)) return false;
  if (schedule.kind === 'fixed') {
    return Array.isArray(schedule.times) && schedule.times.length >= 1 && schedule.times.length <= 8 && schedule.times.every(isValidTime);
  }
  if (schedule.kind === 'interval') {
    return isValidTime(schedule.anchorTime)
      && Number.isInteger(schedule.intervalHours)
      && Number(schedule.intervalHours) >= 1
      && Number(schedule.intervalHours) <= 24;
  }
  if (schedule.kind === 'meal_relative') {
    return ['breakfast', 'lunch', 'dinner', 'snack'].includes(String(schedule.meal))
      && Number.isInteger(schedule.offsetMinutes)
      && Number(schedule.offsetMinutes) >= -240
      && Number(schedule.offsetMinutes) <= 1440;
  }
  return false;
}

const glucoseContexts = new Set(['fasting', 'before_meal', 'after_meal', 'bedtime', 'exercise', 'illness', 'symptoms', 'other']);
const glucoseSources = new Set(['manual', 'import', 'cgm', 'glucometer']);
const ketoneResults = new Set(['not_checked', 'negative', 'trace', 'small', 'moderate', 'large', 'unknown']);
const riskClassifications = new Set(['unclassified', 'in_range', 'low', 'urgent_low', 'high', 'urgent_high']);

function isFiniteNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > minimum && value <= maximum;
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length <= maximum;
}

function validateGlucosePayload(payload: JsonObject) {
  if ('value' in payload && !isFiniteNumber(payload.value, 0, 1000)) return 'INVALID_GLUCOSE_VALUE';
  if ('unit' in payload && payload.unit !== 'mg/dL' && payload.unit !== 'mmol/L') return 'INVALID_GLUCOSE_UNIT';
  // The mobile entry limit is 1000 in the selected unit. A mmol/L entry can
  // therefore have a canonical mg/dL projection up to 18,018.2; keep the
  // server boundary aligned with that explicit client confirmation path.
  if ('valueMgDl' in payload && payload.valueMgDl !== null && !isFiniteNumber(payload.valueMgDl, 0, 18018.2)) return 'INVALID_GLUCOSE_CANONICAL_VALUE';
  if ('conversionVersion' in payload && payload.conversionVersion !== null && !isBoundedString(payload.conversionVersion, 64)) return 'INVALID_GLUCOSE_CONVERSION';
  if ('context' in payload && (typeof payload.context !== 'string' || !glucoseContexts.has(payload.context))) return 'INVALID_GLUCOSE_CONTEXT';
  if ('source' in payload && (typeof payload.source !== 'string' || !glucoseSources.has(payload.source))) return 'INVALID_GLUCOSE_SOURCE';
  if ('mealOffsetMinutes' in payload && payload.mealOffsetMinutes !== null && (!Number.isInteger(payload.mealOffsetMinutes) || Number(payload.mealOffsetMinutes) < 0 || Number(payload.mealOffsetMinutes) > 1440)) return 'INVALID_MEAL_OFFSET';
  if ('timezone' in payload && payload.timezone !== null && !isBoundedString(payload.timezone, 128)) return 'INVALID_GLUCOSE_TIMEZONE';
  if ('utcOffsetMinutes' in payload && payload.utcOffsetMinutes !== null && (!Number.isInteger(payload.utcOffsetMinutes) || Number(payload.utcOffsetMinutes) < -840 || Number(payload.utcOffsetMinutes) > 840)) return 'INVALID_GLUCOSE_OFFSET';
  if ('timeEdited' in payload && typeof payload.timeEdited !== 'boolean') return 'INVALID_GLUCOSE_EDIT_FLAG';
  if ('symptoms' in payload && !(isBoundedString(payload.symptoms, 4096) || (Array.isArray(payload.symptoms) && payload.symptoms.length <= 32 && payload.symptoms.every((item) => isBoundedString(item, 256))))) return 'INVALID_GLUCOSE_SYMPTOMS';
  if ('note' in payload && payload.note !== null && !isBoundedString(payload.note, 4096)) return 'INVALID_GLUCOSE_NOTE';
  if ('ketoneResult' in payload && payload.ketoneResult !== null && (typeof payload.ketoneResult !== 'string' || !ketoneResults.has(payload.ketoneResult))) return 'INVALID_KETONE_RESULT';
  if ('riskClassification' in payload && payload.riskClassification !== null && (typeof payload.riskClassification !== 'string' || !riskClassifications.has(payload.riskClassification))) return 'INVALID_RISK_CLASSIFICATION';
  if ('riskRuleId' in payload && payload.riskRuleId !== null && (typeof payload.riskRuleId !== 'string' || !/^[a-z][a-z0-9_.-]{0,127}$/.test(payload.riskRuleId))) return 'INVALID_RISK_RULE';
  if ('riskPlanUpdatedAt' in payload && payload.riskPlanUpdatedAt !== null && (typeof payload.riskPlanUpdatedAt !== 'string' || Number.isNaN(Date.parse(payload.riskPlanUpdatedAt)))) return 'INVALID_RISK_PLAN_DATE';
  return null;
}

function validateSyncEvent(entityType: string, entityId: string, eventType: string, payload: JsonObject) {
  if (!/^[a-z][a-z0-9_.-]{2,127}$/.test(eventType)) return 'INVALID_EVENT_TYPE';
  if (!/^[0-9a-f-]{36}$/i.test(entityId) && !(entityId === 'default' && (entityType === 'care_plan' || entityType === 'measurement_plan' || entityType === 'emergency_card'))) return 'INVALID_ENTITY_ID';
  for (const field of ['updatedAt', 'createdAt', 'recordedAt', 'occurredAt', 'scheduledAt']) {
    if (field in payload && (typeof payload[field] !== 'string' || Number.isNaN(Date.parse(String(payload[field]))))) return 'INVALID_EVENT_DATE';
  }
  if (entityType === 'glucose_reading') {
    const glucoseError = validateGlucosePayload(payload);
    if (glucoseError) return glucoseError;
  }
  if (entityType === 'medication' && payload.schedule !== undefined && payload.schedule !== null && !isValidMedicationSchedule(payload.schedule)) return 'INVALID_MEDICATION_SCHEDULE';
  return null;
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

function callbackSignature(rawBody: Buffer) {
  const secret = process.env.PROVIDER_CALLBACK_SECRET?.trim();
  if (!secret) return null;
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function hasValidCallbackSignature(request: IncomingMessage, rawBody: Buffer) {
  const expected = callbackSignature(rawBody);
  const receivedHeader = request.headers['x-glucocare-callback-signature'];
  const received = typeof receivedHeader === 'string' ? receivedHeader.replace(/^sha256=/i, '').trim().toLowerCase() : '';
  if (!expected || !/^[0-9a-f]{64}$/.test(received)) return false;
  const expectedBytes = Buffer.from(expected, 'hex');
  const receivedBytes = Buffer.from(received, 'hex');
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
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
  const validationError = validateSyncEvent(entityType, entityId, eventType, payload);
  if (validationError) {
    fail(response, 400, validationError, 'El evento de sincronización contiene datos no válidos.');
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

async function acceptInvitation(token: string | null, response: ServerResponse, request: IncomingMessage, mutate: boolean) {
  if (!token || token.length > 512) { fail(response, 400, 'INVALID_INVITATION_TOKEN', 'El enlace de invitación no es válido.'); return; }
  const wantsHtml = (request.headers.accept ?? '').includes('text/html');
  if (wantsHtml && !mutate) {
    sendInvitationHtml(response, 200, 'Invitación de GlucoCare', 'Confirma que aceptas recibir avisos de ayuda. Esta invitación no da acceso al historial clínico.', {
      label: 'Aceptar invitación',
      url: '/v1/contact-invitations/accept',
      token,
    });
    return;
  }
  const accepted = await pool.query<{ id: string; contact_id: string }>(
    `UPDATE contact_invitations SET status = 'accepted'
     WHERE token_hash = $1 AND status = 'pending' AND expires_at > now()
     RETURNING id, contact_id`, [hashToken(token)],
  );
  if (!accepted.rows[0]) {
    if (wantsHtml) {
      sendInvitationHtml(response, 410, 'Invitación no disponible', 'La invitación ya fue usada, revocada o venció. Pide a tu contacto una nueva invitación.');
    } else fail(response, 410, 'INVITATION_EXPIRED', 'La invitación ya no está disponible.');
    return;
  }
  if (wantsHtml) {
    sendInvitationHtml(response, 200, 'Invitación aceptada', 'Ahora puedes recibir avisos de ayuda de GlucoCare. La persona que te invitó sigue siendo responsable de sus decisiones de emergencia.');
    return;
  }
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

async function providerCallback(request: IncomingMessage, response: ServerResponse) {
  let rawBody: Buffer;
  try {
    rawBody = await readRawBody(request);
  } catch (error) {
    fail(response, error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 413 : 400, 'INVALID_CALLBACK', 'El callback no es válido.');
    return;
  }
  if (!callbackSignature(rawBody)) {
    fail(response, 503, 'CALLBACK_NOT_CONFIGURED', 'El callback de proveedores no está configurado.', true);
    return;
  }
  if (!hasValidCallbackSignature(request, rawBody)) {
    fail(response, 401, 'INVALID_CALLBACK_SIGNATURE', 'El callback no está autorizado.');
    return;
  }
  let body: JsonObject;
  try {
    const parsed: unknown = JSON.parse(rawBody.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('INVALID_JSON');
    body = parsed as JsonObject;
  } catch {
    fail(response, 400, 'INVALID_CALLBACK', 'El callback no contiene JSON válido.');
    return;
  }
  const providerMessageId = stringValue(body.providerMessageId, 256);
  const status = body.status === 'delivered' || body.status === 'failed' ? body.status : null;
  const failureCode = stringValue(body.failureCode, 120);
  const deliveredAt = typeof body.deliveredAt === 'string' && !Number.isNaN(Date.parse(body.deliveredAt)) ? body.deliveredAt : new Date().toISOString();
  if (!providerMessageId || !status || (status === 'failed' && !failureCode)) {
    fail(response, 400, 'INVALID_CALLBACK', 'El callback no contiene un estado válido.');
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query<{ alert_id: string }>(
      `UPDATE alert_deliveries
       SET status = CASE WHEN status = 'delivered' THEN 'delivered' ELSE $2 END,
           delivered_at = CASE WHEN $2 = 'delivered' THEN COALESCE(delivered_at, $3::timestamptz) ELSE delivered_at END,
           failure_code = CASE WHEN $2 = 'failed' THEN $4 ELSE NULL END,
           last_error = CASE WHEN $2 = 'failed' THEN $4 ELSE NULL END,
           lease_until = NULL,
           next_attempt_at = NULL,
           updated_at = now()
       WHERE provider_message_id = $1
       RETURNING alert_id`, [providerMessageId, status, deliveredAt, failureCode]);
    const alertIds = [...new Set(updated.rows.map((row) => row.alert_id))];
    for (const alertId of alertIds) {
      await client.query(
        `UPDATE emergency_alerts a SET status = CASE
           WHEN EXISTS (SELECT 1 FROM alert_deliveries d WHERE d.alert_id = a.id AND d.status IN ('queued', 'processing')) THEN 'queued'
           WHEN EXISTS (SELECT 1 FROM alert_deliveries d WHERE d.alert_id = a.id AND d.status IN ('provider_accepted', 'delivered')) THEN 'provider_accepted'
           WHEN EXISTS (SELECT 1 FROM alert_deliveries d WHERE d.alert_id = a.id AND d.status = 'not_configured') THEN 'not_configured'
           ELSE 'failed' END
         WHERE a.id = $1`, [alertId],
      );
    }
    await client.query('COMMIT');
    // Do not reveal whether a provider ID exists: this endpoint is public to
    // the provider and must not become an oracle for patient activity.
    send(response, 202, { status: 'accepted' });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(response, 500, 'CALLBACK_WRITE_FAILED', 'No se pudo registrar el callback.', true);
  } finally {
    client.release();
  }
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
  if (request.method === 'POST' && url.pathname === '/v1/internal/provider-callback') {
    const limit = consumeRateLimit(`provider-callback:${requestAddress(request)}`, 120, 60_000);
    if (!limit.allowed) { rateLimited(response, limit.retryAfterSeconds); return; }
    await providerCallback(request, response); return;
  }
  if ((request.method === 'GET' || request.method === 'POST') && url.pathname === '/v1/contact-invitations/accept') {
    const limit = consumeRateLimit(`invitation-accept:${requestAddress(request)}`, 30, 60_000);
    if (!limit.allowed) { rateLimited(response, limit.retryAfterSeconds); return; }
    let token = url.searchParams.get('token');
    if (request.method === 'POST') {
      let raw: string;
      try {
        raw = (await readRawBody(request)).toString('utf8');
      } catch (error) {
        fail(response, error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 413 : 400, 'INVALID_INVITATION_TOKEN', 'El enlace de invitación no es válido.');
        return;
      }
      if ((request.headers['content-type'] ?? '').includes('application/json')) {
        try {
          const body = JSON.parse(raw) as JsonObject;
          token = stringValue(body.token, 512) ?? token;
        } catch { /* Fall through to the invalid-token response. */ }
      } else {
        token = new URLSearchParams(raw).get('token') ?? token;
      }
    }
    await acceptInvitation(token, response, request, request.method === 'POST'); return;
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
