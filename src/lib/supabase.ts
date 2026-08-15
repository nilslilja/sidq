import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isBackendConfigured } from './env';

let client: SupabaseClient | null = null;

/** Null when no backend is configured, callers fall back to the local store. */
export function getSupabase(): SupabaseClient | null {
  if (!isBackendConfigured) return null;
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

export async function getAccessToken(): Promise<string | undefined> {
  const supabase = getSupabase();
  if (!supabase) return undefined;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}
