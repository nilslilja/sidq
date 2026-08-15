import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

/*
 * Component B. The "building your day" screen.
 *
 * Two treatments. `ring` is the default because the goo reads playful against a
 * dark editorial layout, and this product is a premium tool rather than a toy.
 * `goo` is kept because it is worth looking at side by side once before deciding
 * for good. Swap the variant, look at both, delete the loser.
 */

const DEFAULT_STATUS = ['Reading your goals', 'Ordering your day', 'Setting your focus'];

interface LoaderProps {
  variant?: 'ring' | 'goo';
  statuses?: string[];
  /** How long each line holds before the next. */
  intervalMs?: number;
  className?: string;
}

export function Loader({
  variant = 'ring',
  statuses = DEFAULT_STATUS,
  intervalMs = 1800,
  className,
}: LoaderProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (statuses.length <= 1) return;
    // Holds on the last line rather than looping. A loop reads as "stuck".
    const id = window.setInterval(() => {
      setIndex((i) => (i >= statuses.length - 1 ? i : i + 1));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [statuses.length, intervalMs]);

  return (
    <div className={cn('flex flex-col items-center justify-center gap-6', className)}>
      {variant === 'ring' ? <RingSpinner /> : <GooSpinner />}

      {/* aria-live so the status is announced, not just seen. */}
      <p
        key={index}
        aria-live="polite"
        className="animate-[fade-in_var(--duration-slow)_var(--ease-out-expo)] text-sm text-muted"
      >
        {statuses[index]}
      </p>

      <style>{`
        @keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </div>
  );
}

function RingSpinner() {
  return (
    <div className="size-8" role="status" aria-label="Building your day">
      <svg viewBox="0 0 32 32" className="size-8 animate-spin [animation-duration:900ms]">
        <circle cx="16" cy="16" r="14" fill="none" stroke="var(--color-line)" strokeWidth="1.5" />
        <path
          d="M16 2 a14 14 0 0 1 14 14"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

/** Single accent on the canvas. The original's two-colour goo reads as a toy here. */
function GooSpinner() {
  return (
    <div className="relative h-8 w-20" role="status" aria-label="Building your day">
      <svg className="absolute size-0" aria-hidden="true">
        <defs>
          <filter id="sidq-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix
              in="blur"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>
      <div className="size-full [filter:url(#sidq-goo)]">
        {[0, 1].map((i) => (
          <span
            key={i}
            className="absolute top-1/2 size-4 -translate-y-1/2 rounded-full bg-accent"
            style={{
              animation: `sidq-goo-slide 1.6s var(--ease-out-expo) ${i * 0.4}s infinite alternate`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes sidq-goo-slide {
          from { left: 0 }
          to   { left: calc(100% - 1rem) }
        }
      `}</style>
    </div>
  );
}
