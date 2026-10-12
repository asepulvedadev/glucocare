import type { SQLiteDatabase } from 'expo-sqlite';
import { newId } from '../ids';

export type SyncConflictResolution = 'local' | 'remote';

export type SyncConflict = {
  id: string;
  entityType: string;
  entityId: string;
  localEventId?: string;
  localPayload: Record<string, unknown>;
  remotePayload: Record<string, unknown>;
  status: 'open' | 'resolved';
  resolution?: SyncConflictResolution;
  detectedAt: string;
  resolvedAt?: string;
};

type SyncConflictRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  local_event_id: string | null;
  local_payload_json: string;
  remote_payload_json: string;
  status: 'open' | 'resolved';
  resolution: SyncConflictResolution | null;
  detected_at: string;
  resolved_at: string | null;
};

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function mapRow(row: SyncConflictRow): SyncConflict {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    localEventId: row.local_event_id ?? undefined,
    localPayload: parsePayload(row.local_payload_json),
    remotePayload: parsePayload(row.remote_payload_json),
    status: row.status,
    resolution: row.resolution ?? undefined,
    detectedAt: row.detected_at,
    resolvedAt: row.resolved_at ?? undefined,
  };
}

export async function listOpenSyncConflicts(db: SQLiteDatabase): Promise<SyncConflict[]> {
  const rows = await db.getAllAsync<SyncConflictRow>(
    `SELECT * FROM sync_conflicts WHERE status = 'open' ORDER BY detected_at DESC`,
  );
  return rows.map(mapRow);
}

export async function recordSyncConflict(
  db: SQLiteDatabase,
  input: {
    entityType: string;
    entityId: string;
    localEventId?: string;
    localPayload: Record<string, unknown>;
    remotePayload: Record<string, unknown>;
  },
) {
  const detectedAt = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO sync_conflicts (id, entity_type, entity_id, local_event_id, local_payload_json, remote_payload_json, status, resolution, detected_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', NULL, ?, NULL)
     ON CONFLICT(entity_type, entity_id, status) DO UPDATE SET
       local_event_id = excluded.local_event_id,
       local_payload_json = excluded.local_payload_json,
       remote_payload_json = excluded.remote_payload_json,
       detected_at = excluded.detected_at`,
    newId(), input.entityType, input.entityId, input.localEventId ?? null,
    JSON.stringify(input.localPayload), JSON.stringify(input.remotePayload), detectedAt,
  );
}

export async function resolveSyncConflictsForEntity(
  db: SQLiteDatabase,
  entityType: string,
  entityId: string,
  resolution: SyncConflictResolution = 'local',
) {
  await db.runAsync(
    `UPDATE sync_conflicts SET status = 'resolved', resolution = ?, resolved_at = ?
     WHERE entity_type = ? AND entity_id = ? AND status = 'open'`,
    resolution, new Date().toISOString(), entityType, entityId,
  );
}
