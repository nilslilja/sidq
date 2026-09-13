import { describe, expect, it } from "vitest";

import { FEATURES } from "./features";
import { PLANS } from "./plans";

/*
 * ── Why this file exists ────────────────────────────────────────────────────
 *
 * Every other test in this codebase mocks `FEATURES` to all-true, deliberately:
 * a panel that stops rendering is a panel that stops being tested, and turning
 * one back on untested is how "reversible in an afternoon" becomes a thing
 * people say rather than a thing that is true.
 *
 * The cost of that decision is that nothing would then check what the shipped
 * app actually shows. Every suite would be green with every feature on and the
 * product could quietly be showing anything at all.
 *
 * This is the one file that reads the real values.
 */

describe("what the app actually ships", () => {
  it("is dark on everything that is not the keystroke", () => {
    /*
     * Written out one at a time rather than looped, because the point is to be
     * a list somebody reads before changing it. A flag flipped by accident
     * should fail here with the name of the thing it turned on.
     */
    expect(FEATURES.team).toBe(false);
    expect(FEATURES.invites).toBe(false);
    expect(FEATURES.sharing).toBe(false);
    expect(FEATURES.projectMemory).toBe(false);
  });

  it("does not offer a tier it is not showing", () => {
    // The pricing page and the sidebar have to agree. A Team card on the
    // pricing page with no team panel in the app is a sale nobody can fulfil.
    expect(PLANS.find((p) => p.id === "team")).toBeUndefined();
  });

  it("still offers the tier the paywall is actually about", () => {
    /*
     * The guard in the other direction, and the more important one. It would be
     * very easy to filter this list into nothing and ship a pricing page with
     * no way to pay on it.
     */
    expect(PLANS.find((p) => p.id === "free")).toBeDefined();
    expect(PLANS.find((p) => p.id === "pro")).toBeDefined();
  });
});
