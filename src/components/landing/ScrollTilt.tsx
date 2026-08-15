import { useLayoutEffect, useRef } from 'react';

/*
 * The product shot, lying back and standing up as you scroll to it.
 *
 * Adapted rather than pasted. The version this came from is a Next.js component
 * built on framer-motion, with a hardcoded grey bezel, a fixed 40rem height and
 * no reduced-motion path. Four things had to change for it to belong here:
 *
 *   - No animation library. `motion` is in this repo, but nothing on the landing
 *     page rendered a `motion` element, so importing one here pulled the whole
 *     animation runtime into the first chunk and took the page from 97kB to
 *     141kB gzipped against a 150kB budget. One scroll listener and a transform
 *     do the same thing for nothing.
 *   - The bezel is the site's own ink and glass rather than #6C6C6C on #222222,
 *     which reads as a stock component dropped onto a page otherwise built out
 *     of a single palette.
 *   - It takes its height from its child instead of a fixed 40rem, because what
 *     goes inside is eventually a screen recording, and a frame that letterboxes
 *     the one asset the page is built around is the wrong frame.
 *   - Reduced motion is honoured.
 *
 * ── On the angle ─────────────────────────────────────────────────────────────
 * 18 degrees, not the 20 it came with, and it resolves to flat by the time the
 * card is centred rather than at the end of a tall scroll container. The effect
 * should be over while the thing is still arriving. Held past that it stops
 * reading as arrival and starts reading as a page that will not settle.
 */

const START_ANGLE_DEG = 18;
const START_SCALE = 0.94;
/** Opacity has finished well before the tilt has, so the card is readable early. */
const FADE_COMPLETE_AT = 0.35;

/** Below this the tilt is cramped by the viewport and just looks like a glitch. */
const MIN_VIEWPORT_HEIGHT = 520;

export interface TiltPose {
  rotateXDeg: number;
  scale: number;
  opacity: number;
}

/** The resting pose: what reduced motion, a tiny viewport and no JS all get. */
export const AT_REST: TiltPose = { rotateXDeg: 0, scale: 1, opacity: 1 };

/**
 * The pose for a card at `rectTop` in a viewport `viewportHeight` tall.
 *
 * Pulled out as a pure function because it cannot be verified in a browser
 * harness: the pane this was developed against reports `innerHeight` as 0 and
 * dispatches no scroll events for programmatic scrolls, so the component reads
 * as permanently at rest there no matter what the maths does. This is the part
 * worth being sure about, and it is checkable directly.
 */
export function tiltPose(rectTop: number, rectHeight: number, viewportHeight: number): TiltPose {
  if (!Number.isFinite(viewportHeight) || viewportHeight < MIN_VIEWPORT_HEIGHT) return AT_REST;

  /*
   * Progress from "top edge enters the viewport" to "element is centred".
   *
   * Finishing at centre rather than at the end of the element means the whole
   * animation happens in the stretch where somebody is actually looking at it,
   * instead of still resolving as it leaves the screen.
   */
  const from = viewportHeight;
  const to = viewportHeight / 2 - rectHeight / 2;
  const span = from - to;
  const raw = span <= 0 ? 1 : (from - rectTop) / span;
  const p = raw < 0 ? 0 : raw > 1 ? 1 : raw;

  return {
    rotateXDeg: START_ANGLE_DEG * (1 - p),
    scale: START_SCALE + (1 - START_SCALE) * p,
    opacity: Math.min(1, p / FADE_COMPLETE_AT),
  };
}

export function ScrollTilt({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  /*
   * Layout effect, so the first pose is set before the browser paints.
   *
   * With a plain effect the card paints flat and upright for one frame and then
   * jumps back to the tilted start, which is visible on every load and is worse
   * than having no animation at all.
   */
  useLayoutEffect(() => {
    const host = outer.current;
    const card = inner.current;
    if (!host || !card) return;

    let frame = 0;

    const apply = () => {
      frame = 0;
      const rect = host.getBoundingClientRect();
      // Some embedded webviews report `innerHeight` as 0 while layout is fine.
      const vh = window.innerHeight || document.documentElement.clientHeight;

      /*
       * Both conditions are checked per frame rather than once at mount.
       *
       * As an early return this disabled the effect permanently: a viewport
       * that is briefly zero or short while the page settles meant the tilt
       * never ran again, and a later resize or a change to the OS motion
       * setting could not switch it back on. Resting the card is also the
       * correct output for both cases, not merely a safe one.
       */
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const pose = reduced ? AT_REST : tiltPose(rect.top, rect.height, vh);

      // Written straight to the node. Routing this through state would re-render
      // the subtree on every frame of every scroll.
      card.style.transform =
        pose === AT_REST
          ? 'none'
          : `rotateX(${pose.rotateXDeg.toFixed(2)}deg) scale(${pose.scale.toFixed(4)})`;
      card.style.opacity = pose.opacity.toFixed(4);
    };

    const onScroll = () => {
      // Coalesced to one write per frame. A bare scroll handler that touches
      // layout fires far more often than the display can show.
      if (!frame) frame = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    // Perspective lives on the parent: applied to the rotating element itself it
    // is computed per-element and the card appears to rotate flat.
    <div ref={outer} className={className} style={{ perspective: '1200px' }}>
      <div
        ref={inner}
        // No transform here: the layout effect sets the opening pose before the
        // first paint. Leaving the resting state as the markup default is what
        // makes reduced motion and a JS failure both land somewhere correct.
        style={{ transformOrigin: 'center top', willChange: 'transform' }}
      >
        <Frame>{children}</Frame>
      </div>
    </div>
  );
}

/**
 * The bezel.
 *
 * A single hairline and one long shadow. The reference had a 4px mid-grey
 * border, which at this size reads as a picture frame and pulls attention to the
 * edge of the shot rather than to what is in it.
 */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={[
        'overflow-hidden rounded-[24px] p-2 md:p-3',
        'bg-white/[0.06] ring-1 ring-inset ring-white/[0.12]',
        'shadow-[0_2px_8px_rgba(20,18,45,0.10),0_24px_48px_-16px_rgba(20,18,45,0.28),0_64px_120px_-40px_rgba(20,18,45,0.32)]',
        'backdrop-blur-[2px]',
      ].join(' ')}
    >
      <div className="overflow-hidden rounded-[16px]">{children}</div>
    </div>
  );
}
