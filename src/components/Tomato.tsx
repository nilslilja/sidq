import { cn } from "@/lib/cn";

/**
 * Sidq's face: a tomato that lives in the middle of the menu bar.
 *
 * It replaced the glass pill, which said what Sidq was doing in a line of text
 * nobody read. A character says it with a body instead: it blinks and bobs while
 * Sidq is reading, hops when a conversation is picked up, and sweats and shakes
 * when an assistant hits its limit. Clicking it opens the picker, which is
 * everything the pill was for.
 *
 * The colours are the drawing's own, not theme tokens: it is a tomato in the
 * light and in the dark. Motion is transform-only and stops entirely under
 * reduced motion, where it is simply a tomato that is there.
 */
export type TomatoMood = "idle" | "hop" | "panic";

export function Tomato({
  mood = "idle",
  size = 20,
  className,
}: {
  mood?: TomatoMood;
  /** Height in points. The drawing is a little taller than it is wide. */
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 130 140"
      width={(size * 130) / 140}
      height={size}
      aria-hidden="true"
      data-mood={mood}
      className={cn("tomato", `tomato-${mood}`, className)}
    >
      <ellipse cx="65" cy="82" rx="55" ry="48" fill="#E5463A" />
      <path d="M22 78 Q30 40 65 36 Q40 50 34 86 Z" fill="#F0685B" opacity=".7" />
      <ellipse
        cx="44"
        cy="60"
        rx="10"
        ry="6"
        fill="#fff"
        opacity=".45"
        transform="rotate(-25 44 60)"
      />
      <path
        d="M65 40 L52 28 L62 34 L60 20 L68 32 L78 22 L74 35 L88 32 L74 42 Z"
        fill="#3E9A4B"
      />
      <rect x="62" y="14" width="6" height="16" rx="3" fill="#2F7A3A" />
      <ellipse className="tomato-eye" cx="50" cy="80" rx="7" ry="9" fill="#1F1A1A" />
      <ellipse className="tomato-eye" cx="80" cy="80" rx="7" ry="9" fill="#1F1A1A" />
      <circle cx="52" cy="76" r="2.4" fill="#fff" />
      <circle cx="82" cy="76" r="2.4" fill="#fff" />
      <ellipse cx="38" cy="96" rx="8" ry="4.5" fill="#FF9B8F" opacity=".75" />
      <ellipse cx="92" cy="96" rx="8" ry="4.5" fill="#FF9B8F" opacity=".75" />
      <path
        className="tomato-mouth"
        d="M56 97 Q65 105 74 97"
        stroke="#1F1A1A"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <path
        className="tomato-worried"
        d="M55 101 Q60 95 65 100 Q70 105 75 99"
        stroke="#1F1A1A"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <path
        className="tomato-sweat"
        d="M108 52 Q116 66 108 72 Q100 66 108 52 Z"
        fill="#7CC4F2"
      />
    </svg>
  );
}
