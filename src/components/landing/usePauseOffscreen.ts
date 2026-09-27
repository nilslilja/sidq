import { useEffect, useRef } from "react";

/**
 * Freeze every CSS animation inside an element while it is off screen.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Measured on the live site with Chrome's own counters: the page restyled 60
 * times a second at all times, at the top, mid-page and at the pricing table
 * alike, and the main thread never went idle. Pausing one animation at a time
 * found the cause. The Duo card's travelling rim — `edge-travel`, a conic
 * gradient whose angle is a registered custom property — was about three
 * quarters of it on its own: 60 restyles a second down to 15, idle main-thread
 * time from 9% to 2%. A custom property cannot be handed to the compositor, so
 * that gradient is repainted on the main thread every frame, and it kept doing
 * so while the card was three screens below the viewport. The hero's stars and
 * clouds were most of the rest, and they ran all the way down the page too.
 *
 * HandoverFilm already stopped its own timer off screen. Nothing else did.
 *
 * ── How ─────────────────────────────────────────────────────────────────────
 * An attribute, not state. The observer writes `data-offscreen` straight onto
 * the element and a single rule in global.css pauses everything under it, so
 * scrolling past a section costs no React render at all.
 *
 * Paused rather than removed: `animation-play-state` keeps each animation where
 * it was, so coming back to the hero shows the sky mid-drift rather than every
 * star restarting in step.
 */
export function usePauseOffscreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) el.removeAttribute("data-offscreen");
        else el.setAttribute("data-offscreen", "");
      },
      // A little early in both directions, so nothing is caught frozen at the
      // edge of the screen as it scrolls in.
      { rootMargin: "120px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return ref;
}
