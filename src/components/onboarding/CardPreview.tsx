import { Pause, Volume2, CornerDownLeft, Settings2, Users, Inbox } from 'lucide-react';
import { cn } from '@/lib/cn';

/*
 * The card, for the preview pane.
 *
 * A presentational twin of the real overlay: same material, same layout, no Tauri,
 * no timers, no engine. Driven entirely by props so a step can pose it mid-capture
 * or mid-plan without any of that state existing yet.
 *
 * It is a twin rather than the real component because the real one owns a window
 * resize observer, a global shortcut listener and a presence channel. Mounting all
 * of that eight times inside an onboarding tour to draw a rectangle would be the
 * wrong trade. The cost is that the two can drift, so the material lives in one
 * place: whatever changes here changes in Overlay.tsx.
 */

export interface CardPreviewProps {
  task: string;
  status: string;
  tone?: 'quiet' | 'alert' | 'calm';
  clock?: string;
  /** Shows the quick capture field open. */
  capturing?: boolean;
  /** Renders the plan list under the card, as the day view does. */
  plan?: { title: string; minutes: number }[];
  dimmed?: boolean;
  className?: string;
}

export function CardPreview({
  task,
  status,
  tone = 'quiet',
  clock = '24:18',
  capturing,
  plan,
  dimmed,
  className,
}: CardPreviewProps) {
  return (
    <div
      className={cn(
        // relative, or the specular top edge below positions against the page.
        'relative w-[26rem] max-w-full select-none overflow-hidden rounded-[16px] px-4 py-3.5',
        'bg-[linear-gradient(155deg,rgba(38,36,64,0.82)_0%,rgba(16,16,26,0.9)_60%,rgba(20,16,34,0.88)_100%)]',
        'backdrop-blur-[28px] backdrop-saturate-[1.7]',
        'border border-white/[0.13]',
        'shadow-[0_2px_8px_-2px_rgba(0,0,0,0.45),0_28px_64px_-20px_rgba(10,8,30,0.85)]',
        'transition-all duration-500',
        dimmed && 'scale-[0.97] opacity-25 blur-[1px]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.28)_28%,rgba(255,255,255,0.28)_72%,transparent)]"
      />

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9375rem] font-medium leading-snug tracking-[-0.01em] text-white">
            {task}
          </p>
          <p
            className={cn(
              'mt-1 flex items-center gap-1.5 truncate text-[0.75rem]',
              tone === 'alert'
                ? 'text-[#FFB4A2]'
                : tone === 'calm'
                  ? 'text-[#A9E5C3]'
                  : 'text-white/50',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                tone === 'alert'
                  ? 'bg-[#FFB4A2]'
                  : tone === 'calm'
                    ? 'bg-[#A9E5C3]'
                    : 'bg-white/35',
              )}
            />
            {status}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <span className="tabular text-[1.0625rem] leading-none tracking-[-0.02em] tabular-nums text-white">
            {clock}
          </span>
          <div className="flex items-center gap-0.5 text-white/40">
            <Pause className="size-3.5" />
            <Volume2 className="size-3.5" />
            <CornerDownLeft className="size-3.5" />
            <Users className="size-3.5" />
            <Settings2 className="size-3.5" />
          </div>
        </div>
      </div>

      {capturing && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[0.625rem] uppercase tracking-[0.18em] text-white/40">
            <Inbox className="size-3" />
            Catch it, keep working
          </div>
          <div className="flex items-center rounded-md border border-white/20 bg-black/30 px-3 py-2 text-[0.8125rem] text-white">
            Ask Dan about the pricing page
            {/* A caret rather than a real input: this is a poster of the feature. */}
            <span className="ml-0.5 inline-block h-[1.05em] w-px animate-pulse bg-white/80" />
          </div>
        </div>
      )}

      {plan && (
        <ol className="mt-3 space-y-2 border-t border-white/10 pt-3">
          {plan.map((item, i) => (
            <li key={item.title} className="flex items-start gap-2.5 text-[0.8125rem]">
              <span
                className={cn(
                  'mt-px grid size-4 shrink-0 place-items-center rounded-[5px] text-[0.625rem]',
                  i === 0 ? 'bg-[#B8A6FF] text-white' : 'bg-white/10 text-white/50',
                )}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 text-white/85">{item.title}</span>
              {/* /60 rather than /40. At /40 this measured 3.78:1 on the card,
                  under AA, and a duration nobody can read is not a quiet
                  detail, it is a missing one. */}
              <span className="tabular shrink-0 tabular-nums text-white/60">
                {item.minutes}m
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
