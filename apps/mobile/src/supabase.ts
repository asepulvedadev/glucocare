import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types/supabase';

type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const webStorage = typeof window !== 'undefined' ? window.localStorage : null;

const authStorage: StorageAdapter = {
  async getItem(key) {
    if (webStorage) return webStorage.getItem(key);
    try { return await SecureStore.getItemAsync(key); } catch { return null; }
  },
  async setItem(key, value) {
    if (webStorage) { webStorage.setItem(key, value); return; }
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key) {
    if (webStorage) { webStorage.removeItem(key); return; }
    await SecureStore.deleteItemAsync(key);
  },
};

const env = typeof process !== 'undefined' ? process.env : undefined;
const extra = Constants.expoConfig?.extra as { supabaseUrl?: string; supabasePublishableKey?: string } | undefined;
const url = env?.EXPO_PUBLIC_SUPABASE_URL ?? extra?.supabaseUrl;
const publishableKey = env?.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env?.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra?.supabasePublishableKey;

export const supabaseConfig = { url: url ?? '', publishableKey: publishableKey ?? '' };
export const isCloudConfigured = Boolean(supabaseConfig.url && supabaseConfig.publishableKey);

export const supabase: SupabaseClient<Database> | null = isCloudConfigured
  ? createClient<Database>(supabaseConfig.url, supabaseConfig.publishableKey, {
      auth: {
        storage: authStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
