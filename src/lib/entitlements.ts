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
 * ── Six fields were removed, and what that says ──────────────────────────────
 * It held `sources`, `rebuildsPerWeek`, `companionMinutesPerDay`,
 * `calibration`, `rescue` and `replay`. Every one described a boundary of the
 * planner or the companion, both of which were taken out of the product, and
 * every one had exactly zero readers outside its own test.
 *
 * They were not harmless. `sources: 1` was still being quoted in the FAQ as "1
 * AI connected", which is a paid boundary that has never existed in the code
 * and which contradicts the entire pitch: Sidq reads every AI on the machine
 * with nothing to connect.
 *
 * A file written to stop the pricing page drifting from the product had drifted
 * from the product itself.
 *
 * ── Where the line is drawn now ──────────────────────────────────────────────
 * Two things, and `entitlement.rs` enforces both: how many conversations you
 * can hand over in a rolling week, and how far back search reaches. That is the
 * whole difference between free and paid, and stating only that is the point.
 */

export interface Entitlements {
  /**
   * Conversations handed to another assistant per rolling week.
   *
   * The metered action, because it is the one people came for. Costs nothing to
   * run (it is a local file read), so the limit exists to mark the value rather
   * than to cover a bill.
   *
   * Five, not ten. Ten was set so a casual user never met it, and that is the
   * wrong target: somebody who never meets the limit never has a reason to
   * think about paying, and never has a reason to invite anybody either. Five
   * is a real week of using it properly, and the two ways past it — a friend
   * joining, or upgrading — are both things worth doing.
   */
  handoffsPerWeek: number;
  /** How far back history and the week view go. */
  historyDays: number;
  /** Seats on the subscription, for the shared plan. */
  seats: number;
}

/*
 * What an invite is worth, for the site to quote.
 *
 * The database is the authority: `invite_bonus` in 0008_invites_expire.sql
 * decides the payout and `entitlement.rs` grants it, and the desktop app is
 * told the figures by the server so it cannot drift. The website has no server
 * call to make, so it has to hold a copy — and a copy of a number is exactly
 * how a pricing page starts lying.
 *
 * `entitlements.test.ts` reads `src-tauri/src/invites.rs` and fails if these
 * two stop matching the constants there, which mirror the migration.
 */
export const INVITE = {
  /** Extra handovers a week, to each side, for seven days. */
  bonusPerWeek: 5,
  /** How many invites an account may have counted in a week. */
  perWeek: 3,
  /** How long one is worth anything. */
  lastsDays: 7,
} as const;

const UNLIMITED = Number.POSITIVE_INFINITY;

const ENTITLEMENTS: Record<PlanId, Entitlements> = {
  free: {
    /*
     * ── Why the free plan is uncapped ────────────────────────────────────────
     *
     * It was five handovers a week and seven days of history. Five is a
     * sensible cap for a product with users and the wrong one for a product
     * with none: it bites during somebody's first serious session, which is
     * the only session that decides whether there is ever a second.
     *
     * The seven day window was worse than a limit, it was a misrepresentation.
     * Sidq's whole claim is that it already has everything you did before you
     * installed it, and a week of searchable history is indistinguishable from
     * a broken index. The cap hid the feature it existed to sell.
     *
     * Deliberate and reversible. It comes back when there is a base of people
     * who would notice, and entitlement.rs has to move at the same time — the
     * Rust test that compares these two numbers is the thing that stops the
     * site and the app lying to each other.
     */
    handoffsPerWeek: UNLIMITED,
    historyDays: UNLIMITED,
    seats: 1,
  },
  pro: {
    handoffsPerWeek: UNLIMITED,
    historyDays: UNLIMITED,
    seats: 1,
  },
  /*
   * Same product, two people, one bill. Real because a seat is a database row:
   * nothing here requires anybody to do manual work, which is the test the
   * previous third tier failed.
   */
  duo: {
    handoffsPerWeek: UNLIMITED,
    historyDays: UNLIMITED,
    seats: 2,
  },
  /*
   * Everything Duo has, without the two.
   *
   * Seats are unlimited because the mechanism that shares context is a folder
   * the team already syncs, not a server with a per-member cost — so the number
   * of people is a billing question rather than a capacity one, and it is
   * settled in the conversation that sells the tier.
   */
  team: {
    handoffsPerWeek: UNLIMITED,
    historyDays: UNLIMITED,
    seats: UNLIMITED,
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
  /*
   * Team was sold and never mapped.
   *
   * The pricing page has offered this tier since it was written and this
   * function did not know the word, so the moment anybody bought it they fell
   * through to free: no team folder, five handovers a week, seven days of
   * search. The parity tests below only ever looped over pro and duo, which is
   * why nothing caught it.
   */
  if (tier === 'team') return 'team';
  return 'free';
}

export function isUnlimited(value: number): boolean {
  return !Number.isFinite(value);
}

/** Formats a limit for the UI without printing "Infinity" at anyone. */
export function describeLimit(value: number, unit: string): string {
  return isUnlimited(value) ? `Unlimited ${unit}` : `${value} ${unit}`;
}
