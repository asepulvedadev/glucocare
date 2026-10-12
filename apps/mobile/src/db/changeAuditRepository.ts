import type { SQLiteDatabase } from 'expo-sqlite';
import { newId } from '../ids';

export type ChangeAuditInput = {
  id?: string;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after: unknown;
  occurredAt?: string;
};

/** Stores a local before/after snapshot for user-controlled care-plan changes. */
export async function insertChangeAuditEvent(db: SQLiteDatabase, input: ChangeAuditInput) {
  await db.runAsync(
    `INSERT INTO change_audit_events (id, entity_type, entity_id, occurred_at, action, before_json, after_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    input.id ?? newId(), input.entityType, input.entityId, input.occurredAt ?? new Date().toISOString(), input.action,
    input.before === undefined ? null : JSON.stringify(input.before), JSON.stringify(input.after),
  );
}
