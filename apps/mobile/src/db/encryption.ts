import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { SQLiteDatabase } from 'expo-sqlite';
import { newId } from '../ids';

const DATABASE_KEY_NAME = 'glucocare.sqlcipher.key.v1';

function sqlLiteral(value: string) {
  return value.replace(/'/g, "''");
}

/**
 * Opens the native database with a device-bound SQLCipher key before any
 * schema query runs. Web uses the WASM SQLite implementation and has no
 * equivalent SecureStore-backed key; native release builds must never fall
 * back to a plaintext database when the key cannot be recovered.
 */
export async function initializeDatabaseEncryption(db: SQLiteDatabase) {
  if (Platform.OS === 'web') return;
  let key = await SecureStore.getItemAsync(DATABASE_KEY_NAME);
  if (!key) {
    key = `${newId()}${newId()}`;
    await SecureStore.setItemAsync(DATABASE_KEY_NAME, key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  await db.execAsync(`PRAGMA key = '${sqlLiteral(key)}'`);
}

export const databaseKeyName = DATABASE_KEY_NAME;
