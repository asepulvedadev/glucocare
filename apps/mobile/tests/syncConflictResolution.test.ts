import { describe, expect, it, vi } from 'vitest';
import { applyRemoteSyncConflict } from '../src/db/syncConflictResolution';
import type { SyncConflict } from '../src/db/syncConflictRepository';

function databaseMock() {
  const runAsync = vi.fn(async (..._args: unknown[]) => undefined);
  const withTransactionAsync = vi.fn(async (callback: () => Promise<void>) => callback());
  return { runAsync, withTransactionAsync };
}

function conflict(entityType: string, remotePayload: Record<string, unknown>): SyncConflict {
  return {
    id: 'conflict-1', entityType, entityId: 'reading-1', localPayload: {}, remotePayload,
    status: 'open', detectedAt: '2026-10-12T08:00:00.000Z',
  };
}

describe('reviewed sync conflict resolution', () => {
  it('applies a remote glucose projection and discards pending local events', async () => {
    const db = databaseMock();
    await applyRemoteSyncConflict(db as never, conflict('glucose_reading', {
      value_original: 130, unit_original: 'mg_dl', context: 'fasting', measured_at: '2026-10-12T08:00:00.000Z', classification: 'in_range',
    }));
    expect(db.withTransactionAsync).toHaveBeenCalledOnce();
    expect(db.runAsync.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO glucose_readings'))).toBe(true);
    expect(db.runAsync.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM sync_outbox'))).toBe(true);
    expect(db.runAsync.mock.calls.some(([sql]) => String(sql).includes("resolution = 'remote'"))).toBe(false);
    expect(db.runAsync.mock.calls.some(([sql]) => String(sql).includes('UPDATE sync_conflicts'))).toBe(true);
  });

  it('rejects entity types without an explicit safe projection', async () => {
    const db = databaseMock();
    await expect(applyRemoteSyncConflict(db as never, conflict('unknown', {}))).rejects.toThrow('not supported');
    expect(db.runAsync).not.toHaveBeenCalled();
  });
});
