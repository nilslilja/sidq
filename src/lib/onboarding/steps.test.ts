import { describe, test, expect } from "vitest";
import { PHASES, STEPS, nextStep, stepIndex } from "./steps";

/*
 * Setup was twelve screens. It is seven, and the number is the point: every one
 * of them is a thing somebody has to do or grant, and none of them exists to
 * say hello, to ask for something the account already knows, or to recap what
 * just happened.
 *
 * These are here because a flow only ever grows. Each new screen looks
 * reasonable on its own and the tenth one is what makes people quit halfway.
 */

describe("the shape of setup", () => {
  test("nothing before sign-in, because nothing can happen before it", () => {
    expect(STEPS[0].id).toBe("signin");
  });

  /*
   * The shortcut is the product. Everything before it is someone waiting to
   * find out what they installed, so the count is worth pinning rather than
   * watching drift.
   */
  test("two screens stand between opening the app and pressing the shortcut", () => {
    expect(stepIndex("pill")).toBe(2);
  });

  test("setup stays short", () => {
    expect(STEPS.length).toBeLessThanOrEqual(7);
  });

  /*
   * The one question asked for our benefit rather than the person's goes last,
   * where it costs a tap from somebody who already has what they came for.
   */
  test("the question we ask for ourselves is the final one, and skippable", () => {
    const last = STEPS[STEPS.length - 1];
    expect(last.id).toBe("discover");
    expect(last.optional).toBe(true);
    expect(nextStep("discover")).toBeNull();
  });

  test("every step is reachable from the one before it", () => {
    for (let i = 0; i < STEPS.length - 1; i += 1) {
      expect(nextStep(STEPS[i].id)).toBe(STEPS[i + 1].id);
    }
  });

  /*
   * The rail draws one segment per phase. A phase no step belongs to is a
   * segment of setup that can never light, which is how "Set up" survived the
   * two screens it held being deleted.
   */
  test("no phase on the rail is empty", () => {
    const used = new Set(STEPS.map((s) => s.phase));
    for (const phase of PHASES) expect(used.has(phase)).toBe(true);
  });

  test("and every step belongs to a phase the rail knows about", () => {
    for (const step of STEPS) expect(PHASES).toContain(step.phase);
  });
});
