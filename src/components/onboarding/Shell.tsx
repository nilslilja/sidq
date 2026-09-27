import { cn } from '@/lib/cn';
import { STEPS, type StepId } from '@/lib/onboarding/steps';

/*
 * The frame every setup screen sits in.
 *
 * The website's page, split in two: paper on the left with one instruction and
 * one action, and on the right a raised panel where a short film of that
 * instruction plays on a loop. It was a black window with a violet bloom and a
 * grid, which made setup the one part of Sidq that looked like a different
 * product from the page it was downloaded from.
 *
 * The progress line names the four screens rather than numbering them. Four
 * words with the current one in ink reads as something short with a visible end.
 */
export function Shell({
  left,
  right,
  step,
  onBack,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  step: StepId;
  onBack?: () => void;
}) {
  return (
    <div className="grid h-[100dvh] grid-rows-[auto_1fr] overflow-hidden bg-paper text-ink">
      <Progress current={step} />

      <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,44%)_1fr]">
        <div className="grid min-h-0 grid-rows-[auto_1fr] overflow-y-auto px-10 pb-10 lg:px-14">
          <div className="mx-auto flex h-9 w-full max-w-[25rem] items-center">
            {onBack && (
              <button
                onClick={onBack}
                className="-ml-2 cursor-pointer rounded-md px-2 py-1 text-[0.8125rem] text-ink/45 transition-colors duration-150 hover:text-ink"
              >
                ‹ Back
              </button>
            )}
          </div>

          {/* Keyed on the step so each screen arrives rather than swapping. */}
          <div key={step} className="animate-rise mx-auto flex w-full max-w-[25rem] flex-col justify-center py-6">
            {left}
          </div>
        </div>

        <div className="relative m-3 ml-0 hidden overflow-hidden rounded-[20px] bg-[#EFEDE8] ring-1 ring-inset ring-ink/[0.06] lg:block">
          <div key={step} className="animate-rise grid h-full place-items-center p-10">
            {right}
          </div>
        </div>
      </div>
    </div>
  );
}

function Progress({ current }: { current: StepId }) {
  const index = STEPS.findIndex((s) => s.id === current);

  return (
    <nav aria-label="Setup progress" className="flex items-center gap-6 px-10 pb-2 pt-5 lg:px-14">
      <span className="font-display text-[1.0625rem] font-semibold tracking-[-0.05em]">Sidq</span>
      <ol className="ml-auto flex items-center gap-5">
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            aria-current={i === index ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2 text-[0.8125rem] transition-colors duration-300',
              i === index ? 'text-ink' : i < index ? 'text-ink/45' : 'text-ink/30',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'size-1.5 rounded-full transition-colors duration-300',
                i === index ? 'bg-[#2448E8]' : i < index ? 'bg-ink/35' : 'bg-ink/15',
              )}
            />
            {s.label}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Instruction({
  title,
  subtitle,
  children,
  footer,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <>
      <h1 className="font-display text-[clamp(2.25rem,3.6vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.05em] text-ink">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-4 max-w-[40ch] text-[1.0625rem] leading-relaxed text-ink/60">{subtitle}</p>
      )}
      {children && <div className="mt-9">{children}</div>}
      {footer && <div className="mt-8">{footer}</div>}
    </>
  );
}

/**
 * The one button on a screen. The website's download button: flat ink.
 *
 * `waiting` is for a screen that moves on by itself once something happens
 * elsewhere, such as the browser coming back from sign-in. It says what it is
 * waiting for, with a slow blue pulse so it reads as listening, not broken.
 */
export function PrimaryAction({
  label,
  onClick,
  waiting,
}: {
  label: string;
  onClick?: () => void;
  waiting?: boolean;
}) {
  if (waiting) {
    return (
      <div className="flex h-12 w-full items-center justify-center gap-2.5 rounded-[10px] border border-ink/12 px-6 text-[0.9375rem] text-ink/55">
        <span aria-hidden="true" className="listening-dot size-1.5 rounded-full bg-[#2448E8]" />
        {label}
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] px-6',
        'bg-ink text-[0.9375rem] font-medium text-paper',
        'transition-[background-color,transform,translate,scale] duration-150 hover:bg-ink/85 active:scale-[0.985]',
      )}
    >
      {label}
    </button>
  );
}

/** A key, drawn as a keycap. Lit when it is held, so pressing it answers. */
export function Key({ children, lit }: { children: React.ReactNode; lit?: boolean }) {
  return (
    <span
      className={cn(
        'grid h-11 min-w-11 place-items-center rounded-[10px] px-3',
        'font-mono text-[0.8125rem] transition-[background-color,color,transform,translate,scale,box-shadow] duration-150',
        lit
          ? 'translate-y-px bg-[#2448E8] text-white shadow-[0_0_0_4px_rgba(36,72,232,0.15)]'
          : 'bg-white text-ink shadow-[0_0_0_1px_rgba(18,18,26,0.1),0_2px_0_rgba(18,18,26,0.08)]',
      )}
    >
      {children}
    </span>
  );
}
