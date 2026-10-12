import type { SQLiteDatabase } from 'expo-sqlite';
import type { AccessibilityPreferences } from '../types/preferences';

type PreferenceRow = { id: 'default'; simple_mode: number; large_text: number; high_contrast: number; reduce_motion: number; updated_at: string };

export async function getAccessibilityPreferences(db: SQLiteDatabase): Promise<AccessibilityPreferences> {
  const row = await db.getFirstAsync<PreferenceRow>('SELECT * FROM accessibility_preferences WHERE id = ?', 'default');
  if (!row) return { id: 'default', simpleMode: false, largeText: false, highContrast: false, reduceMotion: false, updatedAt: new Date().toISOString() };
  return { id: 'default', simpleMode: row.simple_mode === 1, largeText: row.large_text === 1, highContrast: row.high_contrast === 1, reduceMotion: row.reduce_motion === 1, updatedAt: row.updated_at };
}

export async function upsertAccessibilityPreferences(db: SQLiteDatabase, preferences: AccessibilityPreferences) {
  await db.runAsync(`INSERT INTO accessibility_preferences (id, simple_mode, large_text, high_contrast, reduce_motion, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET simple_mode = excluded.simple_mode, large_text = excluded.large_text, high_contrast = excluded.high_contrast, reduce_motion = excluded.reduce_motion, updated_at = excluded.updated_at`,
    preferences.id, preferences.simpleMode ? 1 : 0, preferences.largeText ? 1 : 0, preferences.highContrast ? 1 : 0, preferences.reduceMotion ? 1 : 0, preferences.updatedAt);
}
