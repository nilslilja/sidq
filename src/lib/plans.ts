/*
 * The paywall, in one place.
 *
 * Structure copied from the products winning at this: a metered free tier, one
 * unlimited tier, and a third card that makes the middle one look obvious.
 *
 * ── What changed, and why it mattered ─────────────────────────────────────────
 * The third card used to promise "a real person sees your week, every week".
 * That was a service, not software: it needed a human being reading strangers'
 * weeks every Sunday forever. Nothing in this repository could deliver it, it
 * does not survive one more customer, and selling it would have been selling
 * something that does not exist. It is gone.
 *
 * In its place is a second seat. It is real because a seat is a database row and
 * nobody has to do any work when someone buys one.
 *
 * Every feature line below maps to a field in entitlements.ts, which is what the
 * enforcement points read. Nothing is claimed here that is not enforced there.
 */

import { entitlementsFor } from './entitlements';

export type PlanId = 'free' | 'pro' | 'duo';

export interface Plan {
  id: PlanId;
  name: string;
  price: string;
  cadence: string | null;
  /** The one line under the button. */
  promise: string;
  /** Names the tier this builds on, so lists never repeat themselves. */
  inherits: string | null;
  features: string[];
  cta: string;
  featured?: boolean;
}

const free = entitlementsFor('free');

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Starter',
    price: 'Free',
    cadence: null,
    promise: 'Enough to find out if it works.',
    inherits: null,
    cta: 'Download for Mac',
    features: [
      `${free.handoffsPerWeek} conversation handovers a week`,
      /*
       * There is no "assistants connected" line any more.
       *
       * It promised `${free.sources} assistant connected`, and nothing in the
       * app has ever enforced a source limit — entitlement.rs caps handovers
       * and the history window, and that is all. A paid feature the code does
       * not implement is a claim with a payment form attached.
       *
       * It also stopped describing anything real when the assistants moved
       * inside Sidq: there is no connecting step left to limit.
       */
      `Search back ${free.historyDays} days`,
      'Every conversation already on your Mac, from day one',
      'Full transcripts, never summaries',
      'Nothing uploaded, ever',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$19.99',
    cadence: '/ month',
    // The one sentence that has to do the work. It names the thing nobody else
    // has rather than listing capacity, because capacity is not why anyone pays.
    promise: 'Every AI you use, holding one memory.',
    inherits: 'Starter',
    cta: 'Subscribe',
    featured: true,
    /*
     * Two lines, because two things are actually different.
     *
     * Pro removes the weekly handover cap and the seven-day reach on search.
     * That is the entire difference `entitlement.rs` enforces, and padding the
     * card past it is how a pricing page starts lying.
     *
     * Removed from here:
     *
     *   "Learns what you actually finish, and plans to it" — the planner. It
     *   was taken out of the product and its five edge functions deleted, and
     *   the line stayed up on the paid card for weeks afterwards. A feature
     *   that does not exist is the worst thing a pricing page can sell.
     *
     *   "Your whole history, however far back it goes" appeared twice, once at
     *   each end of the list, so the card rendered it as two separate bullets.
     *
     * Rooms is still not listed. The engine and the UI both exist, but nothing
     * renders the panel, so there is no way for a paying customer to reach it.
     * Put it back the moment it has a way in.
     */
    features: [
      'Unlimited handovers, every day',
      'Search everything you have ever asked, however far back it goes',
    ],
  },
  {
    id: 'duo',
    name: 'Duo',
    price: '$29.99',
    cadence: '/ month',
    promise: 'Two people, one bill.',
    inherits: 'Pro',
    cta: 'Subscribe',
    features: [
      'A second seat, with everything in Pro',
      'One bill, one subscription to cancel',
    ],
  },
];

export const PRO = PLANS[1];

export function planById(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}
