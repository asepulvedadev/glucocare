import { spawnSync } from 'node:child_process';
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
try {
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
  } finally {
    await verificationClient.end();
  }
  console.log('worker-smoke=passed lease-recovery=passed');
} finally {
  if (!clientClosed) await client.end();
}
