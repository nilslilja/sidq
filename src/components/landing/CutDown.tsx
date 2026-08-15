import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/cn';

/*
 * The hero.
 *
 * Not a screenshot and not an illustration. The page performs the product's actual
 * operation on itself: twelve things go in, eight are struck out in front of you,
 * four survive. Every competitor's landing page adds things. This one subtracts,
 * which is the entire argument in a single motion.
 *
 * Nobody else can run this on their own page, because nobody else's product cuts.
 */

interface Item {
  label: string;
  minutes: number;
  /** false means it survives the cut. */
  cut: boolean;
  /** Shown after the cut on survivors. */
  why?: string;
}

const ITEMS: Item[] = [
  { label: 'Finish the pitch deck', minutes: 90, cut: true },
  { label: 'Reply to Marcus about the contract', minutes: 15, cut: false, why: 'Costs you nothing and unblocks him' },
  { label: 'Redesign the landing page', minutes: 90, cut: true },
  { label: 'Sort out the accountant thing', minutes: 45, cut: true },
  { label: 'Fix the signup redirect bug', minutes: 45, cut: false, why: 'Last thing blocking the beta' },
  { label: 'Read the three saved articles', minutes: 45, cut: true },
  { label: 'Go to the gym', minutes: 50, cut: false, why: 'Fourth day skipped. Shoes on, that is all' },
  { label: 'Research competitors properly', minutes: 90, cut: true },
  { label: 'Clean the flat', minutes: 45, cut: true },
  { label: 'Write the launch post', minutes: 50, cut: false, why: 'You have said this three days running' },
  { label: 'Learn the new framework', minutes: 90, cut: true },
  { label: 'Reorganise the whole backlog', minutes: 45, cut: true },
];

const TOTAL = ITEMS.reduce((s, i) => s + i.minutes, 0);
const KEPT = ITEMS.filter((i) => !i.cut);
const KEPT_MINUTES = KEPT.reduce((s, i) => s + i.minutes, 0);

const START_DELAY = 900;
const STAGGER = 130;
/** Must match the strike-through transition duration in the row below. */
const STRIKE_MS = 300;

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function CutDown() {
  const prefersReduced = useReducedMotion();
  // Index of how many cuts have been applied. -1 means untouched.
  const [cutsApplied, setCutsApplied] = useState(0);
  const [done, setDone] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  const cutIndexes = ITEMS.map((item, i) => (item.cut ? i : -1)).filter((i) => i >= 0);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  const run = useCallback(() => {
    clearTimers();
    setDone(false);
    setCutsApplied(0);

    if (prefersReduced) {
      // No motion at all: land on the finished state immediately. The argument is
      // in the result, not in the animation, so nothing is lost.
      setCutsApplied(cutIndexes.length);
      setDone(true);
      return;
    }

    cutIndexes.forEach((_, n) => {
      timers.current.push(
        window.setTimeout(() => setCutsApplied(n + 1), START_DELAY + n * STAGGER),
      );
    });
    // The last strike still needs its own 300ms to finish drawing after its state
    // flips. Settling the counters at +250 announces "done" over lines that are
    // visibly still moving.
    timers.current.push(
      window.setTimeout(
        () => setDone(true),
        START_DELAY + cutIndexes.length * STAGGER + STRIKE_MS + 120,
      ),
    );
  }, [clearTimers, cutIndexes.length, prefersReduced]);

  // Start when it actually comes into view, not on mount. The whole point is that
  // the reader watches it happen.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          run();
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const isCut = (index: number) => {
    const order = cutIndexes.indexOf(index);
    return order >= 0 && order < cutsApplied;
  };

  const remaining = ITEMS.length - cutsApplied;
  const remainingMinutes = ITEMS.reduce(
    (sum, item, i) => (isCut(i) ? sum : sum + item.minutes),
    0,
  );

  return (
    <div ref={containerRef}>
      {/* Live counters. Tabular so the numbers do not jitter as they change. */}
      <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3 border-y border-ink/15 py-5">
        <Counter label="On your list" value={String(remaining)} />
        <Counter label="Hours of work" value={formatHours(remainingMinutes)} />
        <Counter
          label="Status"
          value={done ? 'Today' : cutsApplied > 0 ? 'Cutting' : 'Everything'}
          muted={!done}
        />
        {done && (
          <button
            onClick={run}
            className={cn(
              'ml-auto min-h-11 text-[0.6875rem] uppercase tracking-[0.18em] ink-muted',
              'underline decoration-ink/25 underline-offset-4 transition-colors duration-150',
              'hover:text-ink hover:decoration-ink',
            )}
          >
            Run it again
          </button>
        )}
      </div>

      <ol className="mt-2">
        {ITEMS.map((item, i) => {
          const cut = isCut(i);
          const survived = done && !item.cut;
          return (
            <li
              key={item.label}
              className={cn(
                'group relative grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-4 border-b py-3.5',
                'transition-colors duration-200',
                cut ? 'border-ink/5' : 'border-ink/10',
              )}
            >
              <span
                className={cn(
                  'tabular text-[0.75rem] transition-colors duration-200',
                  cut ? 'ink-muted' : survived ? 'text-accent' : 'ink-muted',
                )}
              >
                {String(i + 1).padStart(2, '0')}
              </span>

              <span className="relative min-w-0">
                <span
                  className={cn(
                    'block text-[1rem] leading-snug transition-colors duration-300 sm:text-[1.125rem]',
                    cut ? 'ink-muted' : survived ? 'font-medium text-ink' : 'text-ink',
                  )}
                >
                  {item.label}
                </span>

                {/* The strike. A real rule drawn across, not a text-decoration, so it
                    can animate and reads as an editing mark. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    'pointer-events-none absolute left-0 top-1/2 h-px w-full origin-left bg-ink/40',
                    'transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                    'motion-reduce:transition-none',
                    cut ? 'scale-x-100' : 'scale-x-0',
                  )}
                />

                {survived && item.why && (
                  <span className="mt-1 block text-[0.8125rem] leading-relaxed ink-muted">
                    {item.why}
                  </span>
                )}
              </span>

              <span
                className={cn(
                  'tabular text-[0.75rem] transition-colors duration-200',
                  cut ? 'ink-muted' : 'ink-muted',
                )}
              >
                {item.minutes}m
              </span>
            </li>
          );
        })}
      </ol>

      <p
        aria-live="polite"
        className={cn(
          'mt-6 text-[0.9375rem] leading-relaxed transition-opacity duration-500',
          done ? 'opacity-100' : 'opacity-0',
        )}
      >
        <span className="text-ink">
          {ITEMS.length} things, {formatHours(TOTAL)} of intent, cut to {KEPT.length} things and{' '}
          {formatHours(KEPT_MINUTES)}.
        </span>{' '}
        <span className="ink-muted">
          That is the product. Everything else is bookkeeping.
        </span>
      </p>
    </div>
  );
}

function Counter({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <div
        className={cn(
          'tabular text-[2rem] leading-none tracking-[-0.02em] transition-colors duration-200 sm:text-[2.5rem]',
          muted ? 'ink-quiet' : 'text-ink',
        )}
      >
        {value}
      </div>
      <div className="mt-2 text-[0.625rem] uppercase tracking-[0.2em] ink-muted">{label}</div>
    </div>
  );
}
