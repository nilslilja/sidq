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
// 'mac' matters now that the copy branches on it: without it a Mac visitor
// who reached this form would be told they are on a waitlist for the
// platform they are already on.
const KNOWN = ['mac', 'windows', 'linux', 'phone', 'unknown'];


/*
 * ── Who actually receives this ───────────────────────────────────────────────
 *
 * The form this comes from is the non-Mac path: the site shows a download
 * button to anybody who can use one, and this email address field to everybody
 * else. So every person reading this mail is on Windows, Linux or a phone.
 *
 * It told all of them "Mac app, free, about a minute to set up. Open it on the
 * machine you actually use your AIs on." That is a download instruction sent
 * exclusively to people who cannot follow it, and it reads as not having looked
 * at who was asking.
 *
 * What it should be is what it always was: a waitlist confirmation, said
 * plainly, naming the thing they were on when they asked.
 */
const subjectFor = (where: string): string =>
  where === 'mac' ? 'Your Sidq link' : "You're on the list for Sidq";

function bodyFor(where: string): string {
  if (where === 'mac') {
    return [
      'Here it is: https://sidq.tech',
      '',
      'Free, about a minute to set up. Open it on the machine you actually use',
      'your AIs on.',
      '',
      'If it breaks or it is rubbish, reply to this and tell me. I would',
      'rather know.',
      '',
      'Nils',
    ].join('\n');
  }

  /*
   * Named rather than "your platform". Being told the thing you are actually
   * sitting at is the whole difference between a reply and a receipt, and it is
   * the only detail this mail has to offer that a person could not guess.
   */
  if (where === 'phone') {
    return [
      "You're on the list.",
      '',
      'Sidq reads the AI conversations on a computer, so there is no phone',
      'version and there is not going to be one soon. If you use AIs on a Mac',
      'as well, it works there today: https://sidq.tech',
      '',
      'If you want to tell me what you use, reply to this. I read all of them.',
      '',
      'Nils',
    ].join('\n');
  }

  /*
   * Named where the name is known. "unknown" is a real value — the browser did
   * not say, or said something this function does not recognise — and guessing
   * Windows at somebody on Linux is worse than saying nothing, because the one
   * thing this mail offers is having noticed.
   */
  const middle =
    where === 'windows' || where === 'linux'
      ? [
          `Sidq is Mac only today. ${where === 'windows' ? 'Windows' : 'Linux'}`,
          'is being built, and the parts that matter already run there: reading',
          'your assistants, and carrying a conversation between them.',
          '',
          'I will email you once, when it works. Not a newsletter.',
        ]
      : [
          'Sidq is Mac only today. Windows and Linux are being built, and the',
          'parts that matter already run there.',
          '',
          'I will email you once yours works. Not a newsletter.',
        ];

  return [
    "You're on the list.",
    '',
    ...middle,
    '',
    'If you want to tell me what you use and what you would want out of it,',
    'reply to this. I read all of them.',
    '',
    'Nils',
  ].join('\n');
}

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
      subject: subjectFor(where),
      // Plain text on purpose. It is one note from one person, and an HTML
      // template with a logo in it would make it look like a newsletter, which
      // is the one thing it must not look like.
      text: bodyFor(where),
    }),
  }).catch(() => null);

  if (!sent?.ok) {
    console.error('resend failed', sent?.status, await sent?.text().catch(() => ''));
    return json(req, { saved: true, sent: false });
  }

  return json(req, { saved: true, sent: true });
});
