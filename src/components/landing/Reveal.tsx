import { useEffect, useRef, useState } from "react";

/*
 * Things arriving as you reach them.
 *
 * ── Why this is not `whileInView` ────────────────────────────────────────────
 * It was, briefly, and it cost 44kB gzipped on the landing page. `useScroll` and
 * `useTransform` are just subscribable values and were already in this bundle
 * for the hero, but `whileInView` drags in the whole gesture and animation
 * runtime with it, which took the page from 97kB to 141kB against a 150kB
 * budget. An IntersectionObserver and a CSS transition do the same work for
 * nothing.
 *
 * ── What may be animated here, and what may not ──────────────────────────────
 * Only `opacity`, `transform` and `filter`. The first two are free: the
 * compositor owns them and nothing below the element moves. `filter` is not
 * free, it is the single most expensive thing on this list, and it is the exact
 * class of effect that made the handover film stutter on this machine. So it is
 * allowed on `pop` and nowhere else, it is only ever applied to the few
 * elements that opt into it, and it is torn off the moment the transition ends
 * rather than left on an element for the life of the page. See `blur` below.
 *
 * Nothing here animates height, margin or top. A reveal that moves layout moves
 * everything under it and shows up as CLS in the section somebody is reading.
 */

/** How far a section travels. Enough to read as arrival rather than a repaint. */
const SECTION_RISE = 34;
const SECTION_SCALE = 0.965;

/**
 * How far a single line or button travels.
 *
 * Shorter and springier than a section. A paragraph rising 34px reads as the
 * page assembling itself; a button doing it reads as the button being unsure.
 */
const POP_RISE = 18;
const POP_SCALE = 0.94;

/**
 * Fires slightly before the element is fully on screen.
 *
 * Waiting for full visibility means the fade happens after somebody has already
 * started reading, which they see as text flickering rather than as arrival.
 */
const ROOT_MARGIN = "0px 0px -10% 0px";

/**
 * How long the blur lives.
 *
 * Long enough to cover the transition and its delay, short enough that nothing
 * is still filtering while somebody scrolls. Belt and braces alongside
 * `transitionend`, which does not fire if the element is removed or the
 * transition is interrupted, and a `filter` left on by a missed event is
 * exactly the cost this is trying not to pay.
 */
const BLUR_MS = 900;

export function Reveal({
  children,
  delay = 0,
  className,
  mode = "section",
  repeat = false,
  blur = false,
}: {
  children: React.ReactNode;
  /** Seconds. Used to stagger siblings; keep the gaps under ~0.12s. */
  delay?: number;
  className?: string;
  /**
   * `section` is a block of page arriving. `pop` is one line or one control,
   * with less travel and more spring.
   */
  mode?: "section" | "pop";
  /**
   * Replay on the way back up as well as down.
   *
   * Off for sections, because replaying a whole band of page every time it
   * crosses the fold turns a scroll into a slideshow. On for the small things,
   * where it is the difference between a page that is alive and one that
   * animated once at the top and then sat still.
   */
  repeat?: boolean;
  /**
   * Blur on entry. Expensive, and deliberately opt-in per element.
   *
   * Only ever worth it on display-size type, where the softness is visible.
   * Never on a list, a row, or anything that repeats: twenty filtered layers
   * arriving together is the stutter this codebase has already paid for once.
   */
  blur?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  /*
   * Dropped as soon as the entrance is over, so no element carries a filter
   * into a scroll. Separate from `shown` because it has to go *after* the
   * transition, not with it.
   */
  const [filtering, setFiltering] = useState(blur);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    /*
     * Anyone who has asked the OS for less movement gets the destination, not a
     * gentler version of the journey. Checked here rather than in render so the
     * server-less first paint and the client agree.
     */
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      setShown(true);
      setFiltering(false);
      return;
    }

    let timer: number | undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          if (blur) {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => setFiltering(false), BLUR_MS);
          }
          // Once, unless asked otherwise. A live observer per element for the
          // life of the page buys nothing when the element never hides again.
          if (!repeat) observer.disconnect();
          return;
        }

        if (repeat) {
          setShown(false);
          if (blur) setFiltering(true);
        }
      },
      { rootMargin: ROOT_MARGIN },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [repeat, blur]);

  const pop = mode === "pop";
  const rise = pop ? POP_RISE : SECTION_RISE;
  const scale = pop ? POP_SCALE : SECTION_SCALE;

  return (
    <div
      ref={ref}
      className={className}
      onTransitionEnd={() => setFiltering(false)}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : `translateY(${rise}px) scale(${scale})`,
        /*
         * `none`, not `blur(0px)`. A zero-radius filter still creates a
         * containing block and a compositing layer, so leaving it there keeps
         * the cost of the effect for none of the look.
         */
        filter: filtering && !shown ? "blur(6px)" : "none",
        /*
         * Decelerating, and overshooting slightly so things arrive and settle
         * rather than easing to a stop. Linear or symmetric easing on an
         * entrance is the clearest tell of an animation nobody tuned.
         *
         * `pop` is 300ms, which is the "not slow but not fast at all" this was
         * asked for. Sections stay longer because they are bigger and a short
         * travel over a large block reads as a jump.
         */
        transition: pop
          ? `opacity 260ms cubic-bezier(0.16,1,0.3,1) ${delay}s,
             transform 340ms cubic-bezier(0.22,1.2,0.36,1) ${delay}s,
             filter 300ms linear ${delay}s`
          : `opacity 520ms cubic-bezier(0.16,1,0.3,1) ${delay}s,
             transform 720ms cubic-bezier(0.22,1.15,0.36,1) ${delay}s,
             filter 420ms linear ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A run of things arriving one after another.
 *
 * The delay is computed here rather than written at each call site, because a
 * stagger written by hand is a list of magic numbers that stops being a
 * sequence the moment somebody inserts a row in the middle of it.
 */
export function Stagger({
  children,
  step = 0.07,
  start = 0,
  mode = "pop",
  repeat = true,
  className,
}: {
  children: React.ReactNode[];
  /** Seconds between siblings. Over about 0.12 and it reads as a queue. */
  step?: number;
  start?: number;
  mode?: "section" | "pop";
  repeat?: boolean;
  className?: string;
}) {
  return (
    <>
      {children.map((child, i) => (
        <Reveal
          key={i}
          delay={start + i * step}
          mode={mode}
          repeat={repeat}
          className={className}
        >
          {child}
        </Reveal>
      ))}
    </>
  );
}
