import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

export type CloudUser = { id: string; email: string };
export type AuthSession = { accessToken: string; expiresAt: string; user: CloudUser };
export type CloudRecord = { entity_type: string; entity_id: string; payload: Record<string, unknown>; updated_at: string };
export type CloudSyncSnapshot = { until: string; records: CloudRecord[] };
export type EmergencyDelivery = { id: string; contactId: string; channel: string; status: string; queuedAt: string; deliveredAt?: string; failureCode?: string };

type StorageAdapter = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void>; removeItem: (key: string) => Promise<void> };
const webStorage = typeof window !== 'undefined' ? window.localStorage : null;
const storage: StorageAdapter = {
  async getItem(key) { if (webStorage) return webStorage.getItem(key); try { return await SecureStore.getItemAsync(key); } catch { return null; } },
  async setItem(key, value) { if (webStorage) { webStorage.setItem(key, value); return; } await SecureStore.setItemAsync(key, value); },
  async removeItem(key) { if (webStorage) { webStorage.removeItem(key); return; } await SecureStore.deleteItemAsync(key); },
};

const env = typeof process !== 'undefined' ? process.env : undefined;
const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
const apiUrl = (env?.EXPO_PUBLIC_API_URL ?? extra?.apiUrl ?? '').replace(/\/$/, '');
const sessionKey = 'glucocare.session.v1';

export const cloudConfig = { apiUrl };
export const isCloudConfigured = Boolean(apiUrl);

export class CloudApiError extends Error {
  code: string;
  status: number;
  retryable: boolean;
  constructor(code: string, message: string, status: number, retryable = false) { super(message); this.name = 'CloudApiError'; this.code = code; this.status = status; this.retryable = retryable; }
}

async function getStoredSession() {
  const raw = await storage.getItem(sessionKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed.accessToken || !parsed.user?.id || !parsed.user.email || Date.parse(parsed.expiresAt) <= Date.now()) { await storage.removeItem(sessionKey); return null; }
    return parsed;
  } catch { await storage.removeItem(sessionKey); return null; }
}

async function saveSession(session: AuthSession | null) {
  if (session) await storage.setItem(sessionKey, JSON.stringify(session));
  else await storage.removeItem(sessionKey);
}

async function request<T>(path: string, init: RequestInit = {}, session?: AuthSession | null): Promise<T> {
  if (!isCloudConfigured) throw new CloudApiError('CLOUD_NOT_CONFIGURED', 'La sincronización no está configurada.', 0);
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (session?.accessToken) headers.set('authorization', `Bearer ${session.accessToken}`);
  const response = await fetch(`${apiUrl}${path}`, { ...init, headers });
  const raw = await response.text();
  let body: unknown = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body ? (body as { error?: { code?: string; message?: string; retryable?: boolean } }).error : undefined;
    throw new CloudApiError(error?.code ?? 'CLOUD_REQUEST_FAILED', error?.message ?? 'No se pudo completar la solicitud.', response.status, error?.retryable === true || response.status >= 500);
  }
  return body as T;
}

async function authenticate(path: string, email: string, password: string) {
  const result = await request<{ session: AuthSession }>(path, { method: 'POST', body: JSON.stringify({ email, password }) });
  await saveSession(result.session);
  return result.session;
}

export const cloudApi = {
  getStoredSession,
  signIn: (email: string, password: string) => authenticate('/v1/auth/signin', email, password),
  signUp: (email: string, password: string) => authenticate('/v1/auth/signup', email, password),
  async signOut(session?: AuthSession | null) { if (session) await request('/v1/auth/signout', { method: 'POST' }, session).catch(() => undefined); await saveSession(null); },
  async deleteAccount(session: AuthSession) { await request('/v1/account', { method: 'DELETE' }, session); await saveSession(null); },
  async uploadEvent(event: { id: string; eventType: string; entityType: string; entityId: string; payload: Record<string, unknown> }, session: AuthSession) {
    return request<{ status: string; eventId: string }>('/v1/sync/events', { method: 'POST', headers: { 'idempotency-key': event.id }, body: JSON.stringify({ eventId: event.id, eventType: event.eventType, entityType: event.entityType, entityId: event.entityId, payload: event.payload, schemaVersion: 1 }) }, session);
  },
  pull(since: string, session: AuthSession) { return request<CloudSyncSnapshot>(`/v1/sync?since=${encodeURIComponent(since)}`, {}, session); },
  createInvitation(contactId: string, channel: 'email' | 'sms', session: AuthSession) { return request<{ invitationId: string; status: string; deliveryStatus: string }>('/v1/contact-invitations', { method: 'POST', body: JSON.stringify({ contactId, channel }) }, session); },
  revokeInvitation(contactId: string, session: AuthSession) { return request<{ status: string }>('/v1/contact-invitations/revoke', { method: 'POST', body: JSON.stringify({ contactId }) }, session); },
  listInvitationStatuses(session: AuthSession) { return request<{ invitations: { contact_id: string; status: string; expires_at: string }[] }>('/v1/contact-invitations', {}, session); },
  queueEmergencyAlert(input: { incidentId: string; contactIds: string[]; timezone: string; channels: string[] }, session: AuthSession) { return request<{ alertId: string; status: 'queued'; deliveries: { contactId: string; channel: string; status: string }[] }>('/v1/emergency-alerts', { method: 'POST', body: JSON.stringify(input) }, session); },
  async getEmergencyAlertDeliveries(incidentId: string, session: AuthSession) {
    const result = await request<{ deliveries: { id: string; contact_id: string; channel: string; status: string; queued_at: string; delivered_at?: string; failure_code?: string }[] }>(`/v1/emergency-alerts/${encodeURIComponent(incidentId)}/deliveries`, {}, session);
    return result.deliveries.map((item) => ({ id: item.id, contactId: item.contact_id, channel: item.channel, status: item.status, queuedAt: item.queued_at, deliveredAt: item.delivered_at ?? undefined, failureCode: item.failure_code ?? undefined }));
  },
};
