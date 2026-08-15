import { Check } from 'lucide-react';
import { motion, useAnimationControls, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/cn';
import type { TaskStatus } from '@/types/domain';

export interface DayTimelineItem {
  id: string;
  title: string;
  why?: string;
  estMinutes: number;
  status: TaskStatus;
  /** Renders in accent and carries the pinned label. Exactly one per day. */
  isTopPriority?: boolean;
  carryCount?: number;
}

interface DayTimelineProps {
  items: DayTimelineItem[];
  onToggle: (id: string) => void;
  onFocus?: (id: string) => void;
  /** Staggers items in on first paint. The day visibly assembling itself. */
  reveal?: boolean;
  className?: string;
}

const STAGGER_MS = 40;

export function DayTimeline({ items, onToggle, onFocus, reveal = false, className }: DayTimelineProps) {
  return (
    <ul className={cn('relative', className)}>
      {items.map((item, i) => (
        <TimelineRow
          key={item.id}
          item={item}
          isLast={i === items.length - 1}
          delay={reveal ? i * STAGGER_MS : 0}
          reveal={reveal}
          onToggle={onToggle}
          onFocus={onFocus}
        />
      ))}
    </ul>
  );
}

interface RowProps {
  item: DayTimelineItem;
  isLast: boolean;
  delay: number;
  reveal: boolean;
  onToggle: (id: string) => void;
  onFocus?: (id: string) => void;
}

function TimelineRow({ item, isLast, delay, reveal, onToggle, onFocus }: RowProps) {
  const prefersReduced = useReducedMotion();
  const controls = useAnimationControls();
  const isDone = item.status === 'completed';

  const handleToggle = () => {
    // The pop IS the reward, so it fires on the way to completed and never on the
    // way back. Un-checking is a correction, not an achievement.
    if (!isDone && !prefersReduced) {
      controls.start({
        scale: [1, 1.06, 1],
        transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1], times: [0, 0.45, 1] },
      });
    }
    onToggle(item.id);
  };

  return (
    <motion.li
      initial={reveal && !prefersReduced ? { opacity: 0, y: 8 } : false}
      animate={reveal && !prefersReduced ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1], delay: delay / 1000 }}
      className="relative"
    >
      {/* Connector. Stops short of the last node so the line does not dangle. */}
      {!isLast && (
        <span aria-hidden="true" className="absolute left-[0.6875rem] top-7 bottom-0 w-px bg-line" />
      )}

      <motion.div animate={controls} className="origin-left">
        <button
          onClick={handleToggle}
          aria-pressed={isDone}
          className={cn(
            'group flex w-full items-start gap-4 rounded-(--radius) py-3.5 pr-2 text-left',
            'transition-colors duration-(--duration-fast)',
            'hover:bg-surface',
          )}
        >
          <Node status={item.status} isTopPriority={item.isTopPriority} />

          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-3">
              <span
                className={cn(
                  'text-[0.9375rem] leading-snug transition-colors duration-(--duration-fast)',
                  isDone ? 'text-muted line-through decoration-line' : 'text-text',
                  item.isTopPriority && !isDone && 'font-medium',
                )}
              >
                {item.title}
              </span>
              <span className={cn('tabular shrink-0 text-xs', 'text-muted')}>
                {item.estMinutes}m
              </span>
            </span>

            {item.why && !isDone && (
              <span className="mt-1 block text-[0.8125rem] leading-relaxed text-muted">{item.why}</span>
            )}

          </span>
        </button>
      </motion.div>

      {/*
       * Meta row: badges and the Focus action.
       *
       * A sibling of the toggle button rather than a child, for two reasons. A
       * button cannot nest inside a button, and overlaying Focus on the row
       * collided with the duration label.
       *
       * Focus used to reveal on :hover. A touch device has no hover, so on the
       * phone this product is built for, focus mode was unreachable: the control
       * sat at opacity 0 with pointer-events none and nothing could ever change
       * that. It is permanently visible now, quiet rather than hidden.
       */}
      {!isDone && (
        <div className="flex min-h-11 items-center gap-3 pl-10">
          {item.isTopPriority && (
            <span className="text-[0.6875rem] uppercase tracking-[0.14em] text-accent">
              Today's one thing
            </span>
          )}
          {(item.carryCount ?? 0) > 0 && (
            <span className="text-[0.6875rem] uppercase tracking-[0.14em] text-muted">
              Carried {item.carryCount === 1 ? 'once' : `${item.carryCount}×`}
            </span>
          )}

          {onFocus && (
            <button
              onClick={() => onFocus(item.id)}
              aria-label={`Start a focus timer for ${item.title}`}
              className={cn(
                'ml-auto grid min-h-11 min-w-11 place-items-center rounded-sm px-3',
                // text-muted (5.7:1), not line-strong. line-strong is 16% white,
                // which composites to 1.5:1 on this canvas, invisible to plenty of
                // people and a straight WCAG failure for interactive text.
                'text-[0.6875rem] uppercase tracking-[0.12em] text-muted',
                'transition-colors duration-(--duration-fast) hover:text-text',
              )}
            >
              Focus
            </button>
          )}
        </div>
      )}
    </motion.li>
  );
}

function Node({ status, isTopPriority }: { status: TaskStatus; isTopPriority?: boolean }) {
  const base = 'relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border transition-all duration-(--duration-fast)';

  if (status === 'completed') {
    return (
      <span className={cn(base, 'border-accent bg-accent')}>
        <Check className="size-3.5 stroke-[2.5]" style={{ color: 'var(--color-accent-text)' }} />
      </span>
    );
  }

  if (status === 'active') {
    return (
      <span className={cn(base, 'border-accent bg-bg')}>
        <span className="size-2 rounded-full bg-accent" />
      </span>
    );
  }

  return (
    <span
      className={cn(
        base,
        'bg-bg group-hover:border-line-strong',
        isTopPriority ? 'border-accent' : 'border-line',
      )}
    />
  );
}
