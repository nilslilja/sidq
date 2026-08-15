import { cn } from '@/lib/cn';
import { PHASES, type Phase } from '@/lib/onboarding/steps';

/*
 * The first-run window.
 *
 * Two panes. Left is instruction and never holds more than a title, a line and
 * one control. Right is the product actually running, at the size it will really
 * be, because a screenshot of a card is a promise and a live card is proof.
 *
 * The right pane carries a faint grid. It reads as a workspace rather than as a
 * void, and it gives the floating previews something to sit against so their
 * shadows have a surface to fall on.
 */

export function Shell({
  left,
  right,
  progress,
  phase,
  onBack,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  /** 0..1. Fills the rail under the current phase. */
  progress: number;
  /** Which named phase is active. */
  phase?: Phase;
  onBack?: () => void;
}) {
  return (
    <div className="grid min-h-[100dvh] grid-cols-1 grid-rows-[auto_1fr] bg-[#0B0B10] text-white">
      {/*
       * The rail.
       *
       * Twelve steps as twelve dots reads as a chore. Five named phases reads as
       * a short process with a visible end, and naming them means someone three
       * screens in knows both where they are and what is left.
       */}
      {phase && <PhaseRail current={phase} progress={progress} />}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,42%)_1fr]">
      {/* ── Instruction ─────────────────────────────────────────────────── */}
      <div className="relative flex flex-col justify-center px-10 py-14 lg:px-14">
        {onBack && (
          <button
            onClick={onBack}
            className="absolute left-10 top-10 text-[0.8125rem] text-white/35 transition-colors duration-150 hover:text-white/80 lg:left-14"
          >
            ‹ Back
          </button>
        )}

        <div className="mx-auto w-full max-w-[24rem]">{left}</div>

      </div>

      {/* ── Live preview ────────────────────────────────────────────────── */}
      <div className="relative hidden overflow-hidden border-l border-white/[0.06] bg-[#08080C] lg:block">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px)',
            backgroundSize: '38px 38px',
          }}
        />
        {/* A single indigo bloom so the pane is lit rather than merely dark. */}
        <div
          aria-hidden="true"
          className="bloom-breathe pointer-events-none absolute left-1/2 top-1/3 size-[34rem] -translate-x-1/2 rounded-full bg-[#6366F1] opacity-[0.10] blur-[110px]"
        />
        <div className="relative grid h-full place-items-center p-12">{right}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * The named phases across the top, with a fill under the active one.
 *
 * Completed phases stay lit rather than reverting to grey: the point of a rail
 * is showing ground covered, and dimming it the moment you leave undoes that.
 */
function PhaseRail({ current, progress }: { current: Phase; progress: number }) {
  const index = PHASES.indexOf(current);

  return (
    <nav
      aria-label="Setup progress"
      className="flex items-center gap-1 border-b border-white/[0.07] px-6 py-4 lg:px-10"
    >
      {PHASES.map((name, i) => {
        const done = i < index;
        const active = i === index;

        return (
          <div key={name} className="flex min-w-0 flex-1 flex-col gap-2">
            <span
              className={cn(
                'truncate text-center text-[0.625rem] uppercase tracking-[0.16em] transition-colors duration-300',
                active ? 'text-white' : done ? 'text-white/50' : 'text-white/25',
              )}
            >
              {name}
            </span>
            <span className="h-[2px] w-full overflow-hidden rounded-full bg-white/[0.08]">
              <span
                className="block h-full rounded-full bg-[#6366F1] transition-[width] duration-500 ease-out"
                // Completed phases are full; the active one fills with overall
                // progress so the bar always moves on every single step.
                style={{ width: done ? '100%' : active ? `${Math.max(12, progress * 100)}%` : '0%' }}
              />
            </span>
          </div>
        );
      })}
    </nav>
  );
}

/** Title, one line, one control. The left pane never gets more than this. */
export function Instruction({
  title,
  subtitle,
  children,
  footer,
}: {
  title: React.ReactNode;
  subtitle?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <>
      <h1 className="font-display text-[clamp(2rem,3.2vw,2.75rem)] leading-[1.02] tracking-[-0.035em]">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-4 text-[1rem] leading-relaxed text-white/50">{subtitle}</p>
      )}
      {children && <div className="mt-9">{children}</div>}
      {footer && <div className="mt-6">{footer}</div>}
    </>
  );
}

/**
 * The primary control.
 *
 * When a step is gated on a real keypress this renders as an inert, outlined
 * waiting state rather than a disabled button. A greyed-out button reads as
 * broken; an outline that says what it is waiting for reads as an instruction.
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
      <div className="grid min-h-[3.5rem] w-full place-items-center rounded-[14px] border border-white/10 px-6 text-[0.9375rem] text-white/40">
        {label}
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className="btn-soft flex min-h-[3.5rem] w-full items-center justify-center gap-2 rounded-[14px] px-6 text-[0.9375rem] font-medium"
    >
      {label}
      <span aria-hidden="true">›</span>
    </button>
  );
}

/** A physical key, used in the shortcut steps. Lit when the key is held down. */
export function Key({ children, lit }: { children: React.ReactNode; lit?: boolean }) {
  return (
    <span
      className={cn(
        'grid min-w-[2.75rem] place-items-center rounded-[10px] px-3 py-2.5',
        'text-[0.8125rem] transition-all duration-150',
        lit
          ? 'bg-[#6366F1] text-white shadow-[0_0_0_1px_rgba(99,102,241,0.6),0_6px_20px_-4px_rgba(99,102,241,0.75)]'
          : 'bg-white/[0.07] text-white/70 shadow-[0_1px_0_0_rgba(255,255,255,0.09)_inset]',
      )}
    >
      {children}
    </span>
  );
}
