import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { HANDWRITING, type HandwrittenWord } from "./handwriting";

/*
 * A word that writes itself, then inks in.
 *
 * Adapted from the 21st.dev HandwritingText, with the work moved out of the
 * browser. That version fetched opentype.js from a CDN and parsed a font at
 * runtime before it could draw anything. The words the site writes never
 * change (the hero's "page." and the "Sidq" in the header), so
 * scripts/handwriting.mjs converts them once and this renders the result.
 *
 * Three things still make it read as handwriting rather than a fade, and they
 * are the original's:
 *
 *   1. Every contour is its own <path>. A dash pattern restarts at each
 *      subpath, so one path for the whole word would switch letters on whole.
 *      Staggered, the pen crosses the word left to right.
 *   2. `pathLength="1"` on each contour, so the dash can run from 1 to 0
 *      without measuring anything in the DOM. That is what lets the whole
 *      thing be CSS, which is what lets it play in the prerendered page.
 *   3. The weight is one filled copy of the whole word underneath, faded in as
 *      the stroke lands. It has to be a single path: the hole in an `a` or an
 *      `e` is its own contour and only reads as a hole with its outer shape.
 *
 * Colour is `currentColor`. Under reduced motion the ink is simply there.
 */
export function HandwritingText({
  word = "page.",
  className,
  delay = 0.35,
  duration = 1.4,
  strokeWidth = 1.6,
}: {
  /** Which of the pre-drawn words to write. See scripts/handwriting.mjs. */
  word?: HandwrittenWord;
  className?: string;
  /** Seconds before the pen starts. */
  delay?: number;
  /** Seconds for the pen to cross the word. */
  duration?: number;
  /** Stroke weight in units of a 100px em. */
  strokeWidth?: number;
}) {
  const geometry = HANDWRITING[word];
  const [x, y, w, h] = geometry.viewBox;
  const count = Math.max(1, geometry.contours.length);
  const each = (duration / count) * 2.4;

  return (
    <svg
      viewBox={`${x} ${y} ${w} ${h}`}
      role="img"
      aria-label={geometry.text}
      className={cn("handwriting inline-block overflow-visible align-baseline", className)}
      style={{ height: "1.15em", width: `calc(1.15em * ${(w / h).toFixed(4)})` }}
    >
      <path
        d={geometry.full}
        fill="currentColor"
        className="handwriting-ink"
        style={{ animationDelay: `${(delay + duration * 0.72).toFixed(3)}s` } as CSSProperties}
      />
      {geometry.contours.map((d, i) => (
        <path
          key={i}
          d={d}
          pathLength={1}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="handwriting-stroke"
          style={
            {
              animationDuration: `${each.toFixed(3)}s`,
              animationDelay: `${(delay + (i / count) * duration).toFixed(3)}s`,
            } as CSSProperties
          }
        />
      ))}
    </svg>
  );
}
