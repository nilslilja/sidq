import { useEffect, useRef, useState } from 'react';

/*
 * Sections arriving as you reach them.
 *
 * The brief for this is "you notice it, and that is all". So it is sixteen
 * pixels and a fade, once, and never again. Anything further than about twenty
 * pixels starts reading as the page assembling itself, which is a different and
 * much more annoying effect, and anything that replays on the way back up turns
 * a scroll into a slideshow.
 *
 * ── Why this is not `whileInView` ────────────────────────────────────────────
 * It was, briefly, and it cost 44kB gzipped on the landing page. `useScroll` and
 * `useTransform` are just subscribable values and were already in this bundle
 * for the hero, but `whileInView` drags in the whole gesture and animation
 * runtime with it, which took the page from 97kB to 141kB against a 150kB
 * budget. An IntersectionObserver and a CSS transition do the same sixteen
 * pixels for nothing.
 *
 * Only opacity and transform, so it stays on the compositor and cannot cause
 * layout shift. A reveal that animates height or margin moves everything below
 * it and shows up as CLS in the section someone is trying to read.
 */

/** Far enough to register, near enough not to look like a page building itself. */
/*
 * 16 was a nudge nobody registered. Sections should read as arriving — coming
 * up and settling into place — which needs enough travel to be seen as motion
 * rather than as a repaint, paired with a slight scale so the block looks like
 * it is assembling rather than sliding.
 */
const RISE_PX = 34;
const START_SCALE = 0.965;

/**
 * Fires slightly before the element is fully on screen.
 *
 * Waiting for full visibility means the fade happens after somebody has already
 * started reading, which they see as text flickering rather than as arrival.
 */
const ROOT_MARGIN = '0px 0px -12% 0px';

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  /** Seconds. Used to stagger siblings; keep the gaps under ~0.12s. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    /*
     * Anyone who has asked the OS for less movement gets the destination, not a
     * gentler version of the journey. Checked here rather than in render so the
     * server-less first paint and the client agree.
     */
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        // Once. A live observer per section for the life of the page buys
        // nothing, and replaying on the way back up turns scrolling into a
        // slideshow.
        observer.disconnect();
      },
      { rootMargin: ROOT_MARGIN },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : `translateY(${RISE_PX}px) scale(${START_SCALE})`,
        // Decelerating. Linear or symmetric easing on an entrance is the
        // clearest tell of an animation nobody tuned.
        /*
         * 720ms on a curve that overshoots slightly, so the block arrives and
         * settles rather than easing to a stop. Long enough to be seen as an
         * arrival, short enough that scrolling never waits on it.
         */
        transition: `opacity 520ms cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 720ms cubic-bezier(0.22,1.15,0.36,1) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}
