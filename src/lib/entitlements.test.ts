import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  INVITE,
  entitlementsFor,
  planFromTier,
  isUnlimited,
  type Entitlements,
} from "./entitlements";
import { FAQS } from "@/components/landing/Faq";
import { PLANS, inheritedFeatures, type PlanId } from "./plans";

/*
 * These tests exist to stop the pricing page and the product disagreeing.
 *
 * Every claim on a card is enforced somewhere by reading entitlements.ts. If a
 * feature line is added to a plan without a matching entitlement, or a paid tier
 * quietly loses one, that is a customer paying for something they do not get,
 * and it should fail here rather than in a refund request.
 */

describe("entitlements", () => {
  test("an unknown tier gets the free plan, never a paid one", () => {
    expect(planFromTier(undefined)).toBe("free");
    expect(planFromTier(null)).toBe("free");
    expect(planFromTier("enterprise-lol")).toBe("free");
    expect(planFromTier("")).toBe("free");
  });

  test("the legacy paid value still maps to Pro", () => {
    // Everyone who subscribed before the tiers split is sitting on 'paid'.
    // Losing them would be an outage for exactly the people who pay.
    expect(planFromTier("paid")).toBe("pro");
  });

  test("free is metered on the two things the app actually enforces", () => {
    /*
     * This asserted rebuilds, companion minutes and calibration — a planner and
     * a companion that were both removed from the product. It kept passing
     * because the fields stayed in the contract long after the features left.
     */
    const free = entitlementsFor("free");

    expect(isUnlimited(free.handoffsPerWeek)).toBe(false);
    expect(isUnlimited(free.historyDays)).toBe(false);
  });

  test("free is metered rather than crippled", () => {
    const free = entitlementsFor("free");

    // Every capability is present in some amount. A free plan that cannot do
    // anything teaches nobody anything and converts nobody.
    expect(free.handoffsPerWeek).toBeGreaterThan(0);
    expect(free.historyDays).toBeGreaterThan(0);
  });

  test("free history is a week, matching what Rust reaches back", () => {
    // entitlement.rs: Plan::Free.history_days() is Some(7). Two numbers, two
    // files, and the site quotes this one.
    const free = entitlementsFor("free");
    expect(free.historyDays).toBe(7);
  });

  test("paying removes every meter", () => {
    for (const plan of ["pro", "duo"] as const) {
      const e = entitlementsFor(plan);
      expect(isUnlimited(e.handoffsPerWeek)).toBe(true);
      expect(isUnlimited(e.historyDays)).toBe(true);
    }
  });

  test("duo is Pro plus a seat, never less than Pro", () => {
    const pro = entitlementsFor("pro");
    const duo = entitlementsFor("duo");

    for (const key of Object.keys(pro) as (keyof Entitlements)[]) {
      if (key !== "seats") expect(duo[key]).toBe(pro[key]);
    }
    expect(duo.seats).toBeGreaterThan(pro.seats);
  });

  test("every paid plan beats free on something people can name", () => {
    const free = entitlementsFor("free");
    for (const plan of ["pro", "duo"] as const) {
      const e = entitlementsFor(plan);
      expect(
        isUnlimited(e.handoffsPerWeek) && !isUnlimited(free.handoffsPerWeek),
      ).toBe(true);
      expect(isUnlimited(e.historyDays) && !isUnlimited(free.historyDays)).toBe(
        true,
      );
    }
  });
});

describe("what the site says an invite is worth", () => {
  test("matches the constants Rust and the migration use", async () => {
    /*
     * Three copies of one number, by necessity: the migration decides the
     * payout, `invites.rs` mirrors it so the desktop app can state the offer,
     * and this file holds it again because the website has no server to ask.
     *
     * The desktop app is told the figures by the server and cannot drift. The
     * website can, silently, and a pricing claim that quietly stops matching
     * what is paid out is the failure this whole file exists to prevent.
     */
    const { readFileSync } = await import("node:fs");
    const rust = readFileSync("src-tauri/src/invites.rs", "utf8");

    const each = rust.match(/pub const EACH_INVITE: u32 = (\d+);/);
    expect(each?.[1]).toBe(String(INVITE.bonusPerWeek));
  });

  test("the FAQ quotes the contract rather than a number typed into it", () => {
    const free = entitlementsFor("free");
    const answers = FAQS.map((f) => f.a).join(" ");

    expect(answers).toContain(`${free.handoffsPerWeek} handovers a week`);
    expect(answers).toContain(`${INVITE.bonusPerWeek} more a week`);
    expect(answers).toContain(`${INVITE.perWeek} friends a week`);
  });

  test("nothing on the site still claims a limit on how many AIs are read", () => {
    /*
     * The FAQ answered "what do I get for free?" with "and 1 AI connected".
     * Nothing has ever enforced a source limit, and it contradicted the pitch:
     * Sidq reads every AI on the Mac with nothing to connect.
     */
    const text = [
      ...FAQS.map((f) => `${f.q} ${f.a}`),
      ...PLANS.flatMap((p) => p.features),
    ]
      .join(" ")
      .toLowerCase();

    expect(text).not.toMatch(/\d+ (ai|assistant)s? connected/);
    expect(text).not.toMatch(/one connected ai/);
  });
});

describe("pricing cards match the contract", () => {
  const ids = PLANS.map((p) => p.id);

  test("every card has entitlements behind it", () => {
    for (const id of ids) {
      expect(entitlementsFor(id as PlanId)).toBeDefined();
    }
  });

  test("no card promises a human being doing work", () => {
    // The tier this replaced promised "a real person sees your week". Anything
    // that needs a human in the loop cannot be honoured by a solo team and does
    // not survive the hundredth customer, so it must never come back.
    const text = PLANS.flatMap((p) => [p.promise, ...p.features])
      .join(" ")
      .toLowerCase();

    expect(text).not.toMatch(
      /real person|a human|coach reviews|we will review|our team/,
    );
  });

  test("no card sells a feature that was taken out of the product", () => {
    /*
     * The one that got through. Pro advertised "Learns what you actually
     * finish, and plans to it" for weeks after the planner was removed and its
     * edge functions deleted — a paid card selling something that does not
     * exist anywhere in the codebase.
     *
     * The old version of this test only looked at the free card, and only for
     * capabilities that were false in the contract. A deleted feature is not
     * false for a plan, it is false for everybody, so nothing caught it.
     */
    const gone: [string, RegExp][] = [
      [
        "the planner",
        /learns what you actually finish|plans to it|real daily capacity/i,
      ],
      ["rescues", /\brescues?\b/i],
      ["the companion", /watches your (day|screen)|companion minutes/i],
      ["rooms", /\brooms?\b.*(alongside|together)/i],
    ];

    for (const plan of PLANS) {
      const text = [plan.promise, ...plan.features].join(" ");
      for (const [what, pattern] of gone) {
        expect(
          pattern.test(text),
          `${plan.name} still advertises ${what}`,
        ).toBe(false);
      }
    }
  });

  test("the free card states its actual numbers", () => {
    /*
     * The two limits a free user actually meets.
     *
     * This asserted rebuilds and history days while the card advertised them,
     * and caught the change the moment the product stopped being metered that
     * way. Whatever the free card meters, the number on it has to be the number
     * in the contract, which is the only claim on the pricing page a test can
     * check for itself.
     */
    const free = entitlementsFor("free");
    const text = [...(PLANS[0].limits ?? []), ...PLANS[0].features].join(" ");

    expect(text).toContain(String(free.handoffsPerWeek));

    /*
     * `free.sources` is deliberately not asserted.
     *
     * The card used to promise "1 assistant connected" and that line was
     * removed, because nothing has ever enforced a source limit — entitlement.rs
     * caps handovers and the history window, and that is all.
     *
     * The assertion stayed and passed anyway, for six weeks, because
     * handoffsPerWeek was 10 and "10" contains "1". Dropping the free plan to
     * five is what exposed it. Putting it back would be a test insisting the
     * pricing page make a claim the code does not implement.
     */
  });

  test("no card sells a capability that is switched off for that plan", () => {
    /*
     * This caught a real one. Pro advertised "Rooms, for working alongside
     * someone" after the panel was taken off the card, so a paying customer had
     * no way to reach a thing they were shown on the pricing page.
     *
     * Prose has nothing checking it, which is exactly why it drifts.
     */
    for (const plan of PLANS) {
      const text = [plan.promise, ...plan.features].join(" ");

      // Unlimited is the only thing a paid card may claim past free, because it
      // is the only thing entitlement.rs grants past free.
      if (plan.id === "free") {
        expect(text.toLowerCase()).not.toMatch(/unlimited|however far back/);
      }
    }
  });

  test("no card lists the same thing twice", () => {
    // Pro carried "Your whole history, however far back it goes" at both ends
    // of its list, so the card rendered it as two separate bullets.
    for (const plan of PLANS) {
      expect(new Set(plan.features).size).toBe(plan.features.length);
    }
  });

  test("exactly one card is featured", () => {
    expect(PLANS.filter((p) => p.featured)).toHaveLength(1);
  });
});

/*
 * ── The two languages that both decide what Free gets ────────────────────────
 *
 * `entitlements.ts` is what the pricing page promises. `entitlement.rs` is what
 * actually refuses a handover. They are separate files in separate languages
 * with nothing holding them together, and they have already come apart once:
 * the site advertised limits the app was not enforcing, and the test that was
 * supposed to catch it passed by accident because the cap was 10 and the
 * assertion looked for the substring "1".
 *
 * Reading the Rust from here is not elegant. It is, however, the only thing
 * that fails when somebody changes one number and not the other — which is the
 * whole failure, and it is a promise about what a paying customer gets.
 */
describe("the site and the app agree about the free plan", () => {
  const rust = readFileSync("src-tauri/src/entitlement.rs", "utf8");

  /**
   * The named function's body, from its signature to the start of the next one.
   *
   * A fixed-length window was tried and it read straight past the closing brace
   * into the function after it, so `handovers_per_week` picked up the arm
   * belonging to `history_days` and the counting test failed for a reason that
   * had nothing to do with the plans.
   */
  const bodyOf = (fn: string): string => {
    const from = rust.indexOf(`pub fn ${fn}(`);
    if (from === -1)
      throw new Error(
        `${fn} is gone from entitlement.rs — has it been renamed?`,
      );
    const next = rust.indexOf("pub fn ", from + 1);
    return rust.slice(from, next === -1 ? undefined : next);
  };

  /** Pull `Plan::Free => Some(N)` out of the named function's match arm. */
  const freeLimit = (fn: string): number => {
    const match = /Plan::Free\s*=>\s*Some\((\d+)\)/.exec(bodyOf(fn));
    if (!match)
      throw new Error(
        `no Plan::Free arm found in ${fn} — has it been renamed?`,
      );
    return Number(match[1]);
  };

  test("handovers a week is the same number in both", () => {
    expect(entitlementsFor("free").handoffsPerWeek).toBe(
      freeLimit("handovers_per_week"),
    );
  });

  test("how far search reaches back is the same number in both", () => {
    expect(entitlementsFor("free").historyDays).toBe(freeLimit("history_days"));
  });

  test("the paid plans are unlimited on both sides", () => {
    /*
     * Rust says `_ => None` for everything that is not Free, so the guard here
     * is that no second `Plan::X => Some(n)` arm has quietly appeared — which
     * would be a cap the site is not telling anybody about.
     */
    for (const fn of ["handovers_per_week", "history_days"]) {
      const caps = bodyOf(fn).match(/Plan::\w+\s*=>\s*Some\(/g) ?? [];
      expect(caps).toHaveLength(1);
    }
    expect(isUnlimited(entitlementsFor("pro").handoffsPerWeek)).toBe(true);
    expect(isUnlimited(entitlementsFor("duo").handoffsPerWeek)).toBe(true);
  });
});

describe("the ladder reads as a ladder", () => {
  /*
   * Pro printed two bullets beside a free card printing five, so the row read
   * downhill: more money, visibly less product. The cards now render what they
   * carry up from below, which is true and was always true, and only ever
   * looked like a longer list because nobody drew it.
   */
  test("every paid card ticks more than the one beneath it", () => {
    /*
     * Ticks, not lines. The free card's caps render with a dash and are not
     * capabilities, so counting every rendered row put free level with Pro on
     * five apiece — which is the exact impression the row is supposed to stop
     * giving.
     */
    const ticks = (id: PlanId) =>
      PLANS.find((p) => p.id === id)!.features.length +
      inheritedFeatures(id).length;

    expect(ticks("pro")).toBeGreaterThan(ticks("free"));
    expect(ticks("duo")).toBeGreaterThan(ticks("pro"));
  });

  /*
   * The first attempt inherited the free card's caps, so Pro promised unlimited
   * handovers and then, four lines below, "5 conversation handovers a week".
   * A ceiling is the thing a paid tier removes; it must never travel upward.
   */
  test("no card inherits a limit that its own tier removes", () => {
    for (const plan of PLANS) {
      for (const carried of inheritedFeatures(plan.id)) {
        expect(PLANS.flatMap((p) => p.limits ?? [])).not.toContain(carried);
      }
    }
  });

  test("a carried line is never also printed as the card its own", () => {
    for (const plan of PLANS) {
      const own = new Set(plan.features);
      for (const carried of inheritedFeatures(plan.id))
        expect(own.has(carried)).toBe(false);
    }
  });
});
