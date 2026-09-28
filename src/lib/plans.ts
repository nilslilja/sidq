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

import { FEATURES } from "./features";

export type PlanId = "free" | "pro" | "duo" | "team";

/**
 * What one Team seat costs a month, when it costs anything.
 *
 * Per seat rather than a flat fee, because a tier sold to organisations has to
 * scale with the organisation: a number that is right for four people is
 * absurd for forty in one direction or the other, and the flat version means
 * every real conversation starts by renegotiating it.
 *
 * $20 a seat a month since 28 Sep 2026, when the Stripe price was created.
 * VITE_TEAM_SEAT_PRICE still overrides it, written as it should appear, e.g.
 * "$20", because the display string and the Stripe price are two decisions and
 * only one of them lives here. What is charged is STRIPE_PRICE_TEAM_SEAT.
 */
const TEAM_SEAT: string =
  (import.meta.env?.VITE_TEAM_SEAT_PRICE as string | undefined) || "$20";

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
   * Where the button goes when it is not the checkout.
   *
   * A tier sold by talking to somebody has no price to charge yet, and a
   * "Subscribe" button opening an empty checkout is worse than no tier at all.
   */
  ctaHref?: string;
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

/**
 * What a year of Pro costs, in one place.
 *
 * ── Why this is a constant and not two strings ──────────────────────────────
 * It was one string, in the app's upgrade screen, and nowhere else. So the
 * yearly option existed and could only be found *after signing in* — which is
 * to say, after the moment somebody decides whether to pay at all. The pricing
 * page, which is the page people are sent to, has never mentioned it.
 *
 * Written down once because it is now said in two places and a price that
 * disagrees with itself is the failure `copy.test.ts` already exists for. The
 * Stripe price id behind it lives in the edge function's environment, which is
 * the only thing that decides what is actually charged: change the number here
 * and the charge does not move until that does.
 */
export const PRO_ANNUAL = {
  /** What the year costs. */
  price: 99,
} as const;

/** Pro by the month, as a number, for the arithmetic the page shows. */
export const PRO_MONTHLY = 12;

/** The yearly price as a monthly figure, for comparing like with like. */
export function proMonthlyIfAnnual(): string {
  return `$${(PRO_ANNUAL.price / 12).toFixed(2)}`;
}

const ALL_PLANS: Plan[] = [
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
    /*
     * The handover cap is back and the history window is not, so exactly one
     * line here quotes a number.
     *
     * Written out rather than generated from `free.handoffsPerWeek`. A
     * generated line is what put "Infinity handovers a week" on the live site
     * for weeks: a template survives its value changing and does not survive
     * its *shape* changing. entitlements.test.ts compares the number here
     * against Rust instead, which catches drift without the page being able to
     * render a word like Infinity at anybody.
     */
    features: [
      "Every conversation already on your Mac, from day one",
      "Five handovers a week, free forever",
      "Search everything, however far back it goes",
      "Word for word, never summarised",
      "Nothing uploaded, ever",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: `$${PRO_MONTHLY}`,
    cadence: "/ month",
    /*
     * The yearly option, on the page where people decide.
     *
     * It has existed and been payable for months, visible only inside the app
     * after signing in. Somebody comparing Sidq against anything else never
     * reached it, which made the headline number the only number they saw.
     */
    priceNote: `or $${PRO_ANNUAL.price} a year, ${proMonthlyIfAnnual()} a month`,
    // The one sentence that has to do the work. It names the thing nobody else
    // has rather than listing capacity, because capacity is not why anyone pays.
    promise: "One conversation. Every model. Nobody pressing anything.",
    inherits: "Starter",
    cta: "Subscribe",
    /*
     * The filled card, since Duo left the page on 28 Sep 2026. It is the plan
     * somebody arriving from a post can buy on their own, today.
     */
    featured: true,
    /*
     * ── What this card sold before, and why it was indefensible ─────────────
     *
     * "Unlimited handovers, every day" and "Search everything you have ever
     * asked". Both were word-for-word what the free card listed directly above
     * it, because every meter was removed from entitlement.rs and this card was
     * not moved with them. The page charged a monthly price for nothing, live,
     * and entitlement.rs had a test whose name said so.
     *
     * The line now is effort rather than capacity. Everything Sidq *is* stays
     * free — the index, the search, the memory, handing a conversation over by
     * hand. What is paid for is the half that happens without anybody doing it,
     * which is also the half a person genuinely cannot do themselves: you
     * cannot move four thousand exchanges by hand, and you cannot be watching
     * for the limit at the moment you hit it.
     *
     * Every line below maps to `may_thread` in entitlement.rs. Nothing here is
     * claimed that is not gated there.
     */
    features: [
      "One conversation across Claude, Cursor, ChatGPT and the rest, not a file you carry between them",
      "Whichever one you open next already knows what was decided, what was ruled out, and where it stopped",
      "Sidq sees the moment your assistant hits its limit, and the continuation is open before you've stopped swearing",
      "Your assistants pull it themselves over MCP, with nobody asking them to",
    ],
  },
  /*
   * ── Why there is a tier above two people ───────────────────────────────────
   *
   * The ladder stopped at Duo, which is to say it stopped at two. Every plan
   * above free was priced per person and sold to a person, so the product had a
   * ceiling of one invoice per pair however many people wanted it — and the
   * most common question after a demo was whether a team could buy it.
   *
   * The mechanism is already built and already paid for: team_context shares
   * standing instructions through a folder the team syncs themselves, with Sidq
   * never opening a socket. Duo is that feature sold to two people. This is the
   * same feature sold to twenty, and it costs nothing more to run.
   *
   * ── Sold on the security review, not on the convenience ────────────────────
   *
   * The buyer here is not the developer. It is whoever has to approve a tool
   * that touches every conversation their engineers have with an AI, and that
   * person is currently rejecting cloud AI tools for exactly that reason.
   * "Conversations never leave the device" is the sentence that gets past them.
   * For an individual that architecture is a nicety; for this buyer it is the
   * whole reason the purchase is possible, and it is the one answer a hosted
   * competitor cannot give.
   *
   * Priced per seat since 28 Sep 2026. The first team conversations are still
   * worth having by hand; the card just no longer requires one.
   */
  {
    id: "team",
    name: "Team",
    /*
     * ── From a conversation to a checkout ────────────────────────────────────
     *
     * Team was a mailto: while it had no price, because a wrong number on a
     * live pricing page is worse than no number: somebody can buy at it. The
     * price was decided on 28 Sep 2026, $20 a seat a month, and created in
     * Stripe the same day, so the card now sells it. create-checkout maps
     * team:monthly to STRIPE_PRICE_TEAM_SEAT, and the seat count is the
     * quantity.
     */
    price: TEAM_SEAT,
    cadence: "/ seat, month",
    promise:
      "Your whole team working from the same context, on machines nothing leaves.",
    inherits: "Pro",
    cta: "Subscribe",
    /*
     * Duo's lines live here now. Duo was the same folder sold to two people,
     * and two plans that differ only in headcount were one decision too many on
     * a page whose job is to explain one number.
     */
    features: [
      "Every seat on one invoice, priced per seat",
      "Hand a whole conversation to a teammate when you choose to, never automatically",
      "Join with a six-character code: no paths to send, no folder to describe",
      "One house-rules file: your standards ride along in every AI conversation your team has",
      "Project memory shared across the team: what it started as, where it got to, what was decided",
      "Shared standing instructions across everyone, synced through your own drive",
      "Nothing is uploaded, so there is no vendor to put through security review",
      "Works with the wifi off, on locked down machines",
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
     * ── What is shared, stated exactly ───────────────────────────────────
     *
     * This used to say conversations are never shared and never would be. That
     * was true when it was written and stopped being true when `share_handover`
     * shipped: a whole conversation can now go into the folder.
     *
     * The distinction that matters is not whether it can happen but what makes
     * it happen. Rules publish themselves. A conversation only moves because
     * somebody pressed a button on that one conversation — nothing is on a
     * timer, and nothing is shared because a folder was configured once. A buyer
     * who reads "shared context" as "my co-founder can see my chats by default"
     * has still been mis-sold, so the bullets say which is automatic and which
     * is a decision.
     */
    promise: "Both of you, working from the same context.",
    priceNote: "$15 each",
    inherits: "Pro",
    cta: "Subscribe",
    /*
     * Not on the page since 28 Sep 2026: Team carries these lines now, and the
     * filled card went back to Pro. Kept so an existing Duo subscription still
     * reads as something, and the webhook still grants it.
     */
    features: [
      "$15 a person",
      "Your standing instructions, shared: every handover knows how the team works",
      "Hand a whole conversation to a teammate when you choose to, never automatically",
      "Share what you know about a project, so the next person does not have to ask you",
      "They pick it up in their own AI, with their own conventions applied",
      "Through a folder you already sync, so still nothing uploaded",
      "One bill, one subscription to cancel",
    ],
  },
];

/**
 * The cards the pricing page actually shows.
 *
 * Starter, Pro and Team. Duo is filtered out: it was the team folder sold to
 * exactly two people, and four cards for a product nobody had paid for yet was
 * one decision too many. Team follows `FEATURES.team`.
 *
 * Filtered rather than removed, so the tier and everything written about it
 * stay where they are and turning it back on is one word.
 */
export const PLANS: Plan[] = ALL_PLANS.filter(
  (p) => p.id !== "duo" && (p.id !== "team" || FEATURES.team),
);

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
