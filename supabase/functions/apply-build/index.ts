// Take one application to the builders' night: save it, confirm it by email.
//
// Same shape as send-link, and the same reason it does both in one call rather
// than a save here and a mail somewhere else: two steps is how the mail quietly
// stops going out and nobody notices for a week. See send-link for the full
// version of that story.
//
// Nothing here is required to succeed for the person's application to count.
// The row is saved first; a mail that fails is logged for the operator and the
// person is still told they are in, because they are.

import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { json, fail, preflight } from '../_shared/http.ts';

const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

// Bounds, not validation. The point is to stop someone pasting a novel into a
// column, not to police what a person types about what they build.
const CAP = { name: 120, builds: 600, location: 120, link: 300 };

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail(req, 405, 'Method not allowed');

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const kind = body.kind === 'sponsor' ? 'sponsor' : 'builder';
  const name = String(body.name ?? '').trim().slice(0, CAP.name);
  const email = String(body.email ?? '').trim().toLowerCase();
  const builds = String(body.builds ?? '').trim().slice(0, CAP.builds);
  const location = String(body.location ?? '').trim().slice(0, CAP.location);
  const link = String(body.link ?? '').trim().slice(0, CAP.link);
  const ageRaw = Number(body.age);
  const age = Number.isFinite(ageRaw) && ageRaw > 0 && ageRaw < 120 ? Math.round(ageRaw) : null;

  if (!name) return fail(req, 400, 'Tell me your name');
  if (!LOOKS_LIKE_EMAIL.test(email)) return fail(req, 400, 'That does not look like an email');
  // A builder has to say what they build. That is the whole filter.
  if (kind === 'builder' && !builds) return fail(req, 400, 'Tell me what you build');

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { error } = await admin
    .from('event_applications')
    .insert({ kind, name, email, age, builds, location, link });
  if (error) {
    console.error('application insert failed', error);
    return fail(req, 500, 'Could not save that. Try again.');
  }

  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) {
    console.error('RESEND_API_KEY is not set; application saved but no mail sent');
    return json(req, { saved: true, sent: false });
  }

  const first = name.split(' ')[0];
  const text =
    kind === 'sponsor'
      ? [
          `${first}, thanks for reaching out about sponsoring.`,
          '',
          'This lands with me directly, not a list. I will come back to you',
          'personally with what I have in mind and what it gets you.',
          '',
          'Nils',
        ].join('\n')
      : [
          `${first}, you are in. Application received.`,
          '',
          'This is a room for people who actually build, and you said you do.',
          'I will send the date, the place and the details as they lock in.',
          '',
          'If you know one other person who ships and should be there, send',
          'them this: https://sidq.tech/build',
          '',
          'Nils',
        ].join('\n');

  const sent = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('MAIL_FROM') ?? 'Nils from Sidq <nils@sidq.tech>',
      to: [email],
      subject: kind === 'sponsor' ? 'Sponsoring the builders night' : 'You are in',
      text,
    }),
  }).catch(() => null);

  if (!sent?.ok) {
    console.error('resend failed', sent?.status, await sent?.text().catch(() => ''));
    return json(req, { saved: true, sent: false });
  }

  return json(req, { saved: true, sent: true });
});
