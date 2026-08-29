import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  atmosphereIsLive,
  onAtmosphere,
  setAtmosphere,
  watchAtmosphere,
} from "./atmosphere";

/*
 * The signal that stops the hero animating once nobody can see it.
 *
 * Worth testing rather than eyeballing: the hero holds twenty-three animated
 * elements and a WebGL loop, all of which used to run the whole way down a page
 * many screens long, and the only thing that stops them now is this.
 */

let fire: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
let disconnected = false;

class FakeObserver {
  constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
    fire = cb;
  }
  observe() {}
  disconnect() {
    disconnected = true;
  }
}

beforeEach(() => {
  fire = null;
  disconnected = false;
  setAtmosphere(true);
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setAtmosphere(true);
});

describe("the atmosphere signal", () => {
  test("starts live, because the page opens on the hero", () => {
    expect(atmosphereIsLive()).toBe(true);
  });

  test("goes still when the hero leaves, and live again when it comes back", () => {
    const stop = watchAtmosphere(document.createElement("div"));

    fire!([{ isIntersecting: false }]);
    expect(atmosphereIsLive()).toBe(false);
    expect(document.documentElement.dataset.atmosphere).toBe("still");

    fire!([{ isIntersecting: true }]);
    expect(atmosphereIsLive()).toBe(true);
    expect(document.documentElement.dataset.atmosphere).toBe("live");

    stop();
  });

  test("tells its subscribers, which is how the shader stops painting", () => {
    const seen: boolean[] = [];
    const off = onAtmosphere((live) => seen.push(live));
    const stop = watchAtmosphere(document.createElement("div"));

    fire!([{ isIntersecting: false }]);
    fire!([{ isIntersecting: true }]);

    expect(seen).toEqual([false, true]);
    off();
    stop();
  });

  /*
   * The canvas loop subscribes to this. Firing on every observer callback
   * rather than only on a change would restart it on every scroll tick.
   */
  test("says nothing when the answer has not changed", () => {
    const seen: boolean[] = [];
    const off = onAtmosphere((live) => seen.push(live));
    const stop = watchAtmosphere(document.createElement("div"));

    fire!([{ isIntersecting: false }]);
    fire!([{ isIntersecting: false }]);
    fire!([{ isIntersecting: false }]);

    expect(seen).toEqual([false]);
    off();
    stop();
  });

  /*
   * If this ever fails to run, the page must animate rather than sit frozen:
   * the failure mode of an optimisation should be the behaviour it replaced.
   */
  test("unwatching leaves the page animating, not frozen", () => {
    const stop = watchAtmosphere(document.createElement("div"));
    fire!([{ isIntersecting: false }]);
    expect(atmosphereIsLive()).toBe(false);

    stop();

    expect(disconnected).toBe(true);
    expect(atmosphereIsLive()).toBe(true);
  });

  test("and nothing to watch is not an error", () => {
    expect(() => watchAtmosphere(null)()).not.toThrow();
    expect(atmosphereIsLive()).toBe(true);
  });
});
