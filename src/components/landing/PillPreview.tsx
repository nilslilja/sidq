import { cn } from '@/lib/cn';

/*
 * The pill, drawn for the website.
 *
 * What this replaces was the first prototype's card: a task, a status line and a
 * running timer. It had stopped describing the product some time ago. Somebody
 * looking at the site saw a Pomodoro clock and then installed something that
 * moves conversations between assistants, which is the worst possible order to
 * learn that in.
 *
 * So this is the real interface, drawn rather than screenshotted. Same layout,
 * same type, same keys along the bottom. When the screen recording lands it can
 * sit next to this without either one looking like a different product.
 *
 * A drawing rather than an image on purpose: it is a few hundred bytes instead
 * of a few hundred kilobytes, it stays sharp on every display, and it cannot go
 * stale in the silent way a screenshot does when the interface moves on.
 */

export interface PillRow {
  title: string;
  /** The line underneath: why it ranked here, and where it came from. */
  meta: string;
}

export function PillPreview({
  query,
  rows,
  selected = 0,
  status,
  footer = 'Whole conversation, not a summary',
  className,
}: {
  /** Left blank to show the placeholder, as it looks when first summoned. */
  query?: string;
  rows: PillRow[];
  selected?: number;
  /** Right-hand count. Derived when not given, so it cannot contradict the list. */
  status?: string;
  footer?: string;
  className?: string;
}) {
  const count = rows.length === 1 ? '1 conversation' : `${rows.length} conversations`;

  return (
    <div
      className={cn(
        'w-full overflow-hidden rounded-[18px] text-left',
        'bg-[#141319]/95 ring-1 ring-inset ring-white/10',
        'shadow-[0_8px_24px_-8px_rgba(20,18,45,0.45),0_32px_64px_-24px_rgba(20,18,45,0.55)]',
        className,
      )}
    >
      {/* ── Query ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[0.9375rem]',
            query ? 'text-white' : 'text-white/30',
          )}
        >
          {query || 'Pick up where you stopped'}
          {/* The caret. Static: a blinking cursor in a still image reads as a
              bug, and on the marketing page nothing is focused anyway. */}
          {query && <span className="ml-0.5 inline-block h-[1.05em] w-px translate-y-[0.15em] bg-white/70" />}
        </span>
        <span className="shrink-0 text-[0.6875rem] tabular-nums text-white/30">
          {status ?? count}
        </span>
      </div>

      {rows.length > 0 && <div className="h-px bg-white/[0.07]" />}

      {/* ── Results ─────────────────────────────────────────────────────── */}
      <ul>
        {rows.map((row, i) => (
          <li
            key={row.title}
            className={cn(
              'flex items-center gap-3 px-4 py-2.5',
              i === selected && 'bg-white/[0.07]',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                i === selected ? 'bg-[#B8A6FF]' : 'bg-white/20',
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.875rem] text-white/90">{row.title}</span>
              <span className="block truncate text-[0.75rem] text-white/35">{row.meta}</span>
            </span>
          </li>
        ))}
      </ul>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-white/[0.07] px-4 py-2">
        <span className="text-[0.6875rem] text-white/30">{footer}</span>
        <span className="flex items-center gap-1.5 text-[0.625rem] text-white/25">
          <Key>↑↓</Key>
          <Key>↵</Key>
          <Key>esc</Key>
        </span>
      </div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[5px] bg-white/[0.07] px-1.5 py-0.5 text-white/40">{children}</span>
  );
}
