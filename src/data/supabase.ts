import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export function createSupabaseClient(): SupabaseClient<Database> {
  const url: unknown = import.meta.env.VITE_SUPABASE_URL;
  const key: unknown = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (typeof url !== 'string' || typeof key !== 'string' || !key.startsWith('sb_publishable_')) {
    throw new Error('Укажите URL и publishable key Supabase в .env.local и перезапустите Vite.');
  }
  try {
    if (new URL(url).protocol !== 'https:') throw new Error();
  } catch { throw new Error('Проверьте HTTPS URL Supabase в .env.local.'); }
  return createClient<Database>(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
}
