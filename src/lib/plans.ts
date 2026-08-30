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

import { entitlementsFor } from "./entitlements";

export type PlanId = "free" | "pro" | "duo";

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
  /**
   * A second reading of the price, for a plan whose headline number misleads.
   *
   * Duo is $29.99 against Pro's $19.99, so down a row of cards it reads as the
   * expensive one. It is the cheapest per person on the page, and that only
   * becomes true after the reader divides by two, which they will not do. It
   * belongs beside the number, not four bullets below it.
   */
  priceNote?: string;
  /**
   * Lines that state a ceiling rather than a capability.
   *
   * They belong on the free card and nowhere above it: a paid tier exists
   * precisely because it removes them. Kept apart from `features` so that
   * `inheritedFeatures` cannot carry them upward, which it did the first time
   * this was built and left Pro promising unlimited handovers directly above
   * a line reading "5 conversation handovers a week".
   */
  limits?: readonly string[];
  featured?: boolean;
}

const free = entitlementsFor("free");

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Starter",
    price: "Free",
    cadence: null,
    promise: "Enough to find out if it works.",
    inherits: null,
    cta: "Download for Mac",
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
    limits: [
      `${free.handoffsPerWeek} conversation handovers a week`,
      `Search back ${free.historyDays} days`,
    ],
    features: [
      "Every conversation already on your Mac, from day one",
      "Full transcripts, never summaries",
      "Nothing uploaded, ever",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$19.99",
    cadence: "/ month",
    // The one sentence that has to do the work. It names the thing nobody else
    // has rather than listing capacity, because capacity is not why anyone pays.
    promise: "Every AI you use, holding one memory.",
    inherits: "Starter",
    cta: "Subscribe",
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
      "Unlimited handovers, every day",
      "Search everything you have ever asked, however far back it goes",
    ],
  },
  {
    id: "duo",
    name: "Duo",
    price: "$29.99",
    cadence: "/ month",
    /*
     * ── What Duo actually does, now that it does something ───────────────────
     *
     * It sold two seats and one invoice. Asked what it did, the honest answer
     * was "you both get Sidq", and the thing people at a demo were excited
     * about — that a team could work from one context — was a guess they had
     * made about the name. It is real now: the standing instructions on each
     * member's "How you work" tab are shared through a folder the team already
     * syncs, and every handover any of them makes carries the team's rules as
     * well as their own.
     *
     * The line that must never appear here is that conversations are shared.
     * They are not, and they are not going to be: nothing leaves the Mac except
     * one small Markdown file of rules the person can open and read first. A
     * buyer who reads "shared context" as "my co-founder can see my chats" has
     * been mis-sold, so the bullet says which thing is shared.
     */
    promise: "Both of you, working from the same context.",
    priceNote: "$15 each",
    inherits: "Pro",
    cta: "Subscribe",
    /*
     * The ink fill moved here from Pro.
     *
     * A pricing row points at whichever card is filled, and it was pointing at
     * the middle one out of habit — the SaaS convention of featuring the
     * second of three. Duo is the plan worth pointing at: it is the most
     * expensive, it is the only one with a reason to exist beyond capacity, and
     * it is the one two independent people asked for before it was built.
     *
     * It carries the travelling rim light as well, which is the other half of
     * the same decision. Both effects were written for a dark surface and there
     * is now exactly one.
     */
    featured: true,
    features: [
      "$15 a person, against $19.99 each",
      "Your standing instructions, shared: every handover knows how the team works",
      "Through a folder you already sync, so still nothing uploaded",
      "One bill, one subscription to cancel",
    ],
  },
];

/**
 * Everything a plan carries up from the tiers beneath it.
 *
 * The cards printed one small line — "Everything in Starter, plus" — above two
 * bullets, while Starter itself printed five with ticks beside them. Read the
 * row left to right and Pro looked like less product for more money. A founder
 * who had sold his company spotted it within a minute of being shown the page,
 * and he was right: the tiers are cumulative and the page was rendering them as
 * though they competed.
 *
 * So render the carried lines too, muted, under the new ones. This adds no
 * claim to any card. It stops the page hiding the claims it already had.
 */
export function inheritedFeatures(id: PlanId): readonly string[] {
  const index = PLANS.findIndex((p) => p.id === id);
  return index <= 0 ? [] : PLANS.slice(0, index).flatMap((p) => p.features);
}

export const PRO = PLANS[1];

export function planById(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}
