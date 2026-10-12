import type { SQLiteDatabase } from 'expo-sqlite';
import { newId } from '../ids';
import type { MealEvent, MealType, NewMealEvent } from '../types/meals';
import { enqueueOutbox } from './outboxRepository';

type MealRow = {
  id: string;
  meal_type: MealType;
  occurred_at: string;
  note: string | null;
  created_at: string;
  sync_state: MealEvent['syncState'];
};

function mapRow(row: MealRow): MealEvent {
  return {
    id: row.id,
    mealType: row.meal_type,
    occurredAt: row.occurred_at,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    syncState: row.sync_state,
  };
}

export async function listMealEvents(db: SQLiteDatabase): Promise<MealEvent[]> {
  const rows = await db.getAllAsync<MealRow>('SELECT * FROM meal_events ORDER BY occurred_at DESC');
  return rows.map(mapRow);
}

export async function listMealEventsForDay(db: SQLiteDatabase, start: string, end: string): Promise<MealEvent[]> {
  const rows = await db.getAllAsync<MealRow>('SELECT * FROM meal_events WHERE occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at ASC', start, end);
  return rows.map(mapRow);
}

export async function insertMealEvent(db: SQLiteDatabase, input: NewMealEvent): Promise<MealEvent> {
  const stored: MealEvent = { ...input, id: newId(), createdAt: new Date().toISOString(), syncState: 'pending' };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO meal_events (id, meal_type, occurred_at, note, created_at, sync_state)
       VALUES (?, ?, ?, ?, ?, ?)`,
      stored.id, stored.mealType, stored.occurredAt, stored.note ?? null, stored.createdAt, stored.syncState,
    );
    await enqueueOutbox(db, { id: newId(), entityType: 'meal_event', entityId: stored.id, eventType: 'meal_event.recorded.v1', payload: stored });
  });
  return stored;
}
