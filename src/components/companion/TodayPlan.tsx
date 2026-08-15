import { Check, ListChecks } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Task } from '@/types/domain';

/*
 * Today's plan, on the card.
 *
 * The card showed exactly one task and gave no way to see or change the rest,
 * which meant the only honest answer to "what is my plan" was "open the web
 * app". An overlay that cannot answer that is a status light.
 *
 * Everything here is one tap. No drag handles, no edit fields, no confirm
 * dialogs: this opens mid-task, and anything that takes more than a second is
 * something you will not do while working, which is the only time it is open.
 */

export function TodayPlan({
  tasks,
  activeId,
  onToggle,
  onFocus,
  onClose,
}: {
  tasks: Task[];
  activeId: string | null;
  /** Tick a task off, or put it back. */
  onToggle: (taskId: string) => void;
  /** Make this the one the card is tracking. */
  onFocus: (taskId: string) => void;
  onClose: () => void;
}) {
  const done = tasks.filter((t) => t.status === 'completed').length;
  const totalMinutes = tasks
    .filter((t) => t.status !== 'completed')
    .reduce((sum, t) => sum + t.estMinutes, 0);

  return (
    <section className="mt-3 border-t border-white/10 pt-3">
      <div className="mb-2.5 flex items-center gap-1.5 text-[0.625rem] uppercase tracking-[0.18em] text-white/40">
        <ListChecks className="size-3" />
        Today
        <span className="tabular-nums text-white/30">
          {done}/{tasks.length}
        </span>
        {totalMinutes > 0 && (
          <span className="tabular-nums text-white/30">· {formatSpan(totalMinutes)} left</span>
        )}
        <button
          onClick={onClose}
          className="ml-auto tracking-[0.16em] transition-colors duration-150 hover:text-white"
        >
          Close
        </button>
      </div>

      {tasks.length === 0 ? (
        <p className="text-[0.75rem] text-white/45">Nothing planned yet.</p>
      ) : (
        <ol className="space-y-1">
          {tasks.map((task) => {
            const isDone = task.status === 'completed';
            const isActive = task.id === activeId;

            return (
              <li key={task.id} className="flex items-center gap-2.5">
                {/*
                 * The checkbox is its own button, separate from the row.
                 * Merging them meant ticking a task and re-focusing it were the
                 * same gesture, so you could not do either deliberately.
                 */}
                <button
                  onClick={() => onToggle(task.id)}
                  aria-label={isDone ? `Reopen ${task.title}` : `Complete ${task.title}`}
                  className={cn(
                    'grid size-[1.125rem] shrink-0 place-items-center rounded-[6px] transition-colors duration-150',
                    isDone
                      ? 'bg-[#A9E5C3] text-[#12121A]'
                      : 'border border-white/20 hover:border-white/45',
                  )}
                >
                  {isDone && <Check className="size-3" strokeWidth={3} />}
                </button>

                <button
                  onClick={() => onFocus(task.id)}
                  disabled={isDone}
                  className={cn(
                    'min-w-0 flex-1 truncate py-1 text-left text-[0.8125rem] transition-colors duration-150',
                    isDone
                      ? 'text-white/30 line-through'
                      : isActive
                        ? 'text-white'
                        : 'text-white/70 hover:text-white',
                  )}
                >
                  {task.title}
                </button>

                <span
                  className={cn(
                    'tabular shrink-0 tabular-nums text-[0.75rem]',
                    isActive && !isDone ? 'text-[#A9B0FF]' : 'text-white/35',
                  )}
                >
                  {task.estMinutes}m
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-2.5 text-[0.6875rem] leading-relaxed text-white/30">
        Tap a task to track it. Tap the box to tick it off.
      </p>
    </section>
  );
}

function formatSpan(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
