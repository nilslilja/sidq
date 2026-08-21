import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isBackendConfigured } from './env';
import { desktopBridge } from './onboarding/bridge';

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

/**
 * Give the desktop app the session token, so it can check the plan itself.
 *
 * Rust asks the billing database what this account is on rather than trusting
 * a tier the page hands it, and this is the only thing the page contributes to
 * that: proof of who is asking. No-op in a browser tab, where there is no
 * desktop app to tell.
 */
export async function shareSessionWithDesktop(): Promise<void> {
  const bridge = desktopBridge();
  if (!bridge) return;

  const token = await getAccessToken();
  if (token) await bridge.setDesktopSession(token);
}
