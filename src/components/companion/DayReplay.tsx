import { History } from 'lucide-react';
import { formatDuration, type DayReplay as Replay } from '@/lib/companion/session-replay';
import { cn } from '@/lib/cn';

/*
 * Where the day went.
 *
 * Bars rather than a pie or a donut: comparing lengths against a shared baseline
 * is the one comparison people read accurately, and this has to be legible in a
 * strip about 300px wide.
 *
 * No judgement anywhere. It reports hours. The moment it starts scoring them it
 * becomes a thing to avoid opening, and an end-of-day summary nobody opens is
 * worth nothing.
 */

const MAX_ROWS = 5;

export function DayReplay({ replay, onClose }: { replay: Replay; onClose: () => void }) {
  const rows = replay.apps.slice(0, MAX_ROWS);

  return (
    <section className="mt-3 border-t border-white/10 pt-3">
      <div className="mb-2 flex items-center gap-1.5 text-[0.625rem] uppercase tracking-[0.18em] text-white/40">
        <History className="size-3" />
        Today
        <button
          onClick={onClose}
          className="ml-auto tracking-[0.16em] transition-colors duration-150 hover:text-white"
        >
          Close
        </button>
      </div>

      <p className="text-[0.75rem] leading-relaxed text-white/70">{replay.headline}</p>

      {rows.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {rows.map((app) => (
            <li key={app.app} className="text-[0.75rem]">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-white/80">{app.app}</span>
                <span className="tabular shrink-0 tabular-nums text-white/45">
                  {formatDuration(app.seconds)}
                </span>
              </div>
              <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className={cn(
                    'h-full rounded-full bg-[#6366F1]',
                    // Scaled against the largest bar, not the total, so a day split
                    // across eight apps still shows shape instead of eight slivers.
                    'transition-[width] duration-500',
                  )}
                  style={{ width: `${Math.max(2, (app.seconds / rows[0].seconds) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2.5 text-[0.6875rem] leading-relaxed text-white/30">
        Counted on this machine from app names only. Nothing left it.
      </p>
    </section>
  );
}
