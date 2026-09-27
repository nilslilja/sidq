import { cn } from "@/lib/cn";

/**
 * Sidq, always on screen, as one point.
 *
 * The mark is a scattered line that settles into one stroke and ends in a
 * single point: many competing things, then one decided thing. The dot is that
 * point, and it is all the app needs to show while nothing is happening. The
 * glass capsule said what Sidq was doing in a line of text nobody read, and the
 * tomato that replaced it said it with a face; the dot says it with light.
 *
 *   idle   breathes, slowly. Sidq is running and reading.
 *   hop    sends out one ring. A conversation was just picked up.
 *   panic  turns amber and pulses. An assistant hit its limit.
 *
 * Ten points across inside a 24 point bar, with a halo drawn around it rather
 * than a capsule, so over any wallpaper it reads as a light and not a widget.
 * Transform and opacity only, and still under reduced motion.
 */
export type DotMood = "idle" | "hop" | "panic";

export function SidqDot({
  mood = "idle",
  className,
}: {
  mood?: DotMood;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-mood={mood}
      className={cn("sidq-dot", `sidq-dot-${mood}`, className)}
    >
      <span className="sidq-dot-halo" />
      <span className="sidq-dot-ring" />
      <span className="sidq-dot-core" />
    </span>
  );
}
