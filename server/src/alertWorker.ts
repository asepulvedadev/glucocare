import { writeFile } from 'node:fs/promises';
import { closeDatabase, pool, runMigrations } from './db.js';
import { isAlertChannelConfigured, sendAlert, type AlertChannel } from './alertProviders.js';

const intervalMs = Number(process.env.ALERT_WORKER_INTERVAL_MS ?? 5_000);
const batchSize = Math.min(Math.max(Number(process.env.ALERT_WORKER_BATCH_SIZE ?? 10), 1), 50);
const maxAttempts = Math.min(Math.max(Number(process.env.ALERT_WORKER_MAX_ATTEMPTS ?? 5), 1), 10);
const runOnce = process.env.ALERT_WORKER_ONCE === 'true';
const heartbeatFile = process.env.ALERT_WORKER_HEARTBEAT_FILE ?? '/tmp/glucocare-alert-worker.heartbeat';
const maintenanceIntervalMs = Math.max(Number(process.env.ALERT_WORKER_MAINTENANCE_INTERVAL_MS ?? 60 * 60_000), 60_000);
let lastMaintenanceAt = 0;

type Delivery = {
  id: string;
  contact_id: string;
  channel: AlertChannel;
  attempt_count: number;
  incident_id: string;
  patient_id: string;
  consent_accepted: boolean;
  contact: { name?: string; email?: string; phone?: string };
};

function backoff(attempt: number) {
  return Math.min(15 * 60, 2 ** Math.max(attempt - 1, 0) * 10);
}

async function claimBatch() {
  const result = await pool.query<Delivery>(
    `WITH candidates AS (
       SELECT d.id
       FROM alert_deliveries d
       WHERE (
         (d.status = 'queued'
           AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= now())
           AND (d.lease_until IS NULL OR d.lease_until < now()))
         OR (d.status = 'processing' AND d.lease_until < now())
       )
       ORDER BY d.queued_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     UPDATE alert_deliveries d
     SET status = 'processing', lease_until = now() + interval '2 minutes',
         attempt_count = d.attempt_count + 1, updated_at = now()
     FROM candidates c
     WHERE d.id = c.id
     RETURNING d.id, d.contact_id, d.channel, d.attempt_count,
       (SELECT a.incident_id FROM emergency_alerts a WHERE a.id = d.alert_id) AS incident_id,
       (SELECT a.patient_id FROM emergency_alerts a WHERE a.id = d.alert_id) AS patient_id,
       EXISTS (SELECT 1 FROM contact_invitations i
         JOIN emergency_alerts a ON a.patient_id = i.patient_id
         WHERE a.id = d.alert_id AND i.contact_id = d.contact_id AND i.status = 'accepted') AS consent_accepted,
       COALESCE((SELECT r.payload FROM health_records r
         JOIN emergency_alerts a ON a.patient_id = r.patient_id
         WHERE a.id = d.alert_id AND r.entity_type = 'trusted_contact' AND r.entity_id = d.contact_id), '{}'::jsonb) AS contact`,
    [batchSize],
  );
  return result.rows;
}

async function updateParent(alertId: string) {
  await pool.query(
    `UPDATE emergency_alerts a SET status = CASE
       WHEN EXISTS (SELECT 1 FROM alert_deliveries d WHERE d.alert_id = a.id AND d.status IN ('queued', 'processing')) THEN 'queued'
       WHEN EXISTS (SELECT 1 FROM alert_deliveries d WHERE d.alert_id = a.id AND d.status IN ('provider_accepted', 'delivered')) THEN 'provider_accepted'
       WHEN EXISTS (SELECT 1 FROM alert_deliveries d WHERE d.alert_id = a.id AND d.status = 'not_configured') THEN 'not_configured'
       ELSE 'failed' END
     WHERE a.id = $1`, [alertId],
  );
}

async function handleDelivery(delivery: Delivery) {
  const alert = await pool.query<{ alert_id: string }>('SELECT alert_id FROM alert_deliveries WHERE id = $1', [delivery.id]);
  const alertId = alert.rows[0]?.alert_id;
  if (!alertId) return;
  if (!delivery.consent_accepted) {
    await pool.query(`UPDATE alert_deliveries SET status = 'failed', failure_code = 'CONTACT_CONSENT_REVOKED', last_error = 'CONTACT_CONSENT_REVOKED', lease_until = NULL, updated_at = now() WHERE id = $1`, [delivery.id]);
    await updateParent(alertId);
    return;
  }
  if (!isAlertChannelConfigured(delivery.channel)) {
    await pool.query(`UPDATE alert_deliveries SET status = 'not_configured', failure_code = 'PROVIDER_NOT_CONFIGURED', lease_until = NULL, updated_at = now() WHERE id = $1`, [delivery.id]);
    await updateParent(alertId);
    return;
  }
  try {
    const result = await sendAlert(delivery.channel, delivery.contact, delivery.incident_id);
    await pool.query(`UPDATE alert_deliveries SET status = 'provider_accepted', provider_message_id = $2, failure_code = NULL, last_error = NULL, next_attempt_at = NULL, lease_until = NULL, updated_at = now() WHERE id = $1`, [delivery.id, result.providerMessageId]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PROVIDER_FAILED';
    const terminal = message === 'PROVIDER_NOT_CONFIGURED' || delivery.attempt_count >= maxAttempts;
    await pool.query(
      `UPDATE alert_deliveries SET status = $2, failure_code = $3, last_error = $3, next_attempt_at = CASE WHEN $2 = 'queued' THEN now() + ($4 * interval '1 second') ELSE NULL END, lease_until = NULL, updated_at = now() WHERE id = $1`,
      [delivery.id, terminal ? 'failed' : 'queued', message.slice(0, 120), backoff(delivery.attempt_count)],
    );
  }
  await updateParent(alertId);
}

async function runMaintenance(now = Date.now()) {
  if (now - lastMaintenanceAt < maintenanceIntervalMs) return;
  // Expired sessions and invitations are no longer useful for authentication
  // or consent decisions. Keep this housekeeping in the private worker so the
  // public API never needs a cleanup request and never logs the affected rows.
  await pool.query(`DELETE FROM app_sessions WHERE expires_at <= now()`);
  await pool.query(`UPDATE contact_invitations SET status = 'expired' WHERE status = 'pending' AND expires_at <= now()`);
  lastMaintenanceAt = now;
}

async function tick() {
  await runMaintenance();
  const deliveries = await claimBatch();
  for (const delivery of deliveries) await handleDelivery(delivery);
  // The container health check uses this heartbeat to distinguish a live
  // process from a worker that is alive but cannot reach PostgreSQL/provider
  // dependencies. Write only after a complete successful tick.
  await writeFile(heartbeatFile, `${Date.now()}\n`, { mode: 0o600 });
}

await runMigrations();
console.log(`glucocare-alert-worker interval=${intervalMs}ms batch=${batchSize}`);
if (runOnce) {
  await tick();
  await closeDatabase();
  process.exit(0);
}
let stopping = false;
async function shutdown() { if (stopping) return; stopping = true; await closeDatabase(); process.exit(0); }
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
while (!stopping) {
  try { await tick(); } catch (error) { console.error('alert-worker-tick-failed', error instanceof Error ? error.message : error); }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
