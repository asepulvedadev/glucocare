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
    const glucoseInsert = db.runAsync.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO glucose_readings'));
    expect(glucoseInsert?.[0]).toContain('value_mg_dl');
    expect(glucoseInsert?.[0]).toContain('conversion_version');
    expect(db.runAsync.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM sync_outbox'))).toBe(true);
    expect(db.runAsync.mock.calls.some(([sql]) => String(sql).includes("resolution = 'remote'"))).toBe(false);
    expect(db.runAsync.mock.calls.some(([sql]) => String(sql).includes('UPDATE sync_conflicts'))).toBe(true);
  });

  it('rejects entity types without an explicit safe projection', async () => {
    const db = databaseMock();
    await expect(applyRemoteSyncConflict(db as never, conflict('unknown', {}))).rejects.toThrow('not supported');
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it('includes the remote medication schedule when applying a routine conflict', async () => {
    const db = databaseMock();
    const remote = conflict('medication', { name: 'Routine', presentation: 'tableta', dose_text: '1', route: 'oral', enabled: true, created_at: '2026-10-12T08:00:00.000Z', times: ['07:00', '19:00'] });
    remote.entityId = 'medication-1';
    await applyRemoteSyncConflict(db as never, remote);
    const update = db.runAsync.mock.calls.find(([sql]) => String(sql).includes('UPDATE medications'));
    expect(update?.[0]).toContain('times_json');
    expect(JSON.stringify(update)).toContain('07:00');
    expect(JSON.stringify(update)).toContain('tableta');
  });

  it('applies a remote emergency incident projection without delivery details', async () => {
    const db = databaseMock();
    const remote = conflict('emergency_incident', {
      id: 'incident-1',
      createdAt: '2026-10-12T08:00:00.000Z',
      reason: 'user_requested_help',
      contactState: 'remote_queued',
      providerMessageId: 'must-not-be-stored',
    });
    remote.entityId = 'incident-1';
    await applyRemoteSyncConflict(db as never, remote);
    const insert = db.runAsync.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO help_events'));
    expect(insert?.[0]).toContain('ON CONFLICT(id) DO UPDATE');
    expect(JSON.stringify(insert)).toContain('remote_queued');
    expect(JSON.stringify(insert)).not.toContain('must-not-be-stored');
  });

  it('preserves the full emergency card when reviewing a remote conflict', async () => {
    const db = databaseMock();
    const remote = conflict('emergency_card', {
      full_name: 'Patiente Sintética',
      diagnosis_year: '2020',
      insulin_use: 'yes',
      critical_conditions: 'Hipertensión',
      insurer: 'EPS Demo',
      policy_number: 'POL-123',
      emergency_number: '123',
      emergency_region: 'Bogotá',
      updated_at: '2026-10-12T08:00:00.000Z',
    });
    remote.entityId = 'default';
    await applyRemoteSyncConflict(db as never, remote);
    const insert = db.runAsync.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO emergency_card'));
    expect(insert?.[0]).toContain('diagnosis_year');
    expect(insert?.[0]).toContain('emergency_number');
    expect(JSON.stringify(insert)).toContain('EPS Demo');
  });

  it('keeps care-plan provenance and validity dates when applying a remote conflict', async () => {
    const db = databaseMock();
    const remote = conflict('care_plan', {
      target_bands: { low: 70, urgent_low: 54, high: 180, urgent_high: 250 },
      symptom_actions: ['Sigue las instrucciones de tu equipo de salud.'],
      source: 'Endocrinología · 2026',
      effective_from: '2026-10-01',
      effective_to: '2027-10-01',
      clinician_verified: true,
      created_at: '2026-10-12T08:00:00.000Z',
    });
    remote.entityId = 'default';
    await applyRemoteSyncConflict(db as never, remote);
    const insert = db.runAsync.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO care_plan'));
    expect(insert?.[0]).toContain('effective_from');
    expect(insert?.[0]).toContain('effective_to');
    expect(JSON.stringify(insert)).toContain('Endocrinología');
  });
});
