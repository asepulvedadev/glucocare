import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;
const connection = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DATABASE_HOST,
      port: Number(process.env.DATABASE_PORT ?? 5432),
      database: process.env.DATABASE_NAME,
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
    };

function runWorker(providerUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['dist/alertWorker.js'], {
      env: {
        ...process.env,
        ALERT_WORKER_ONCE: 'true',
        RESEND_API_KEY: 'synthetic-provider-key',
        RESEND_FROM: 'alerts@example.invalid',
        RESEND_API_URL: providerUrl,
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`worker exited ${code}: ${stderr}`)));
  });
}

const client = new Client(connection);
const patientId = randomUUID();
const contactId = randomUUID();
const invitationId = randomUUID();
const alertId = randomUUID();
const deliveryId = randomUUID();
let providerCalls = 0;
const provider = createServer((request, response) => {
  providerCalls += 1;
  request.resume();
  if (providerCalls === 1) {
    response.writeHead(500, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'synthetic transient outage' }));
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ id: 'synthetic-provider-message' }));
});

await client.connect();
await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
const address = provider.address();
if (!address || typeof address === 'string') throw new Error('provider server did not expose a port');
const providerUrl = `http://127.0.0.1:${address.port}/emails`;

try {
  await client.query('BEGIN');
  await client.query(
    'INSERT INTO app_users (id, email, password_hash) VALUES ($1, $2, $3)',
    [patientId, `provider-retry-${patientId}@example.invalid`, 'synthetic-test-hash'],
  );
  await client.query(
    `INSERT INTO health_records (patient_id, entity_type, entity_id, payload)
     VALUES ($1, 'trusted_contact', $2, $3::jsonb)`,
    [patientId, contactId, JSON.stringify({ id: contactId, name: 'Synthetic contact', email: 'contact@example.invalid', consentGranted: true })],
  );
  await client.query(
    `INSERT INTO health_records (patient_id, entity_type, entity_id, payload)
     VALUES ($1, 'privacy_consent', 'default', $2::jsonb)`,
    [patientId, JSON.stringify({ id: 'default', policyVersion: 'synthetic-privacy-v1', localDataConsent: true, cloudSyncConsent: true, emergencySharingConsent: true })],
  );
  await client.query(
    `INSERT INTO contact_invitations (id, patient_id, contact_id, channel, token_hash, status, expires_at)
     VALUES ($1, $2, $3, 'email', $4, 'accepted', now() + interval '1 hour')`,
    [invitationId, patientId, contactId, `provider-retry-token-${invitationId}`],
  );
  await client.query(
    `INSERT INTO emergency_alerts (id, patient_id, incident_id, status) VALUES ($1, $2, $3, 'queued')`,
    [alertId, patientId, `provider-retry-incident-${alertId}`],
  );
  await client.query(
    `INSERT INTO alert_deliveries (id, alert_id, contact_id, channel, status, next_attempt_at)
     VALUES ($1, $2, $3, 'email', 'queued', now())`,
    [deliveryId, alertId, contactId],
  );
  await client.query('COMMIT');

  await runWorker(providerUrl);
  const first = await client.query(
    'SELECT status, failure_code, attempt_count, next_attempt_at FROM alert_deliveries WHERE id = $1',
    [deliveryId],
  );
  const firstRow = first.rows[0];
  if (firstRow?.status !== 'queued' || firstRow.failure_code !== 'PROVIDER_HTTP_500' || firstRow.attempt_count !== 1 || !firstRow.next_attempt_at) {
    throw new Error(`transient provider failure was not requeued: ${JSON.stringify(firstRow)}`);
  }

  await client.query(
    `UPDATE alert_deliveries SET next_attempt_at = now(), lease_until = NULL WHERE id = $1`,
    [deliveryId],
  );
  await runWorker(providerUrl);
  const second = await client.query(
    `SELECT d.status, d.provider_message_id, d.attempt_count, a.status AS alert_status
     FROM alert_deliveries d JOIN emergency_alerts a ON a.id = d.alert_id WHERE d.id = $1`,
    [deliveryId],
  );
  const secondRow = second.rows[0];
  if (providerCalls !== 2 || secondRow?.status !== 'provider_accepted' || secondRow.provider_message_id !== 'synthetic-provider-message' || secondRow.attempt_count !== 2 || secondRow.alert_status !== 'provider_accepted') {
    throw new Error(`provider retry did not complete honestly: ${JSON.stringify({ providerCalls, secondRow })}`);
  }
  console.log('provider-retry-smoke=passed');
} finally {
  await client.query('ROLLBACK').catch(() => undefined);
  await client.query('DELETE FROM app_users WHERE id = $1', [patientId]).catch(() => undefined);
  await client.end();
  await new Promise((resolve) => provider.close(resolve));
}
