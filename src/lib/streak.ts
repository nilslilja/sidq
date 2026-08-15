import { daysBetween } from './date';

/*
 * The forgiving streak.
 *
 * A conventional streak is a loss-aversion machine: it works right up until the
 * first miss, then it punishes you for the miss and you never open the app again.
 * For this audience that is the whole retention story, so the streak here is built
 * to bend.
 *
 *   - Missed days are paid for out of a grace balance before the count is touched.
 *   - Grace refills as a reward for consistency, one per full week.
 *   - A genuine break resets to 1, never to 0. You showed up today; that counts.
 *
 * There is no state anywhere in here for "streak lost". The UI cannot shame the
 * user with a number this module refuses to produce.
 */

export const MAX_GRACE = 2;
export const GRACE_EARN_INTERVAL = 7;
export const STARTING_GRACE = 2;

export interface StreakState {
  count: number;
  lastActive: string | null;
  grace: number;
}

export type StreakOutcome =
  | 'first-day'
  | 'already-counted'
  | 'continued'
  | 'grace-used'
  | 'restarted';

export interface StreakResult {
  state: StreakState;
  outcome: StreakOutcome;
  /** Days covered by grace on this transition. Drives the "covered for you" copy. */
  graceSpent: number;
}

export function initialStreak(): StreakState {
  return { count: 0, lastActive: null, grace: STARTING_GRACE };
}

/** Earn one grace per completed week of streak, capped. Consistency buys slack. */
function withEarnedGrace(count: number, grace: number): number {
  if (count > 0 && count % GRACE_EARN_INTERVAL === 0) {
    return Math.min(MAX_GRACE, grace + 1);
  }
  return grace;
}

/**
 * Call once when a day is closed having earned it (see `dayCountsAsActive`).
 * Pure. Hand it the current state and today's key, store what comes back.
 */
export function recordActiveDay(state: StreakState, today: string): StreakResult {
  if (state.lastActive === null) {
    return {
      state: { count: 1, lastActive: today, grace: state.grace },
      outcome: 'first-day',
      graceSpent: 0,
    };
  }

  const gap = daysBetween(state.lastActive, today);

  // Same day, or a clock that went backwards. Idempotent either way.
  if (gap <= 0) {
    return { state, outcome: 'already-counted', graceSpent: 0 };
  }

  if (gap === 1) {
    const count = state.count + 1;
    return {
      state: { count, lastActive: today, grace: withEarnedGrace(count, state.grace) },
      outcome: 'continued',
      graceSpent: 0,
    };
  }

  const missed = gap - 1;

  if (missed <= state.grace) {
    const count = state.count + 1;
    const grace = state.grace - missed;
    return {
      state: { count, lastActive: today, grace: withEarnedGrace(count, grace) },
      outcome: 'grace-used',
      graceSpent: missed,
    };
  }

  // Past what grace can cover. Restart at 1 (today happened) and hand back a
  // fresh grace balance so the next stretch is not immediately fragile.
  return {
    state: { count: 1, lastActive: today, grace: STARTING_GRACE },
    outcome: 'restarted',
    graceSpent: 0,
  };
}

/** True when the day earned its place in the streak. One finished task is enough. */
export function dayCountsAsActive(completed: number): boolean {
  return completed >= 1;
}

export interface StreakView {
  count: number;
  grace: number;
  /** Today has not been claimed yet and the streak is still intact if they act. */
  atRisk: boolean;
  claimedToday: boolean;
}

export function viewStreak(state: StreakState, today: string): StreakView {
  const claimedToday = state.lastActive === today;
  const gap = state.lastActive ? daysBetween(state.lastActive, today) : Infinity;

  return {
    count: state.count,
    grace: state.grace,
    claimedToday,
    atRisk: !claimedToday && gap === 1 && state.count > 0,
  };
}

/**
 * Copy for the streak line. Warm, factual, never a scold. This is where a
 * conventional app would say "you broke your streak".
 */
export function streakMessage(result: StreakResult): string {
  const { state, outcome, graceSpent } = result;
  const days = state.count === 1 ? '1 day' : `${state.count} days`;

  switch (outcome) {
    case 'first-day':
      return 'Day one. That is the hard one.';
    case 'continued':
      return `${days} running.`;
    case 'grace-used':
      return graceSpent === 1
        ? `${days} running. Yesterday is covered. You had a spare.`
        : `${days} running. The gap is covered. You had spares.`;
    case 'restarted':
      return 'Back on. Starting at one, which is where everyone starts.';
    case 'already-counted':
      return `${days} running.`;
  }
}
