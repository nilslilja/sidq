/*
 * Whether the hero is on screen, and therefore whether the atmosphere is worth
 * animating.
 *
 * The hero carries twenty-three animated elements — sixteen twinkling stars,
 * three clouds, two crossings, two shooting stars — and behind everything there
 * is a WebGL shader repainting the viewport thirty times a second. The hero
 * ends around 1,600px into a page that is well over twenty thousand. All of it
 * kept running the whole way down, and every section on this page is
 * transparent, so the compositor could never skip the shader either.
 *
 * None of that is visible while somebody is reading the pricing table. This is
 * one signal, set in one place, that says when it stops being worth paying for.
 *
 * A store rather than React state on purpose: the subscribers are a canvas
 * render loop and a CSS attribute, neither of which wants a re-render, and
 * putting it in context would re-render the entire landing page every time the
 * hero crossed the fold.
 */

type Listener = (live: boolean) => void;

const listeners = new Set<Listener>();
let live = true;

/**
 * `?plain` turns every moving thing on this page off and keeps it off.
 *
 * Not a feature — a way to answer one question without a profiler. This page
 * was reported as laggy three times, and the environment it is developed in
 * does not composite, so neither frame timing nor IntersectionObserver can be
 * observed there and every fix was reasoning rather than measurement.
 *
 * With this, the question "is it the animation" takes five seconds to settle:
 * open the site, open it again with ?plain, and see whether scrolling changes.
 * If it does not, the cost is somewhere else entirely and nothing else in this
 * file is worth touching.
 */
const LOCKED_STILL =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("plain");

if (LOCKED_STILL && typeof document !== "undefined") {
  document.documentElement.dataset.atmosphere = "still";
  live = false;
}

/** True while the hero is on screen. Starts true: the page opens on it. */
export function atmosphereIsLive(): boolean {
  return live;
}

export function setAtmosphere(next: boolean): void {
  // `?plain` outranks the observer: the whole point is that nothing starts.
  if (LOCKED_STILL) return;
  if (next === live) return;
  live = next;

  /*
   * The attribute is what the stylesheet reacts to. Paused rather than removed,
   * so a star keeps the position it had rather than snapping to the start of
   * its keyframes the moment somebody scrolls back up.
   */
  if (typeof document !== "undefined") {
    document.documentElement.dataset.atmosphere = next ? "live" : "still";
  }

  for (const fn of listeners) fn(next);
}

export function onAtmosphere(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Watch an element and drive the signal from it.
 *
 * Given a generous margin because the cost of being wrong in one direction is a
 * star that resumes a beat late, and in the other it is animating something
 * nobody can see. Half a viewport of slack is cheap insurance.
 */
export function watchAtmosphere(el: Element | null): () => void {
  if (!el || typeof IntersectionObserver === "undefined") return () => {};

  const io = new IntersectionObserver(
    (entries) => setAtmosphere(entries[0]?.isIntersecting ?? true),
    {
      rootMargin: "50% 0px 50% 0px",
    },
  );
  io.observe(el);

  return () => {
    io.disconnect();
    setAtmosphere(true);
  };
}
