import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion, type MotionValue } from 'motion/react';

/*
 * Component D's stroke. Scroll-driven, and the drawing is the argument:
 * a scattered line on the left resolving into one straight one on the right.
 * Chaos in, one clear day out. The dots are the tasks landing on it.
 *
 * The original's cream canvas is gone; the accent stroke already matched the token.
 */

const PATH =
  'M 40 300 C 88 150 126 452 176 268 C 214 128 246 470 296 306 C 334 186 366 424 414 286 ' +
  'C 452 178 484 392 532 308 C 566 250 596 340 648 302 C 686 276 714 300 760 300 L 1160 300';

const DOTS = [820, 900, 980, 1060];

export function ScrollStroke() {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.85', 'end 0.3'],
  });

  const pathLength = useTransform(scrollYProgress, [0, 0.85], [0, 1]);

  return (
    <div ref={ref} className="w-full" aria-hidden="true">
      <svg viewBox="0 0 1200 600" className="h-auto w-full" fill="none">
        <motion.path
          d={PATH}
          stroke="var(--color-accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={prefersReduced ? { pathLength: 1 } : { pathLength }}
        />
        {DOTS.map((cx, i) => (
          <Dot key={cx} cx={cx} progress={scrollYProgress} index={i} static={Boolean(prefersReduced)} />
        ))}
      </svg>
    </div>
  );
}

function Dot({
  cx,
  progress,
  index,
  static: isStatic,
}: {
  cx: number;
  progress: MotionValue<number>;
  index: number;
  static: boolean;
}) {
  // Each dot appears as the stroke passes underneath it, staggered along the line.
  const start = 0.62 + index * 0.06;
  const opacity = useTransform(progress, [start, start + 0.05], [0, 1]);
  const scale = useTransform(progress, [start, start + 0.05], [0.4, 1]);

  return (
    <motion.circle
      cx={cx}
      cy={300}
      r={7}
      fill="var(--color-accent)"
      style={
        isStatic
          ? { opacity: 1 }
          : // transformOrigin belongs in style, not as an SVG attribute, React
            // rejects the hyphenated DOM property. Scaling from the dot's own
            // centre rather than the SVG origin.
            { opacity, scale, transformOrigin: `${cx}px 300px` }
      }
    />
  );
}
