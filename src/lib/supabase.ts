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

/**
 * Take the session the browser handed back.
 *
 * The tokens arrive in the URL fragment, which is where the browser put them so
 * they never travelled to a server. Without this step the app would advance past
 * sign-in while still being signed out, which is the worst of both.
 *
 * Never throws: a malformed callback leaves the person signed out and moving
 * forward, which is recoverable, rather than stuck on a dead screen.
 */
export async function adoptSession(urls: string[]): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  for (const url of urls) {
    const fragment = url.split('#')[1];
    if (!fragment) continue;

    const params = new URLSearchParams(fragment);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) continue;

    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (!error) {
      // Rust needs it too, to confirm the plan against billing rather than
      // taking this page's word for which tier the account is on.
      await shareSessionWithDesktop();
      return;
    }
  }
}

