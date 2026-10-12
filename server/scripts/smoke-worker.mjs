import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Client } = pg;
let clientClosed = false;
const client = new Client(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? 5432),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
});

await client.connect();
const fixtureUserId = randomUUID();
const fixtureContactId = randomUUID();
const fixtureInvitationId = randomUUID();
const fixtureAlertId = randomUUID();
const fixtureDeliveryId = randomUUID();
try {
  // Seed a delivery owned by this smoke test instead of depending on another
  // test leaving rows behind.
  await client.query(
    `INSERT INTO app_users (id, email, password_hash) VALUES ($1, $2, $3)`,
    [fixtureUserId, `worker-fixture-${fixtureUserId}@example.invalid`, 'synthetic-test-hash'],
  );
  await client.query(
    `INSERT INTO health_records (patient_id, entity_type, entity_id, payload)
     VALUES ($1, 'trusted_contact', $2, $3::jsonb)`,
    [fixtureUserId, fixtureContactId, JSON.stringify({ id: fixtureContactId, name: 'Worker fixture', email: 'worker-fixture@example.invalid', consentGranted: true })],
  );
  await client.query(
    `INSERT INTO contact_invitations (id, patient_id, contact_id, channel, token_hash, status, expires_at)
     VALUES ($1, $2, $3, 'email', $4, 'accepted', now() + interval '1 hour')`,
    [fixtureInvitationId, fixtureUserId, fixtureContactId, `worker-fixture-token-${fixtureInvitationId}`],
  );
  await client.query(
    `INSERT INTO emergency_alerts (id, patient_id, incident_id, status)
     VALUES ($1, $2, $3, 'not_configured')`,
    [fixtureAlertId, fixtureUserId, `worker-fixture-incident-${fixtureAlertId}`],
  );
  await client.query(
    `INSERT INTO alert_deliveries (id, alert_id, contact_id, channel, status, failure_code, attempt_count)
     VALUES ($1, $2, $3, 'email', 'not_configured', 'PROVIDER_NOT_CONFIGURED', 1)`,
    [fixtureDeliveryId, fixtureAlertId, fixtureContactId],
  );
  const result = await client.query(`
    SELECT d.id, d.status, d.failure_code, d.attempt_count
    FROM alert_deliveries d
    ORDER BY d.queued_at DESC
    LIMIT 1
  `);
  const latest = result.rows[0];
  if (latest?.status !== 'not_configured' || latest.failure_code !== 'PROVIDER_NOT_CONFIGURED') {
    throw new Error(`unexpected worker state: ${JSON.stringify(latest)}`);
  }
  const syntheticUserId = randomUUID();
  const syntheticInvitationId = randomUUID();
  await client.query(
    `INSERT INTO app_users (id, email, password_hash) VALUES ($1, $2, $3)`,
    [syntheticUserId, `worker-maintenance-${syntheticUserId}@example.invalid`, 'synthetic-test-hash'],
  );
  await client.query(
    `INSERT INTO app_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() - interval '1 minute')`,
    [`worker-expired-session-${syntheticUserId}`, syntheticUserId],
  );
  await client.query(
    `INSERT INTO contact_invitations (id, patient_id, contact_id, channel, token_hash, status, expires_at)
     VALUES ($1, $2, $3, 'email', $4, 'pending', now() - interval '1 minute')`,
    [syntheticInvitationId, syntheticUserId, `worker-expired-contact-${syntheticUserId}`, `worker-expired-token-${syntheticUserId}`],
  );
  // Simulate a worker crash after claiming a delivery. The next worker tick
  // must recover the expired lease instead of leaving the parent alert stuck.
  await client.query(
    `UPDATE alert_deliveries
     SET status = 'processing', lease_until = now() - interval '1 second',
         next_attempt_at = NULL, failure_code = NULL, last_error = NULL
     WHERE id = $1`,
    [latest.id],
  );
  await client.end();
  clientClosed = true;

  const worker = spawnSync(process.execPath, ['dist/alertWorker.js'], {
    env: { ...process.env, ALERT_WORKER_ONCE: 'true' },
    encoding: 'utf8',
  });
  if (worker.status !== 0) throw new Error(`worker recovery failed: ${worker.stderr || worker.stdout}`);

  const verificationClient = new Client(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT ?? 5432),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
  });
  await verificationClient.connect();
  try {
    const recovered = await verificationClient.query(
      'SELECT status, failure_code, attempt_count FROM alert_deliveries WHERE id = $1',
      [latest.id],
    );
    const row = recovered.rows[0];
    if (row?.status !== 'not_configured' || row.failure_code !== 'PROVIDER_NOT_CONFIGURED' || row.attempt_count <= latest.attempt_count) {
      throw new Error(`expired lease was not recovered: ${JSON.stringify(row)}`);
    }
    const maintenance = await verificationClient.query(
      `SELECT
         (SELECT count(*) FROM app_sessions WHERE user_id = $1) AS sessions,
         (SELECT status FROM contact_invitations WHERE id = $2) AS invitation_status`,
      [syntheticUserId, syntheticInvitationId],
    );
    const maintenanceRow = maintenance.rows[0];
    if (maintenanceRow?.sessions !== '0' || maintenanceRow.invitation_status !== 'expired') {
      throw new Error(`worker maintenance failed: ${JSON.stringify(maintenanceRow)}`);
    }
    await verificationClient.query('DELETE FROM app_users WHERE id = $1', [syntheticUserId]);
    await verificationClient.query('DELETE FROM app_users WHERE id = $1', [fixtureUserId]);
  } finally {
    await verificationClient.end();
  }
  console.log('worker-smoke=passed lease-recovery=passed');
} finally {
  await client.query('DELETE FROM app_users WHERE id = $1', [fixtureUserId]).catch(() => undefined);
  if (!clientClosed) await client.end();
}
