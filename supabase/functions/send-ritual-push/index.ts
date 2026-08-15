/*
 * Ritual push. Intended to run once an hour on a schedule (pg_cron or the Supabase
 * scheduler) and fan out to whichever users are currently at their chosen hour in
 * their own timezone.
 *
 * Runs hourly rather than per-user because there is no per-user timer to keep warm:
 * the function asks "whose local clock says ritual_hour right now" and sends only
 * to those. Guarded by a shared secret since it is not user-authenticated.
 */
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.50.0';

interface ProfileRow {
  id: string;
  ritual_hour: number;
  timezone: string;
  streak_count: number;
}

function localHour(timezone: string, now: Date): number | null {
  try {
    const hour = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(now);
    const parsed = Number.parseInt(hour, 10);
    return Number.isFinite(parsed) ? parsed % 24 : null;
  } catch {
    // An unknown or malformed timezone should skip the user, not crash the run.
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const expected = Deno.env.get('CRON_SECRET');
  if (!expected || req.headers.get('x-cron-secret') !== expected) {
    return new Response('Forbidden', { status: 403 });
  }

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hello@sidq.app';
  if (!publicKey || !privateKey) return new Response('Push not configured', { status: 500 });

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, ritual_hour, timezone, streak_count');
  if (error) return new Response('Query failed', { status: 500 });

  const now = new Date();
  const due = (profiles ?? []).filter((p: ProfileRow) => localHour(p.timezone, now) === p.ritual_hour);
  if (due.length === 0) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('*')
    .in('user_id', due.map((p: ProfileRow) => p.id));

  const byUser = new Map(due.map((p: ProfileRow) => [p.id, p]));
  let sent = 0;
  const dead: string[] = [];

  await Promise.all(
    (subs ?? []).map(async (sub: { user_id: string; endpoint: string; p256dh: string; auth: string }) => {
      const profile = byUser.get(sub.user_id);
      const streak = profile?.streak_count ?? 0;

      const payload = JSON.stringify({
        title: 'Your day is ready',
        body:
          streak > 1
            ? `${streak} days running. Today's plan is waiting.`
            : 'Open it and start with the first thing.',
        url: '/today',
        tag: 'sidq-morning',
      });

      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent++;
      } catch (err) {
        // 404/410 mean the browser dropped the subscription. Collect and prune, or
        // the list grows forever and every run gets slower.
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(sub.endpoint);
        else console.error('Push failed', status, err);
      }
    }),
  );

  if (dead.length > 0) {
    await admin.from('push_subscriptions').delete().in('endpoint', dead);
  }

  return new Response(JSON.stringify({ sent, pruned: dead.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
