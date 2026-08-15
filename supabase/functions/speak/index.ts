/*
 * The premium voice, proxied.
 *
 * ElevenLabs keys are account-wide and billed per character. A key in a desktop
 * bundle is a key anyone can extract from the binary and spend, so it lives here
 * and only here, exactly like the Anthropic key.
 *
 * This is also where the cost ceiling is enforced. The on-device voice handles
 * the thirty small interruptions a day; this speaks two or three lines that are
 * worth hearing. Without a server-side cap, one loop in a client turns a $0.30
 * user into a $300 one.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { fail, preflight } from '../_shared/http.ts';

/** Long enough for the morning line, short enough that nothing runs away. */
const MAX_CHARS = 400;
/** Roughly three lines a day. Generous for real use, fatal to a runaway loop. */
const MAX_CALLS_PER_DAY = 12;

/** Flash: lowest latency model they offer, which is the only one worth using here. */
const MODEL = 'eleven_flash_v2_5';

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail(req, 405, 'Method not allowed');

  const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
  const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID');
  if (!apiKey || !voiceId) return fail(req, 503, 'Premium voice is not configured');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return fail(req, 401, 'Sign in first');

  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  const line = (text ?? '').trim();
  if (!line) return fail(req, 400, 'Nothing to say');
  if (line.length > MAX_CHARS) return fail(req, 400, 'That line is too long to speak');

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Paid only. The premium voice is a Pro feature and the check is here rather
  // than in the client, because a client-side entitlement check is a suggestion.
  const { data: profile } = await admin
    .from('profiles')
    .select('plan_tier')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || profile.plan_tier === 'free') {
    return fail(req, 402, 'The premium voice is part of Pro');
  }

  // Metered on the same table as generation, tagged so the two do not interfere.
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await admin
    .from('speech_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', dayAgo);

  if ((count ?? 0) >= MAX_CALLS_PER_DAY) {
    return fail(req, 429, 'Spoken enough today');
  }

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_22050_32`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: line,
          model_id: MODEL,
          voice_settings: {
            // Steady rather than expressive. This voice says one calm sentence
            // while somebody is working; performance would be intolerable.
            stability: 0.55,
            similarity_boost: 0.75,
            speed: 0.96,
          },
        }),
      },
    );

    if (!res.ok) return fail(req, 502, 'The voice service did not answer');

    await admin.from('speech_events').insert({ user_id: user.id });

    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return fail(req, 502, 'Could not reach the voice service', err);
  }
});
