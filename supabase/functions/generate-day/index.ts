/*
 * generate-day — the one place the Anthropic key exists.
 *
 * Responsibilities, in order:
 *   1. verify the caller
 *   2. meter the free tier
 *   3. call the model
 *   4. parse defensively and return a plan that is always usable
 *
 * The client can call this as often as it likes; it cannot make it cheaper, cannot
 * see the prompt, and cannot see the key.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.54.0';
import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import {
  SYSTEM_PROMPT,
  FEWSHOT_INPUT,
  FEWSHOT_OUTPUT,
  REPAIR_PROMPT,
  buildUserMessage,
  buildRepairMessage,
  type PlanInput,
} from '../_shared/prompt.ts';
import { parsePlan, gradePlan, type Plan } from '../_shared/plan.ts';
import { json, fail, preflight } from '../_shared/http.ts';

const MODEL = Deno.env.get('SIDQ_MODEL') ?? 'claude-sonnet-5';
// Repair is a narrow, mechanical edit against an explicit fault list, so it does
// not need the planning model. A small fast model is the right tool and keeps the
// unhappy path from costing double.
const REPAIR_MODEL = Deno.env.get('SIDQ_REPAIR_MODEL') ?? 'claude-haiku-4-5-20251001';

/*
 * Free tier meter.
 *
 * Must match `entitlementsFor('free').rebuildsPerWeek` in src/lib/entitlements.ts.
 * It is duplicated rather than imported because Deno edge functions do not share
 * the app's module graph, and a build-time import across that boundary would be
 * more machinery than one number is worth. The pricing page reads the TypeScript
 * value, so if these two drift the page promises a number this rejects.
 *
 * Ten never bound anybody, which made the free plan indistinguishable from the
 * paid one. Three is "a plan, and two days you change your mind".
 */
const FREE_GENERATIONS_PER_WEEK = 3;

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
  const user = userData?.user ?? null;

  let body: { input?: PlanInput };
  try {
    body = await req.json();
  } catch {
    return fail(req, 400, 'Malformed request body');
  }

  const input = body.input;
  if (!input || !Array.isArray(input.goals) || typeof input.today !== 'string') {
    return fail(req, 400, 'Missing or invalid plan input');
  }

  // Signed-in users are metered. Anonymous callers are allowed through so
  // try-before-signup works, but they hold no history and cannot accumulate quota.
  if (user) {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: profile } = await admin
      .from('profiles')
      .select('plan_tier')
      .eq('id', user.id)
      .maybeSingle();

    // Metered only on free. Written as "is free" rather than "is not paid" so a
    // new paid tier is unmetered by default; the other way round, adding a tier
    // silently starts rate limiting the people paying the most.
    if (!profile || profile.plan_tier === 'free') {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { count } = await admin
        .from('generation_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', weekAgo);

      if ((count ?? 0) >= FREE_GENERATIONS_PER_WEEK) {
        return fail(req, 402, 'Free plan limit reached');
      }
    }

    await admin.from('generation_events').insert({ user_id: user.id });
  }

  const client = new Anthropic({ apiKey: anthropicKey });
  const userMessage = buildUserMessage(input);

  /*
   * Pass 1: generate.
   *
   * The system prompt is long and identical on every call, so it is cached. That
   * matters more than it looks: the morning ritual is a latency-sensitive moment,
   * and the cache turns most of the prompt into a near-free prefix.
   */
  let raw: string;
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [
        { role: 'user', content: FEWSHOT_INPUT },
        { role: 'assistant', content: FEWSHOT_OUTPUT },
        { role: 'user', content: userMessage },
        // Prefill the opening brace so a "Here is your plan:" preamble is
        // structurally impossible rather than something the parser has to survive.
        { role: 'assistant', content: '{' },
      ],
    });
    raw = '{' + res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  } catch (err) {
    return fail(req, 502, 'The planner is unavailable right now', err);
  }

  let { plan, recovered, repairs } = parsePlan(raw);
  let violations = gradePlan(plan);
  let errors = violations.filter((v) => v.severity === 'error');
  let didRepair = false;

  /*
   * Pass 2: repair, and only if the free deterministic grader found a hard fault.
   *
   * On the happy path this never fires, so the common case is still a single call.
   * When it does fire it is handed the exact violation list rather than being asked
   * to try again, which makes it both cheap and likely to land. A blind regenerate
   * would cost the same and fix nothing in particular.
   */
  if (errors.length > 0) {
    try {
      const res = await client.messages.create({
        model: REPAIR_MODEL,
        max_tokens: 1500,
        system: [{ type: 'text', text: REPAIR_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [
          {
            role: 'user',
            content: buildRepairMessage(
              userMessage,
              plan,
              errors.map((v) => `${v.rule}: ${v.detail}`),
            ),
          },
          { role: 'assistant', content: '{' },
        ],
      });
      const repairedRaw = '{' + res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      const second = parsePlan(repairedRaw);
      const secondErrors = gradePlan(second.plan).filter((v) => v.severity === 'error');

      // Keep the repair only if it is genuinely better. A repair that introduces
      // more faults than it fixes must not reach the user.
      if (secondErrors.length < errors.length) {
        plan = second.plan;
        recovered = recovered || second.recovered;
        repairs = [...repairs, ...second.repairs];
        violations = gradePlan(plan);
        errors = secondErrors;
        didRepair = true;
      }
    } catch (err) {
      // A failed repair is not a failed request. The first plan is still usable.
      console.error('repair pass failed', err);
    }
  }

  // Logged, never enforced. A user must never see an error because the model wrote
  // 30 minutes instead of 25. Silent drift is how the core IP rots, so every
  // violation is recorded for the eval to chase down.
  if (recovered || violations.length > 0) {
    console.warn(
      JSON.stringify({
        event: 'plan_quality',
        model: MODEL,
        repairModel: didRepair ? REPAIR_MODEL : null,
        calibrated: Boolean(input.calibration),
        recovered,
        repairs,
        violations: violations.map((v) => `${v.severity}:${v.rule}`),
      }),
    );
  }

  return json(req, { plan: plan as Plan, repaired: didRepair });
});
