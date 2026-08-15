import type { Day, Task } from '@/types/domain';
import { deriveCalibration, type Calibration } from './calibration';
import { completedCount, plannedCount } from '@/types/domain';
import { daysBetween, localDateKey } from './date';

/*
 * The coaching layer.
 *
 * A coach sees a client for one hour a week and is blind for the other 167. They
 * rely on self-report from people whose self-report is, by the nature of the
 * condition, unreliable. Sidq already measures what actually happened. That is the
 * product.
 *
 * The privacy model is not a compliance checkbox, it is load bearing on the data.
 * If a client believes their coach is reading every task they wrote, they will
 * start writing for the coach. The moment that happens the behavioural record stops
 * describing reality and the calibration engine, which is the entire reason a coach
 * would pay, becomes worthless.
 *
 * So the default is signals without content. A coach sees whether the work is
 * getting done, at what sizes, with what consistency, and where avoidance is
 * building. They do not see what the work was unless the client decides otherwise.
 *
 * Three rules hold everywhere in this file:
 *   1. Signals by default, content only by explicit client opt-in.
 *   2. Perfect symmetry. The client can always see exactly what their coach sees.
 *   3. Pausing is visible. A paused client shows as paused, never as silence, so a
 *      coach can tell the difference between "struggling and hiding" and "fine".
 */

export type LinkStatus = 'invited' | 'active' | 'paused' | 'revoked';

/**
 * What the client has agreed to share.
 *
 * Deliberately only three options. A granular permission matrix would be a lie:
 * nobody reads it, everybody clicks accept, and the client ends up sharing more
 * than they understood.
 */
export type ShareScope =
  /** Completion behaviour only. No task text ever leaves the client's account. */
  | 'signals'
  /** Signals plus the titles of tasks, so a coach can discuss specifics. */
  | 'signals-and-titles'
  /** Nothing flows. The coach sees that sharing is paused, and nothing else. */
  | 'paused';

export const SHARE_SCOPE_LABELS: Record<ShareScope, string> = {
  signals: 'How much you get done',
  'signals-and-titles': 'How much you get done, and what it was',
  paused: 'Nothing for now',
};

export const SHARE_SCOPE_DETAIL: Record<ShareScope, string> = {
  signals:
    'Your coach sees how much you finish, which task sizes work for you, your streak, and where things are piling up. They never see what any task actually said.',
  'signals-and-titles':
    'Everything above, plus the titles of your tasks, so your coach can talk about specifics instead of guessing.',
  paused:
    'Your coach sees that sharing is paused and nothing else. They will know it is paused rather than thinking you disappeared.',
};

export interface CoachLink {
  id: string;
  coachId: string;
  clientId: string;
  status: LinkStatus;
  shareScope: ShareScope;
  invitedAt: string;
  acceptedAt: string | null;
}

/** A single task as a coach is permitted to see it. */
export interface RedactedTask {
  /** Present only when the scope includes titles. */
  title?: string;
  estMinutes: number;
  completed: boolean;
  carryCount: number;
}

export interface RedactedDay {
  date: string;
  planned: number;
  completed: number;
  plannedMinutes: number;
  completedMinutes: number;
  tasks: RedactedTask[];
  /** Reflections are never shared. This flag only says whether one exists. */
  hasReflection: boolean;
}

/**
 * Strip a day down to what the scope permits.
 *
 * This runs on the client for rendering, but it is NOT the security boundary. The
 * database enforces the same rule through a security-definer function, because a
 * privacy model that lives only in the UI is not a privacy model. This exists so
 * the two agree and so the client can be shown precisely what is leaving.
 */
export function redactDay(day: Day, scope: ShareScope): RedactedDay | null {
  if (scope === 'paused') return null;

  const includeTitles = scope === 'signals-and-titles';
  const graded = day.tasks.filter((t) => t.status !== 'pending' && t.status !== 'active');
  const source = graded.length > 0 ? graded : day.tasks;

  return {
    date: day.date,
    planned: plannedCount(day),
    completed: completedCount(day),
    plannedMinutes: source.reduce((s, t) => s + t.estMinutes, 0),
    completedMinutes: source
      .filter((t) => t.status === 'completed')
      .reduce((s, t) => s + t.estMinutes, 0),
    tasks: source.map((t) => redactTask(t, includeTitles)),
    hasReflection: false,
  };
}

function redactTask(task: Task, includeTitles: boolean): RedactedTask {
  const base: RedactedTask = {
    estMinutes: task.estMinutes,
    completed: task.status === 'completed',
    carryCount: task.carryCount,
  };
  // `why` is never shared under any scope. It quotes the client's own goals back at
  // them, which is the most personal text in the product.
  return includeTitles ? { ...base, title: task.title } : base;
}

export type ClientTrend = 'improving' | 'steady' | 'slipping' | 'unknown';

/**
 * What a coach actually needs to know before a session, in priority order.
 * Designed so a coach with fifteen clients can scan it in under a minute.
 */
export interface ClientSummary {
  clientId: string;
  displayName: string;
  status: LinkStatus;
  shareScope: ShareScope;

  /** Null when paused or when there is no history yet. */
  calibration: Calibration | null;
  completionRate: number | null;
  streakCount: number;
  /** Days since they last closed a day. Null if they never have. */
  daysSinceActive: number | null;
  trend: ClientTrend;

  /**
   * The one thing worth raising in the next session. This is the product: a coach
   * should not have to derive it from a chart.
   */
  headline: string;
  /** True when this client should be looked at before the others. */
  needsAttention: boolean;
}

const RECENT_WINDOW = 7;

/** Compares the last week against the week before it. */
function trendFor(days: Day[]): ClientTrend {
  const closed = days.filter((d) => d.status === 'closed').sort((a, b) => b.date.localeCompare(a.date));
  if (closed.length < 6) return 'unknown';

  const recent = closed.slice(0, RECENT_WINDOW);
  const prior = closed.slice(RECENT_WINDOW, RECENT_WINDOW * 2);
  if (prior.length < 3) return 'unknown';

  const rate = (set: Day[]) => {
    const planned = set.reduce((s, d) => s + plannedCount(d), 0);
    if (planned === 0) return 0;
    return set.reduce((s, d) => s + completedCount(d), 0) / planned;
  };

  const delta = rate(recent) - rate(prior);
  if (delta > 0.08) return 'improving';
  if (delta < -0.08) return 'slipping';
  return 'steady';
}

/**
 * Build the coach-facing summary for one client.
 *
 * `days` must already have been filtered by the database to what this coach is
 * permitted to see. This function assumes authorisation happened upstream and only
 * handles presentation.
 */
export function summariseClient(args: {
  clientId: string;
  displayName: string;
  status: LinkStatus;
  shareScope: ShareScope;
  days: Day[];
  streakCount: number;
  today?: string;
}): ClientSummary {
  const { clientId, displayName, status, shareScope, days, streakCount } = args;
  const today = args.today ?? localDateKey();

  if (status === 'paused' || shareScope === 'paused') {
    return {
      clientId,
      displayName,
      status: 'paused',
      shareScope,
      calibration: null,
      completionRate: null,
      streakCount: 0,
      daysSinceActive: null,
      trend: 'unknown',
      headline: 'Sharing is paused. They chose privacy, not silence.',
      needsAttention: false,
    };
  }

  const closed = days.filter((d) => d.status === 'closed');
  const calibration = deriveCalibration(days);
  const trend = trendFor(days);

  const lastActive = closed
    .map((d) => d.date)
    .sort()
    .at(-1);
  const daysSinceActive = lastActive ? daysBetween(lastActive, today) : null;

  const totalPlanned = closed.reduce((s, d) => s + plannedCount(d), 0);
  const completionRate =
    totalPlanned > 0 ? closed.reduce((s, d) => s + completedCount(d), 0) / totalPlanned : null;

  const { headline, needsAttention } = clientHeadline({
    daysSinceActive,
    trend,
    calibration,
    completionRate,
    closedDays: closed.length,
  });

  return {
    clientId,
    displayName,
    status,
    shareScope,
    calibration,
    completionRate,
    streakCount,
    daysSinceActive,
    trend,
    headline,
    needsAttention,
  };
}

/**
 * The single most useful sentence about this client right now.
 *
 * Ordered by what a coach would actually want surfaced first. Disengagement beats
 * everything: a client who has stopped opening the app is the one at risk, and no
 * completion statistic matters more than that.
 */
function clientHeadline(args: {
  daysSinceActive: number | null;
  trend: ClientTrend;
  calibration: Calibration;
  completionRate: number | null;
  closedDays: number;
}): { headline: string; needsAttention: boolean } {
  const { daysSinceActive, trend, calibration, completionRate, closedDays } = args;

  if (daysSinceActive === null) {
    return { headline: 'Has not closed a day yet. Worth checking the setup landed.', needsAttention: true };
  }
  if (daysSinceActive >= 5) {
    return {
      headline: `Nothing closed in ${daysSinceActive} days. This is the one to open the session with.`,
      needsAttention: true,
    };
  }
  if (daysSinceActive >= 3) {
    return { headline: `Quiet for ${daysSinceActive} days.`, needsAttention: true };
  }
  if (trend === 'slipping') {
    return {
      headline: 'Completion is dropping week over week. Something changed recently.',
      needsAttention: true,
    };
  }
  if (calibration.chronicCarryRate > 0.3) {
    return {
      headline: `${Math.round(calibration.chronicCarryRate * 100)}% of tasks keep rolling over. Avoidance is building somewhere specific.`,
      needsAttention: true,
    };
  }
  if (trend === 'improving') {
    return { headline: 'Completion is up on last week. Worth naming out loud.', needsAttention: false };
  }
  if (closedDays < 3) {
    return { headline: 'Just getting started. Not enough history to read yet.', needsAttention: false };
  }
  if (completionRate !== null && completionRate >= 0.7) {
    return { headline: 'Steady and finishing most of what they take on.', needsAttention: false };
  }
  return { headline: 'Holding steady.', needsAttention: false };
}

/** Attention first, then quietest. A coach should never have to sort this. */
export function orderForCoach(clients: ClientSummary[]): ClientSummary[] {
  const rank = (c: ClientSummary) => {
    if (c.status === 'paused') return 3;
    if (c.needsAttention) return 0;
    if (c.trend === 'improving') return 2;
    return 1;
  };
  return [...clients].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return (b.daysSinceActive ?? 0) - (a.daysSinceActive ?? 0);
  });
}

/** Seat accounting. Paused clients still hold a seat; revoked ones do not. */
export function seatsUsed(links: CoachLink[]): number {
  return links.filter((l) => l.status !== 'revoked').length;
}

export function canInvite(links: CoachLink[], seatLimit: number): boolean {
  return seatsUsed(links) < seatLimit;
}
