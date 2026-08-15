import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, Gauge, Layers, PenLine, Scissors } from 'lucide-react';
import { useSidq } from '@/state/SidqProvider';
import { ProgressRing } from '@/components/ui/progress-ring';
import { ScrollArea } from '@/components/ui/scroll-area';
import { completedCount, plannedCount } from '@/types/domain';
import { addDays, localDateKey, initial, shortDate } from '@/lib/date';
import { viewStreak } from '@/lib/streak';
import { calibrationInsights, type CalibrationInsight } from '@/lib/calibration';
import { cn } from '@/lib/cn';

/*
 * Momentum, and the calibration surface.
 *
 * This is the screen that shows the product is paying attention. Not "you completed
 * 62% of tasks", which is a stick. What Sidq measured, and what it changed as a
 * result. Every card is a decision the app made on the user's behalf.
 */

const ICONS: Record<CalibrationInsight['kind'], typeof Gauge> = {
  capacity: Gauge,
  size: Layers,
  rhythm: Clock,
  carry: Scissors,
  phrasing: PenLine,
};

export function Momentum() {
  const { recentDays, streak, calibration } = useSidq();
  const today = localDateKey();
  const view = viewStreak(streak, today);
  const insights = calibrationInsights(calibration);

  const byDate = new Map(recentDays.map((d) => [d.date, d]));
  const window14 = Array.from({ length: 14 }, (_, i) => addDays(today, -(13 - i)));

  const closed = recentDays.filter((d) => d.status === 'closed');
  const totalDone = closed.reduce((s, d) => s + completedCount(d), 0);
  const cleanSweeps = closed.filter(
    (d) => plannedCount(d) > 0 && completedCount(d) === plannedCount(d),
  ).length;

  return (
    <div className="column min-h-[100dvh] py-10">
      <Link
        to="/today"
        className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-muted transition-colors duration-(--duration-fast) hover:text-text"
      >
        <ArrowLeft className="size-4" />
        Today
      </Link>

      <h1 className="mt-8 font-display text-[2.75rem] leading-[1.02]">
        {view.count > 0 ? (
          <>
            {view.count} day{view.count === 1 ? '' : 's'} running
          </>
        ) : (
          'No run going yet'
        )}
      </h1>

      <p className="mt-3 max-w-[40ch] text-[0.9375rem] leading-relaxed text-muted">
        {view.grace > 0
          ? `You have ${view.grace} spare day${view.grace === 1 ? '' : 's'} banked. Miss one and it gets spent for you, so the run keeps going.`
          : 'Spares refill as you go. Every full week banks one.'}
      </p>

      {/* The moat, made visible. */}
      <section className="mt-14" aria-labelledby="learned">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="learned" className="text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
            What Sidq has learned
          </h2>
          {calibration.confidence !== 'none' && (
            <span className="text-[0.6875rem] uppercase tracking-[0.14em] text-accent">
              {calibration.confidence} confidence
            </span>
          )}
        </div>

        {insights.length === 0 ? (
          <StillWatching closedDays={calibration.closedDays} />
        ) : (
          <ul className="mt-5 grid gap-3">
            {insights.map((insight) => {
              const Icon = ICONS[insight.kind];
              return (
                <li key={insight.kind} className="glass rounded-(--radius) p-5">
                  <div className="flex gap-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft">
                      <Icon className="size-[18px] text-accent" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[1.0625rem] font-medium leading-snug text-text">
                        {insight.headline}
                      </h3>
                      <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">
                        {insight.detail}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-14" aria-labelledby="fortnight">
        <h2 id="fortnight" className="text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
          Last two weeks
        </h2>

        <ScrollArea orientation="horizontal" className="mt-5">
          <ol className="flex gap-2 pb-3">
            {window14.map((date) => {
              const day = byDate.get(date);
              const planned = day ? plannedCount(day) : 0;
              const done = day ? completedCount(day) : 0;
              const ratio = planned > 0 ? done / planned : 0;
              const isToday = date === today;

              return (
                <li key={date} className="flex w-9 shrink-0 flex-col items-center gap-2">
                  <ProgressRing
                    progress={ratio}
                    size={30}
                    strokeWidth={1.5}
                    label={`${shortDate(date)}: ${done} of ${planned}`}
                  />
                  <span
                    className={cn(
                      'text-[0.625rem] uppercase',
                      isToday ? 'text-accent' : 'text-muted',
                    )}
                  >
                    {initial(date)}
                  </span>
                </li>
              );
            })}
          </ol>
        </ScrollArea>
      </section>

      <section className="glass mt-8 grid grid-cols-3 divide-x divide-line overflow-hidden rounded-(--radius)">
        <Stat label="Finished" value={String(totalDone)} />
        <Stat label="Clean days" value={String(cleanSweeps)} />
        <Stat
          label="Hit rate"
          value={
            calibration.totalTasks > 0 ? `${Math.round(calibration.completionRate * 100)}%` : '0%'
          }
        />
      </section>
    </div>
  );
}

/**
 * Shown before there is enough evidence. Sets the expectation that the product
 * improves, which is the reason to come back, without inventing an opinion from
 * two days of noise.
 */
function StillWatching({ closedDays }: { closedDays: number }) {
  const remaining = Math.max(0, 3 - closedDays);
  return (
    <div className="glass-subtle mt-5 rounded-(--radius) p-6">
      <p className="text-[0.9375rem] leading-relaxed text-text">
        {remaining === 0
          ? 'Sidq is building your profile now. A few more finished tasks and your days start adapting.'
          : `Close ${remaining} more day${remaining === 1 ? '' : 's'} and Sidq starts tuning your plans to how you actually work.`}
      </p>
      <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
        It learns which block sizes you finish, how much you really get through in a day, when you
        actually work, and which wording makes a task get done. Then it plans around that instead
        of around what you told us at signup.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-5">
      <p className="tabular text-[1.75rem] leading-none text-text">{value}</p>
      <p className="mt-2 text-[0.6875rem] uppercase tracking-[0.14em] text-muted">{label}</p>
    </div>
  );
}
