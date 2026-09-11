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


export type PlanId = "free" | "pro" | "duo" | "team";

/**
 * What one Team seat costs a month, when it costs anything.
 *
 * Per seat rather than a flat fee, because a tier sold to organisations has to
 * scale with the organisation: a number that is right for four people is
 * absurd for forty in one direction or the other, and the flat version means
 * every real conversation starts by renegotiating it.
 *
 * Absent by default and deliberately — see the note on the Team plan below.
 * Written as it should appear, e.g. "$12", because the display string and the
 * Stripe price are two decisions and only one of them lives here.
 */
const TEAM_SEAT: string | undefined =
  (import.meta.env?.VITE_TEAM_SEAT_PRICE as string | undefined) || undefined;

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
    /*
     * No limits list at all, because there are none to list.
     *
     * It said "5 conversation handovers a week" and "Search back 7 days",
     * generated from `free` so the two could not drift. Both are gone from
     * entitlements.ts and the strings would now read "Infinity handovers a
     * week", which is how a generated line fails when the number behind it
     * changes shape rather than value.
     */
    features: [
      "Every conversation already on your Mac, from day one",
      "Unlimited handovers, as many as you want",
      "Search everything, however far back it goes",
      "Word for word, never summarised",
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
   * No price and no checkout, deliberately. There is no Stripe product behind
   * it, the right number is unknown until a few have been sold, and the first
   * team conversations are worth having by hand.
   */
  {
    id: "team",
    name: "Team",
    /*
     * ── Why this tier is a conversation until a number exists ────────────────
     *
     * Team has been on the pricing page since before it was implemented and
     * its button has always been a mailto:, which means the tier most likely to
     * convert is the one that cannot take money. Everything behind it now
     * works — the folder in team_context.rs does the sharing, mcp.rs gates
     * publish_to_team on may_share_with_team, and create-checkout maps
     * team:monthly to a price id.
     *
     * What is missing is a price, and a price is a decision rather than a
     * value with a sensible default. So this reads the number from the build
     * rather than carrying a placeholder: set VITE_TEAM_PRICE and the card
     * becomes a checkout, leave it unset and it stays the conversation it is
     * today. A wrong number on a live pricing page is worse than no number,
     * because somebody can buy at it.
     */
    price: TEAM_SEAT ?? "Let's talk",
    cadence: TEAM_SEAT ? "/ seat, month" : null,
    promise:
      "Your whole team working from the same context, on machines nothing leaves.",
    inherits: "Duo",
    cta: TEAM_SEAT ? "Subscribe" : "Talk to us",
    ctaHref: TEAM_SEAT
      ? undefined
      : "mailto:nilsliljan@gmail.com?subject=Sidq%20for%20teams",
    features: [
      "Every seat on one invoice, priced per seat",
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
      "Hand a whole conversation to a teammate when you choose to, never automatically",
      "Share what you know about a project, so the next person does not have to ask you",
      "They pick it up in their own AI, with their own conventions applied",
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
