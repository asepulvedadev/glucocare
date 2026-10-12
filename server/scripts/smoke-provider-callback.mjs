import { createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';

const baseUrl = process.env.API_URL ?? 'http://127.0.0.1:18084';
const secret = process.env.PROVIDER_CALLBACK_SECRET?.trim();
if (!secret) throw new Error('PROVIDER_CALLBACK_SECRET is required for this smoke test');

async function call(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const session = await call('/v1/auth/signup', {
  method: 'POST',
  body: JSON.stringify({ email: `callback-${suffix}@example.invalid`, password: 'synthetic-callback-password' }),
});
const pool = new pg.Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
  host: process.env.DATABASE_HOST ?? '127.0.0.1',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  database: process.env.DATABASE_NAME ?? 'glucocare',
  user: process.env.DATABASE_USER ?? 'glucocare_app',
  password: process.env.DATABASE_PASSWORD ?? 'glucocare_ci_password',
});
const alertId = randomUUID();
const deliveryId = randomUUID();
const providerMessageId = `synthetic-provider-${suffix}`;

try {
  await pool.query(`INSERT INTO emergency_alerts (id, patient_id, incident_id, status) VALUES ($1, $2, $3, 'provider_accepted')`, [alertId, session.session.user.id, `callback-${suffix}`]);
  await pool.query(`INSERT INTO alert_deliveries (id, alert_id, contact_id, channel, status, provider_message_id) VALUES ($1, $2, 'synthetic-contact', 'email', 'provider_accepted', $3)`, [deliveryId, alertId, providerMessageId]);

  const deliveredPayload = JSON.stringify({ providerMessageId, status: 'delivered', deliveredAt: new Date().toISOString() });
  const signature = createHmac('sha256', secret).update(deliveredPayload).digest('hex');
  const callback = await call('/v1/internal/provider-callback', { method: 'POST', headers: { 'x-glucocare-callback-signature': signature }, body: deliveredPayload });
  if (callback.status !== 'accepted') throw new Error('provider callback was not accepted');
  const deliveries = await call(`/v1/emergency-alerts/callback-${suffix}/deliveries`, { headers: { authorization: `Bearer ${session.session.accessToken}` } });
  if (deliveries.deliveries.length !== 1 || deliveries.deliveries[0].status !== 'delivered' || !deliveries.deliveries[0].deliveredAt) throw new Error(`delivery was not marked delivered: ${JSON.stringify(deliveries)}`);

  const failedPayload = JSON.stringify({ providerMessageId, status: 'failed', failureCode: 'late-provider-event' });
  const failedSignature = createHmac('sha256', secret).update(failedPayload).digest('hex');
  await call('/v1/internal/provider-callback', { method: 'POST', headers: { 'x-glucocare-callback-signature': failedSignature }, body: failedPayload });
  const replayed = await call(`/v1/emergency-alerts/callback-${suffix}/deliveries`, { headers: { authorization: `Bearer ${session.session.accessToken}` } });
  if (replayed.deliveries[0]?.status !== 'delivered') throw new Error('a late failure callback regressed a delivered record');
  console.log('provider-callback-smoke=passed');
} finally {
  await fetch(`${baseUrl}/v1/account`, { method: 'DELETE', headers: { authorization: `Bearer ${session.session.accessToken}` } }).catch(() => undefined);
  await pool.end();
}
