import { LocalStore } from '@/lib/store/local';
import { SupabaseStore } from '@/lib/store/supabase';
import { getSupabase, getAccessToken } from '@/lib/supabase';
import { localDateKey, timezone } from '@/lib/date';
import { buildPlanInput, generatePlan, planToDay } from '@/lib/generate';
import { FOCUS_AREAS, BLOCKERS, RHYTHMS } from './steps';
import type { Day, Goal, Profile, WorkRhythm } from '@/types/domain';

/*
 * Turning the intake chips into a real plan.
 *
 * Until this existed, the last two steps of onboarding were a lie: the chips
 * were collected and dropped on the floor, and "Sidq just built your day"
 * showed three hardcoded sample tasks. Someone finished setup having been shown
 * a plan that had nothing to do with anything they had just told us.
 *
 * This runs the same generation path the web app uses, writes through the same
 * store, and saves the same profile. There is no onboarding-only shortcut,
 * because a shortcut here is how the first plan ends up differing from every
 * plan after it.
 */

const ANON_USER = 'local';

export interface FirstPlanInput {
  focus: string[];
  blockers: string[];
  rhythm: string | null;
  /** Where they heard about Sidq. Ours, not theirs; stored, never sent anywhere. */
  discovery?: string | null;
  /** What they want Sidq to do. Shapes what the card leads with. */
  intents?: string[];
}

export interface FirstPlanResult {
  day: Day;
  /** True when there is no backend and the plan came from the local planner. */
  isDemo: boolean;
}

/**
 * Chips are ids; the planner reads prose.
 *
 * The labels are the source of truth rather than a second hand-written mapping,
 * so adding a chip to steps.ts cannot silently produce a goal nobody wrote.
 */
function labelsFor(ids: string[], options: { id: string; label: string }[]): string[] {
  return ids
    .map((id) => options.find((o) => o.id === id)?.label)
    .filter((label): label is string => Boolean(label));
}

export async function buildFirstPlan(input: FirstPlanInput): Promise<FirstPlanResult> {
  const store = await pickStore();
  const date = localDateKey();

  const goalTexts = labelsFor(input.focus, FOCUS_AREAS);
  const derailers = labelsFor(input.blockers, BLOCKERS).join(', ');
  const rhythm = RHYTHMS.some((r) => r.id === input.rhythm)
    ? (input.rhythm as WorkRhythm)
    : null;

  const existing = await store.getProfile();
  const profile: Profile = {
    id: existing?.id ?? ANON_USER,
    email: existing?.email ?? null,
    workRhythm: rhythm,
    derailers,
    streakCount: existing?.streakCount ?? 0,
    streakLastActive: existing?.streakLastActive ?? null,
    graceRemaining: existing?.graceRemaining ?? 1,
    // Never set here. Billing owns this, and a client that can write its own
    // tier is not a paywall.
    planTier: existing?.planTier ?? 'free',
    ritualHour: existing?.ritualHour ?? 7,
    timezone: timezone(),
  };

  const goals: Goal[] = goalTexts.map((text, i) => ({
    id: `onboarding-${i}`,
    userId: profile.id,
    text,
    active: true,
    createdAt: new Date().toISOString(),
  }));

  /*
   * The two setup answers that are not goals.
   *
   * Kept locally rather than added to Profile: neither belongs in the planner's
   * input, and widening the shared type for two onboarding fields would push
   * them into every store implementation and every migration.
   */
  try {
    if (input.discovery) localStorage.setItem('sidq.discovery', input.discovery);
    if (input.intents?.length) {
      localStorage.setItem('sidq.intents', JSON.stringify(input.intents));
    }
  } catch {
    /* private mode; losing an analytics answer is not worth failing setup over */
  }

  await store.saveProfile(profile);
  await store.saveGoals(goals);

  /*
   * No calibration on the first plan, deliberately.
   *
   * There is no history on day one, so there is nothing to calibrate from. The
   * engine would return an empty brief anyway; passing undefined says so
   * honestly rather than sending the model an empty section to interpret.
   */
  const planInput = buildPlanInput({
    date,
    goals,
    profile,
    carriedOver: [],
  });

  const token = await getAccessToken();
  const { plan, isDemo } = await generatePlan(planInput, token);

  const day = planToDay(plan, profile.id, date);
  await store.saveDay(day);

  return { day, isDemo };
}

async function pickStore() {
  const supabase = getSupabase();
  if (!supabase) return new LocalStore();

  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  return userId ? new SupabaseStore(supabase, userId) : new LocalStore();
}
