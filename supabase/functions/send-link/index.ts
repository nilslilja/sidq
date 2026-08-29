/*
 * Take an email address and send the download link to it.
 *
 * ── Why this is a function and not a fetch from the page ─────────────────────
 * The obvious shape is: the page inserts the row, then calls something to send
 * the mail. That leaves a public endpoint whose whole job is "send an email to
 * whatever address I give you", which is a spam relay with extra steps.
 *
 * So this does both. It writes the row and sends the mail in one call, using
 * the service role, and the address it sends to is the one it just recorded.
 * There is nothing here that can be pointed at a stranger.
 *
 * ── Why it sends at all ──────────────────────────────────────────────────────
 * The form used to say "Sent." and nothing was sent; the address went into a
 * table and sat there. Sending by hand was the honest version of that and it is
 * the wrong answer at an event, where the whole value is that somebody is
 * standing in front of you and the link arrives while they still care.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { json, fail, preflight } from '../_shared/http.ts';

/** Cheap sanity, the same rule the table's own policy applies. */
const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/** Platforms the column will accept. Anything else is recorded as unknown. */
const KNOWN = ['windows', 'linux', 'phone', 'unknown'];

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail(req, 405, 'Method not allowed');

  const { email, platform } = (await req.json().catch(() => ({}))) as {
    email?: string;
    platform?: string;
  };

  const address = (email ?? '').trim().toLowerCase();
  if (!LOOKS_LIKE_EMAIL.test(address)) {
    return fail(req, 400, 'That does not look like an email address');
  }
  if (address.length > 254) return fail(req, 400, 'That address is too long');

  const where = KNOWN.includes(platform ?? '') ? platform! : 'unknown';

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  /*
   * Recorded first, and a duplicate is not an error.
   *
   * Somebody pressing twice is impatience. They still get the mail, because the
   * likeliest reason for pressing twice is that the first one has not arrived.
   */
  const { error } = await admin.from('waitlist').insert({ email: address, platform: where });
  if (error && error.code !== '23505') {
    console.error('waitlist insert failed', error);
    return fail(req, 500, 'Could not save that address');
  }

  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) {
    /*
     * The address is saved either way, so this is not a failure the person
     * needs to see. It is a failure the operator needs to see, which is what
     * the log is for. They get the mail by hand until the key is set.
     */
    console.error('RESEND_API_KEY is not set; address saved but no mail sent');
    return json(req, { saved: true, sent: false });
  }

  const sent = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('MAIL_FROM') ?? 'Nils from Sidq <nils@sidq.tech>',
      to: [address],
      subject: 'Your Sidq link',
      // Plain text on purpose. It is one link from one person, and an HTML
      // template with a logo in it would make a personal note look like a
      // newsletter, which is the one thing it must not look like.
      text: [
        'Here it is: https://sidq.tech',
        '',
        'Mac app, free, about a minute to set up. Open it on the machine you',
        'actually use your AIs on.',
        '',
        'If it breaks or it is rubbish, reply to this and tell me. I would',
        'rather know.',
        '',
        'Nils',
      ].join('\n'),
    }),
  }).catch(() => null);

  if (!sent?.ok) {
    console.error('resend failed', sent?.status, await sent?.text().catch(() => ''));
    return json(req, { saved: true, sent: false });
  }

  return json(req, { saved: true, sent: true });
});
