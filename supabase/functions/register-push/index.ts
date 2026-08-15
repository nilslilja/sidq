/*
 * Stores a web push subscription against the signed-in user. Endpoints are unique,
 * so re-subscribing on the same device updates rather than duplicates.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { json, fail, preflight } from '../_shared/http.ts';

interface PushSubscriptionJSON {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail(req, 405, 'Method not allowed');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return fail(req, 401, 'Sign in first');

  const body = (await req.json().catch(() => ({}))) as PushSubscriptionJSON;
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return fail(req, 400, 'Incomplete push subscription');
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    },
    { onConflict: 'endpoint' },
  );

  if (error) return fail(req, 500, 'Could not save the subscription', error);
  return json(req, { ok: true });
});
