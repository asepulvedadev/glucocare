import pg from 'pg';

const { Client } = pg;
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
    SELECT d.status, d.failure_code
    FROM alert_deliveries d
    ORDER BY d.queued_at DESC
    LIMIT 1
  `);
  const latest = result.rows[0];
  if (latest?.status !== 'not_configured' || latest.failure_code !== 'PROVIDER_NOT_CONFIGURED') {
    throw new Error(`unexpected worker state: ${JSON.stringify(latest)}`);
  }
  console.log('worker-smoke=passed');
} finally {
  await client.end();
}
