import { LifeBuoy } from 'lucide-react';
import type { RescuePlan } from '@/lib/companion/day-rescue';

/*
 * The 3pm panel.
 *
 * This appears on the worst days, which makes its tone the most consequential
 * writing in the product. It states what is left and what moved, and it never
 * comments on why nothing got done. The plan was wrong for the day that happened;
 * saying so is both true and the only thing that keeps someone in the app.
 */

export function RescueDay({
  plan,
  onAccept,
  onDismiss,
}: {
  plan: RescuePlan;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className="mt-3 border-t border-white/10 pt-3">
      <div className="mb-2 flex items-center gap-1.5 text-[0.625rem] uppercase tracking-[0.18em] text-white/40">
        <LifeBuoy className="size-3" />
        Rest of the day
      </div>

      <p className="text-[0.75rem] leading-relaxed text-white/70">{plan.message}</p>

      {plan.keep.length > 0 && (
        <ol className="mt-2.5 space-y-1.5">
          {plan.keep.map((task, i) => (
            <li key={task.id} className="flex items-start gap-2 text-[0.75rem]">
              <span className="tabular mt-px shrink-0 tabular-nums text-white/30">{i + 1}</span>
              <span className="min-w-0 flex-1 text-white/85">{task.title}</span>
              <span className="tabular shrink-0 tabular-nums text-white/45">
                {task.estMinutes}m
              </span>
            </li>
          ))}
        </ol>
      )}

      {plan.drop.length > 0 && (
        <p className="mt-2 text-[0.6875rem] leading-relaxed text-white/35">
          Moved to tomorrow: {plan.drop.map((t) => t.title).join(', ')}
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-3">
        {plan.worthRescuing && (
          <button
            onClick={onAccept}
            className="rounded-md bg-white/[0.09] px-3 py-1.5 text-[0.6875rem] text-white/85 transition-colors duration-150 hover:bg-white/[0.16] hover:text-white"
          >
            Start the first one
          </button>
        )}
        <button
          onClick={onDismiss}
          className="text-[0.6875rem] uppercase tracking-[0.16em] text-white/40 transition-colors duration-150 hover:text-white"
        >
          Not now
        </button>
      </div>
    </section>
  );
}
