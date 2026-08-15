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
 * In its place is a second seat. It is real because rooms already exist, a seat
 * is a database row, and nobody has to do any work when someone buys one.
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
      `${free.sources} assistant connected`,
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
    promise: 'Every assistant you use, holding one memory.',
    inherits: 'Starter',
    cta: 'Subscribe',
    featured: true,
    features: [
      'Learns what you actually finish, and plans to it',
      'Your real daily capacity, measured, not guessed',
      'Rescues the day when it has gone wrong',
      'Unlimited handovers, every assistant connected',
      /*
       * Rooms is NOT listed. The engine and the UI both exist, but the panel was
       * taken off the card and nothing renders it, so there is no way for a
       * paying customer to reach it. Selling a feature that cannot be opened is
       * the exact thing entitlements.ts was written to prevent, and leaving the
       * line up because the code is "basically there" is how that happens.
       *
       * Put it back the moment it has a way in.
       */
      'Your whole history, however far back it goes',
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
