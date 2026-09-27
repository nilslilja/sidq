import { readFileSync } from "node:fs";
import { describe, test, expect } from "vitest";
import { STEPS, nextStep, stepIndex } from "./steps";

/*
 * Setup was twelve screens, then eight, and is four. The number is the point:
 * every one of them is a thing somebody has to do or grant, and none of them
 * exists to say hello, to explain what a film beside it already shows, or to
 * recap what just happened.
 *
 * These are here because a flow only ever grows. Each new screen looks
 * reasonable on its own and the tenth one is what makes people quit halfway.
 */

describe("the shape of setup", () => {
  test("nothing before sign-in, because nothing can happen before it", () => {
    expect(STEPS[0].id).toBe("signin");
  });

  test("setup stays at four screens", () => {
    expect(STEPS.length).toBeLessThanOrEqual(4);
  });

  /*
   * Trying it for real is the product. Everything before it is somebody
   * waiting to find out what they installed.
   */
  test("one screen stands between signing in and doing it for real", () => {
    expect(stepIndex("handover")).toBe(2);
  });

  test("the question we ask for ourselves is the final one", () => {
    expect(STEPS[STEPS.length - 1].id).toBe("discover");
    expect(nextStep("discover")).toBeNull();
  });

  test("every step is reachable from the one before it", () => {
    for (let i = 0; i < STEPS.length - 1; i += 1) {
      expect(nextStep(STEPS[i].id)).toBe(STEPS[i + 1].id);
    }
  });
});

/*
 * Rust reads these ids. It decides from the step on screen whether ⌘⇧K opens
 * the real picker or is swallowed, and it counts setup by name. A renamed step
 * would compile on both sides and quietly break the one screen that has to work
 * with the real shortcut, so the two files are read against each other.
 */
describe("the ids Rust depends on", () => {
  const main = readFileSync("src-tauri/src/main.rs", "utf8");
  const telemetry = readFileSync("src-tauri/src/telemetry.rs", "utf8");

  test("the step that wants the picker is a step that exists", () => {
    const wanted = main.match(/STEPS_WANTING_THE_PICKER: \[&str; \d+\] = \[([^\]]*)\]/);
    expect(wanted, "STEPS_WANTING_THE_PICKER not found in main.rs").not.toBeNull();
    const ids = [...(wanted?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(STEPS.map((s) => s.id)).toContain(id);
  });

  test("every step is one the setup counter knows by name", () => {
    const known = telemetry.slice(telemetry.indexOf("pub fn setup_step"));
    for (const step of STEPS) expect(known).toContain(`"${step.id}"`);
  });
});
