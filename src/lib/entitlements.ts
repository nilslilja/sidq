import type { PlanId } from './plans';

/*
 * What each plan actually gets.
 *
 * This is the contract, and it is the only place that decides. Every claim on
 * the pricing page is a field in here, and every enforcement point reads from
 * here, so a promise on the marketing site cannot drift from what the product
 * does. A pricing page that says something the code does not enforce is not
 * marketing, it is a lie with a payment form attached.
 *
 * ── Where the line is drawn, and why ──────────────────────────────────────────
 * The free plan is metered, not crippled. Every capability is present. Two of
 * them run out, and they are the two that cost real money to run (model calls)
 * or represent the whole value (the calibration engine).
 *
 * Calibration is the deliberate wall. It needs at least three closed days and
 * twelve tasks before it says anything, and the free plan keeps only seven days
 * of history. So a free user can just about reach the point where Sidq starts
 * telling them something about themselves, and then it stops. That is the
 * upgrade moment, and it is honest: the thing being sold is the thing that took
 * a fortnight of their own data to produce, and nobody else has it.
 */

export interface Entitlements {
  /** Model calls per rolling week. The one thing that costs us money. */
  rebuildsPerWeek: number;
  /** Minutes the companion watches per day before going quiet. */
  companionMinutesPerDay: number;
  /** How far back history and the week view go. */
  historyDays: number;
  /** The engine that learns what you finish. The reason to pay. */
  calibration: boolean;
  /** Rebuild the remainder of a day that has gone wrong. */
  rescue: boolean;
  /** End-of-day breakdown of where the hours went. */
  replay: boolean;
  /*
   * Body doubling rooms.
   *
   * False on every plan right now. The engine, the presence channel and the
   * panel all exist and are tested, but the card no longer renders it, so there
   * is no way in. Kept in the contract rather than deleted because the work is
   * done and this flips to true the day it gets an entry point.
   */
  rooms: boolean;
  /** Seats on the subscription, for the shared plan. */
  seats: number;
}

const UNLIMITED = Number.POSITIVE_INFINITY;

const ENTITLEMENTS: Record<PlanId, Entitlements> = {
  /*
   * Three rebuilds a week is roughly "one plan, and two days you rebuild it".
   * Ten never bound anyone, which made the free plan indistinguishable from the
   * paid one, which is how you end up with a product nobody pays for.
   */
  free: {
    rebuildsPerWeek: 3,
    companionMinutesPerDay: 90,
    historyDays: 7,
    calibration: false,
    rescue: false,
    replay: true,
    rooms: false,
    seats: 1,
  },
  pro: {
    rebuildsPerWeek: UNLIMITED,
    companionMinutesPerDay: UNLIMITED,
    historyDays: UNLIMITED,
    calibration: true,
    rescue: true,
    replay: true,
    rooms: false,
    seats: 1,
  },
  /*
   * Same product, two people, one bill. Real because a seat is a database row:
   * nothing here requires anybody to do manual work, which is the test the
   * previous third tier failed.
   */
  duo: {
    rebuildsPerWeek: UNLIMITED,
    companionMinutesPerDay: UNLIMITED,
    historyDays: UNLIMITED,
    calibration: true,
    rescue: true,
    replay: true,
    rooms: false,
    seats: 2,
  },
};

export function entitlementsFor(plan: PlanId): Entitlements {
  return ENTITLEMENTS[plan] ?? ENTITLEMENTS.free;
}

/**
 * Map the database tier onto a plan.
 *
 * Anything unrecognised falls back to free rather than to paid. An unknown value
 * should cost someone a feature, never grant them one.
 */
export function planFromTier(tier: string | null | undefined): PlanId {
  if (tier === 'pro' || tier === 'paid') return 'pro';
  if (tier === 'duo') return 'duo';
  return 'free';
}

export function isUnlimited(value: number): boolean {
  return !Number.isFinite(value);
}

/** Formats a limit for the UI without printing "Infinity" at anyone. */
export function describeLimit(value: number, unit: string): string {
  return isUnlimited(value) ? `Unlimited ${unit}` : `${value} ${unit}`;
}
