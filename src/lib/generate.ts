import type { Plan } from '@shared/plan';
import type { PlanInput } from '@shared/prompt';
import { env, isBackendConfigured } from './env';
import { mockPlan } from './mock-planner';
import { localDateKey, weekdayName, timezone } from './date';
import type { Day, Goal, Profile, Task } from '@/types/domain';

export interface GenerateResult {
  plan: Plan;
  /** True when the plan came from the local heuristic rather than the model. */
  isDemo: boolean;
}

export class PlanLimitReachedError extends Error {
  constructor() {
    super('Free plan limit reached');
    this.name = 'PlanLimitReachedError';
  }
}

/** Builds the model input from stored state. Kept pure so it is trivially testable. */
export function buildPlanInput(args: {
  date: string;
  goals: Goal[];
  profile: Pick<Profile, 'workRhythm' | 'derailers'>;
  carriedOver: Pick<Task, 'title' | 'carryCount'>[];
  /** Rendered by the calibration engine. Empty string until there is evidence. */
  calibration?: string;
}): PlanInput {
  return {
    today: args.date,
    weekday: weekdayName(args.date),
    goals: args.goals.filter((g) => g.active).map((g) => g.text),
    workRhythm: args.profile.workRhythm,
    derailers: args.profile.derailers,
    carriedOver: args.carriedOver.map((t) => ({ title: t.title, carryCount: t.carryCount })),
    calendar: [],
    calibration: args.calibration,
  };
}

/**
 * Calls the edge function. The Anthropic key lives there and only there. It is
 * never present in a bundle, an env var prefixed VITE_, or a network tab.
 */
export async function generatePlan(input: PlanInput, accessToken?: string): Promise<GenerateResult> {
  if (!isBackendConfigured) {
    // Enough delay for the loader to read as work rather than a flash.
    await new Promise((r) => setTimeout(r, 1400));
    return { plan: mockPlan(input), isDemo: true };
  }

  /*
   * A missing backend must degrade, not fail.
   *
   * Configuring Supabase but not yet deploying the edge function is the normal
   * state for days during setup, and it used to turn every "build my day" into
   * a bare "Load failed" with no plan and no explanation. The local planner is
   * already here and already good enough to work with, so it takes over and the
   * result is flagged as a demo so the UI can say where it came from.
   *
   * The one error still thrown is the free-tier limit: that is a real answer
   * from a working server and quietly planning around it would hide the paywall.
   */
  let res: Response;
  try {
    res = await fetch(`${env.supabaseUrl}/functions/v1/generate-day`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${accessToken ?? env.supabaseAnonKey}`,
      },
      body: JSON.stringify({ input, timezone: timezone() }),
    });
  } catch {
    // Offline, or no such host. Both are survivable.
    return { plan: mockPlan(input), isDemo: true };
  }

  if (res.status === 402) throw new PlanLimitReachedError();

  if (!res.ok) {
    // 404 means the function was never deployed; 5xx means it is down. Neither
    // is a reason to leave someone without a day.
    return { plan: mockPlan(input), isDemo: true };
  }

  try {
    const body = (await res.json()) as { plan: Plan };
    return { plan: body.plan, isDemo: false };
  } catch {
    // A 200 with a body we cannot parse is a deployment mid-flight.
    return { plan: mockPlan(input), isDemo: true };
  }
}

/** Turns a generated plan into the day's task rows, preserving carry lineage. */
export function planToTasks(
  plan: Plan,
  dayId: string,
  carriedIndex: Map<string, { fromDayId: string; carryCount: number }>,
): Task[] {
  return plan.tasks.map((t, i) => {
    const carried = carriedIndex.get(t.title.toLowerCase());
    return {
      id: `${dayId}:${i}`,
      dayId,
      title: t.title,
      why: t.why,
      priorityRank: i,
      estMinutes: t.est_minutes,
      status: 'pending' as const,
      carriedFromDayId: carried?.fromDayId ?? null,
      carryCount: carried?.carryCount ?? 0,
      completedAt: null,
    };
  });
}

export function planToDay(plan: Plan, userId: string, date = localDateKey()): Day {
  const id = `${userId}:${date}`;
  return {
    id,
    userId,
    date,
    generatedAt: new Date().toISOString(),
    status: 'ready',
    topPriority: plan.top_priority,
    note: plan.note,
    tasks: planToTasks(plan, id, new Map()),
  };
}
