/*
 * coach-brief: the pre-session brief.
 *
 * Authorisation is not decided here. This function calls get_client_signals() as
 * the requesting coach, so Postgres re-checks the link and the share scope and
 * hands back rows already stripped of anything the client did not agree to. If the
 * link is missing or paused, the query returns nothing and there is no brief. The
 * model therefore cannot leak what it was never given.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.54.0';
import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import {
  COACH_BRIEF_PROMPT,
  buildCoachBriefMessage,
  gradeCoachBrief,
  thinDataBrief,
  type CoachBrief,
  type CoachBriefInput,
} from '../_shared/coach-brief.ts';
import { json, fail, preflight } from '../_shared/http.ts';

const MODEL = Deno.env.get('SIDQ_BRIEF_MODEL') ?? 'claude-sonnet-5';
const WINDOW_DAYS = 21;
/** Briefs change slowly. Re-running the model on every dashboard click is waste. */
const CACHE_MINUTES = 90;

interface SignalRow {
  date: string;
  status: string;
  est_minutes: number;
  task_completed: boolean;
  carry_count: number;
  title: string | null;
}

function extractJson(raw: string): CoachBrief | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as CoachBrief;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail(req, 405, 'Method not allowed');

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) return fail(req, 500, 'Server is not configured');

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData } = await supabase.auth.getUser();
  const coach = userData?.user;
  if (!coach) return fail(req, 401, 'Sign in first');

  const body = (await req.json().catch(() => ({}))) as { clientId?: string; force?: boolean };
  if (!body.clientId) return fail(req, 400, 'Missing clientId');

  // The link row is readable by both sides, so this is safe to read directly and
  // tells us the scope and the client's chosen label.
  const { data: link } = await supabase
    .from('coach_client_links')
    .select('share_scope, status, client_label')
    .eq('coach_id', coach.id)
    .eq('client_id', body.clientId)
    .maybeSingle();

  if (!link || link.status === 'revoked') return fail(req, 403, 'No active link with this client');
  if (link.status === 'paused' || link.share_scope === 'paused') {
    return json(req, {
      brief: {
        headline: 'This client has sharing paused.',
        whats_changed: [],
        worth_asking: ['Would it help to talk about what you are comfortable sharing?'],
        going_well: [],
        confidence: 'low',
        data_note: 'Nothing is being shared right now. That is their choice to make.',
      } satisfies CoachBrief,
      cached: false,
    });
  }

  // Postgres does the redaction. Whatever comes back is already permitted.
  const { data: rows, error } = await supabase.rpc('get_client_signals', {
    target_client: body.clientId,
    day_limit: WINDOW_DAYS,
  });
  if (error) return fail(req, 403, 'Could not read client signals', error);

  const signals = (rows ?? []) as SignalRow[];

  // Roll tasks up per day.
  const byDate = new Map<
    string,
    { planned: number; completed: number; plannedMinutes: number; completedMinutes: number }
  >();
  const titleStats = new Map<string, { planned: number; completed: number }>();

  for (const r of signals) {
    const d = byDate.get(r.date) ?? {
      planned: 0,
      completed: 0,
      plannedMinutes: 0,
      completedMinutes: 0,
    };
    d.planned++;
    d.plannedMinutes += r.est_minutes;
    if (r.task_completed) {
      d.completed++;
      d.completedMinutes += r.est_minutes;
    }
    byDate.set(r.date, d);

    if (r.title) {
      const t = titleStats.get(r.title) ?? { planned: 0, completed: 0 };
      t.planned++;
      if (r.task_completed) t.completed++;
      titleStats.set(r.title, t);
    }
  }

  const days = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, ...v }));

  // Not enough to say anything responsible. Refuse rather than invent.
  if (days.length < 3) {
    return json(req, { brief: thinDataBrief(days.length), cached: false });
  }

  const recurringTitles = [...titleStats.entries()]
    .filter(([, s]) => s.planned >= 3)
    .sort((a, b) => b[1].planned - a[1].planned)
    .slice(0, 6)
    .map(([title, s]) => ({
      title,
      timesPlanned: s.planned,
      timesCompleted: s.completed,
    }));

  const input: CoachBriefInput = {
    clientLabel: link.client_label ?? 'this client',
    shareScope: link.share_scope,
    windowDays: WINDOW_DAYS,
    closedDays: days.length,
    days,
    calibration: '',
    recurringTitles: recurringTitles.length > 0 ? recurringTitles : undefined,
  };

  let brief: CoachBrief;
  try {
    const client = new Anthropic({ apiKey: anthropicKey });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: [{ type: 'text', text: COACH_BRIEF_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [
        { role: 'user', content: buildCoachBriefMessage(input) },
        { role: 'assistant', content: '{' },
      ],
    });
    const raw = '{' + res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const parsed = extractJson(raw);
    if (!parsed) throw new Error('unparseable brief');
    brief = parsed;
  } catch (err) {
    console.error('brief generation failed', err);
    return json(req, { brief: thinDataBrief(days.length), cached: false, degraded: true });
  }

  /*
   * The guardrail is ENFORCED here, unlike the day planner where a violation is
   * only logged. A day plan with an odd duration is a small annoyance. A brief that
   * drifts into diagnosis goes to a professional who may act on it, so a failing
   * brief is withheld rather than shown.
   */
  const violations = gradeCoachBrief(brief, days.length);
  if (violations.length > 0) {
    console.warn(
      JSON.stringify({
        event: 'brief_rejected',
        model: MODEL,
        violations: violations.map((v) => `${v.rule}: ${v.detail}`),
      }),
    );
    return json(req, { brief: thinDataBrief(days.length), cached: false, degraded: true });
  }

  return json(req, { brief, cached: false, cacheMinutes: CACHE_MINUTES });
});
