import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RefreshCw, Moon, BarChart2 } from 'lucide-react';
import { useSidq } from '@/state/SidqProvider';
import { DayTimeline, type DayTimelineItem } from '@/components/day/DayTimeline';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import { dayProgress, completedCount, plannedCount, remainingMinutes } from '@/types/domain';
import { greeting, weekdayName, shortDate, localDateKey } from '@/lib/date';
import { viewStreak } from '@/lib/streak';

export function DayBoard() {
  const { phase, today, isDemo, justRevealed, dismissReveal, regenerate, toggle, focusTask, streak, limitReached, error, clearError } =
    useSidq();
  const navigate = useNavigate();

  // The stagger is a first-impression moment, not a permanent behaviour. Retire it
  // once it has played so navigating back does not replay the assembly.
  useEffect(() => {
    if (!justRevealed) return;
    const id = window.setTimeout(dismissReveal, 1200);
    return () => window.clearTimeout(id);
  }, [justRevealed, dismissReveal]);

  if (phase === 'generating') {
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        <Loader />
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="column grid min-h-[100dvh] place-items-center text-center">
        <div>
          <h1 className="font-display text-3xl">That did not work</h1>
          <p className="mx-auto mt-3 max-w-[34ch] text-sm leading-relaxed text-muted">{error}</p>
          <Button className="mt-8" onClick={clearError}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (limitReached) {
    return <LimitReached />;
  }

  if (!today) return null;

  const progress = dayProgress(today);
  const done = completedCount(today);
  const planned = plannedCount(today);
  const left = remainingMinutes(today);
  const view = viewStreak(streak, localDateKey());
  const allDone = planned > 0 && done === planned;

  const items: DayTimelineItem[] = today.tasks
    .filter((t) => t.status !== 'rolled')
    .map((t) => ({
      id: t.id,
      title: t.title,
      why: t.why,
      estMinutes: t.estMinutes,
      status: t.status,
      isTopPriority: t.title === today.topPriority,
      carryCount: t.carryCount,
    }));

  return (
    <div className="min-h-[100dvh] pb-32">
      <header className="column pt-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm text-muted">
              {greeting()} · {weekdayName(today.date)} {shortDate(today.date)}
            </p>
            <h1 className="mt-1 font-display text-[2rem] leading-tight">
              {allDone ? 'That is the day.' : today.topPriority}
            </h1>
          </div>

          <ProgressRing progress={progress} size={56} label={`${done} of ${planned} done`}>
            <span className="text-[0.8125rem] text-text">{done}</span>
          </ProgressRing>
        </div>

        {today.note && !allDone && (
          <p className="mt-5 max-w-[46ch] text-[0.9375rem] leading-relaxed text-muted">{today.note}</p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
          <span className="tabular">{left} min left</span>
          {view.count > 0 && (
            <span className={view.atRisk ? 'text-accent' : undefined}>
              {view.count} day{view.count === 1 ? '' : 's'} running
            </span>
          )}
          {view.grace > 0 && (
            <span title="Covers a missed day instead of resetting your streak">
              {view.grace} spare{view.grace === 1 ? '' : 's'} banked
            </span>
          )}
          {isDemo && (
            <span className="rounded-full border border-line px-2 py-0.5 uppercase tracking-[0.12em]">
              Demo plan
            </span>
          )}
        </div>
      </header>

      <main className="column mt-8">
        <DayTimeline items={items} onToggle={toggle} onFocus={(id) => {
          focusTask(id);
          navigate(`/focus/${encodeURIComponent(id)}`);
        }} reveal={justRevealed} />
      </main>

      {/* One primary action visible at a time. It changes with the state of the day. */}
      <footer className="fixed inset-x-0 bottom-0 border-t border-line glass">
        <div className="column flex items-center gap-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {allDone ? (
            <Link to="/shutdown" className="flex-1">
              <Button block size="lg">
                <Moon className="size-4" />
                Close the day
              </Button>
            </Link>
          ) : (
            <>
              <Link to="/shutdown" className="flex-1">
                <Button block variant="outline">
                  <Moon className="size-4" />
                  Shut down
                </Button>
              </Link>
              <Button variant="ghost" size="icon" onClick={regenerate} aria-label="Rebuild today's plan">
                <RefreshCw className="size-4" />
              </Button>
            </>
          )}
          <Link
            to="/momentum"
            aria-label="Momentum"
            className="grid size-11 place-items-center rounded-full text-muted transition-colors duration-(--duration-fast) hover:text-text"
          >
            <BarChart2 className="size-4" />
          </Link>
        </div>
      </footer>
    </div>
  );
}

function LimitReached() {
  return (
    <div className="column grid min-h-[100dvh] place-items-center text-center">
      <div>
        <h1 className="font-display text-3xl">You have used this week's plans</h1>
        <p className="mx-auto mt-3 max-w-[36ch] text-sm leading-relaxed text-muted">
          Today's board is still yours. New plans come back next week, or you can keep
          building them now.
        </p>
        <Link to="/upgrade" className="mt-8 inline-block">
          <Button size="lg">Keep the streak going</Button>
        </Link>
      </div>
    </div>
  );
}
