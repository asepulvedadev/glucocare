import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from './db.js';

const SESSION_DAYS = Number(process.env.SESSION_DAYS ?? 30);

export type AuthUser = { id: string; email: string };
export type AuthSession = { accessToken: string; expiresAt: string; user: AuthUser };

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') throw new Error('EMAIL_REQUIRED');
  const email = value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 320) throw new Error('EMAIL_INVALID');
  return email;
}

function requirePassword(value: unknown) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 256) throw new Error('PASSWORD_INVALID');
  return value;
}

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 16_384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

async function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltEncoded, hashEncoded] = parts;
  const salt = Buffer.from(saltEncoded, 'base64url');
  const expected = Buffer.from(hashEncoded, 'base64url');
  const derived = scryptSync(password, salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function createSession(user: AuthUser, client?: PoolClient): Promise<AuthSession> {
  const accessToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  const db = client ?? pool;
  await db.query(
    `INSERT INTO app_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
    [tokenHash(accessToken), user.id, expiresAt],
  );
  return { accessToken, expiresAt, user };
}

export async function signUp(emailInput: unknown, passwordInput: unknown) {
  const email = normalizeEmail(emailInput);
  const password = requirePassword(passwordInput);
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userId = randomUUID();
    const inserted = await client.query<AuthUser>(
      `INSERT INTO app_users (id, email, password_hash) VALUES ($1, $2, $3) RETURNING id, email`,
      [userId, email, passwordHash],
    );
    const session = await createSession(inserted.rows[0], client);
    await client.query('COMMIT');
    return session;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (typeof error === 'object' && error && 'code' in error && (error as { code?: string }).code === '23505') throw new Error('EMAIL_IN_USE');
    throw error;
  } finally {
    client.release();
  }
}

export async function signIn(emailInput: unknown, passwordInput: unknown) {
  const email = normalizeEmail(emailInput);
  const password = requirePassword(passwordInput);
  const result = await pool.query<AuthUser & { password_hash: string }>(
    `SELECT id, email, password_hash FROM app_users WHERE lower(email) = lower($1)`, [email],
  );
  const user = result.rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) throw new Error('INVALID_CREDENTIALS');
  return createSession({ id: user.id, email: user.email });
}

export async function authenticate(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const result = await pool.query<AuthUser>(
    `SELECT u.id, u.email
     FROM app_sessions s JOIN app_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`, [tokenHash(token)],
  );
  return result.rows[0] ?? null;
}

export async function revokeSession(token: string | undefined) {
  if (!token) return;
  await pool.query('DELETE FROM app_sessions WHERE token_hash = $1', [tokenHash(token)]);
}

export async function deleteAccount(userId: string, token: string | undefined) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO account_deletion_events (id, user_id_hash) VALUES ($1, $2)`,
      [randomUUID(), tokenHash(userId)],
    );
    await client.query('DELETE FROM app_users WHERE id = $1', [userId]);
    if (token) await client.query('DELETE FROM app_sessions WHERE token_hash = $1', [tokenHash(token)]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function bearerToken(request: Request) {
  const header = request.headers.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined;
}
