import { useCallback, useMemo, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { IntakeAnswers, WorkRhythm } from '@/types/domain';
import { LIFE_SHAPES, RHYTHMS, DERAILERS, goalsFor } from './seeds';

/*
 * Intake. Three screens, all tapping, zero required typing.
 *
 * The previous version opened on an empty textarea asking someone to freetype
 * everything on their mind. That is the blank page this product exists to remove,
 * placed at the exact moment the user has seen no value yet and has the least
 * patience. It was the worst screen in the app.
 *
 * Now: pick what your life looks like, tap the goals that are true, two quick
 * questions. Typing exists as an escape hatch and is never on the critical path.
 */

const STEPS = 3;

interface IntakeStepperProps {
  onComplete: (answers: IntakeAnswers) => void;
}

export function IntakeStepper({ onComplete }: IntakeStepperProps) {
  const [step, setStep] = useState(0);
  const [shapes, setShapes] = useState<string[]>([]);
  const [goals, setGoals] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const [rhythm, setRhythm] = useState<WorkRhythm | null>(null);
  const [derailers, setDerailers] = useState<string[]>([]);

  const suggested = useMemo(() => goalsFor(shapes), [shapes]);

  /**
   * Functional update, deliberately. Reading the array from the render closure and
   * writing it back loses a selection whenever two taps land in the same tick,
   * which is exactly what happens when someone taps three cards quickly. The first
   * tap silently vanishes.
   */
  const toggle = useCallback(
    <T,>(value: T, setter: React.Dispatch<React.SetStateAction<T[]>>) => {
      setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
    },
    [],
  );

  const next = useCallback(() => setStep((s) => Math.min(STEPS - 1, s + 1)), []);
  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  const finish = useCallback(() => {
    const all = [...goals, ...custom.split(',').map((s) => s.trim()).filter(Boolean)];
    onComplete({
      goals: all.join('\n'),
      workRhythm: rhythm,
      derailers: derailers.join(', '),
    });
  }, [goals, custom, rhythm, derailers, onComplete]);

  const canAdvance =
    step === 0 ? shapes.length > 0 : step === 1 ? goals.length > 0 || custom.trim().length > 0 : true;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <ProgressRule step={step} total={STEPS} />

      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          className="flex h-full transition-transform duration-(--duration-slow) ease-(--ease-out-expo) motion-reduce:transition-none"
          style={{ transform: `translate3d(-${step * 100}%, 0, 0)` }}
        >
          {/* 1. Life shape. Nothing to type, everything to recognise. */}
          <Slide
            active={step === 0}
            question="What's on your plate?"
            helper="Pick everything that applies. This is just so the first plan is not generic."
          >
            <div className="grid grid-cols-2 gap-2.5">
              {LIFE_SHAPES.map((shape) => (
                <Card
                  key={shape.id}
                  label={shape.label}
                  hint={shape.hint}
                  selected={shapes.includes(shape.id)}
                  onClick={() => toggle(shape.id, setShapes)}
                />
              ))}
            </div>
          </Slide>

          {/* 2. Goals, seeded from step 1 so the page is never blank. */}
          <Slide
            active={step === 1}
            question="Which of these are true?"
            helper="Tap the ones that are actually on your mind. Skip the rest."
          >
            <div className="flex flex-wrap gap-2">
              {suggested.map((goal) => (
                <Chip
                  key={goal}
                  label={goal}
                  selected={goals.includes(goal)}
                  onClick={() => toggle(goal, setGoals)}
                />
              ))}
            </div>

            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Anything else? Optional, comma separated"
              className={cn(
                'glass-subtle mt-5 w-full rounded-(--radius) px-4 py-3.5',
                'text-[0.9375rem] text-text placeholder:text-muted/60',
                'transition-colors duration-(--duration-fast) focus:border-accent focus:outline-none',
              )}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canAdvance) next();
              }}
            />
          </Slide>

          {/* 3. Both remaining questions on one screen. Both are taps. */}
          <Slide
            active={step === 2}
            question="Two quick things."
            helper="So the hard work lands when you can actually do it."
          >
            <p className="text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
              When is your head clearest?
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {RHYTHMS.map((r) => (
                <Card
                  key={r.id}
                  label={r.label}
                  hint={r.hint}
                  selected={rhythm === r.id}
                  onClick={() => setRhythm(r.id)}
                />
              ))}
            </div>

            <p className="mt-8 text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
              What usually derails you?
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {DERAILERS.map((d) => (
                <Chip
                  key={d}
                  label={d}
                  selected={derailers.includes(d)}
                  onClick={() => toggle(d, setDerailers)}
                />
              ))}
            </div>
          </Slide>
        </div>
      </div>

      <footer className="column pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
        <div className="flex items-center gap-4">
          {step > 0 ? (
            <Button variant="ghost" onClick={back}>
              Back
            </Button>
          ) : (
            <span aria-hidden="true" />
          )}
          <div className="flex-1" />
          {step < STEPS - 1 ? (
            <Button onClick={next} disabled={!canAdvance} size="lg">
              Next
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={finish} size="lg">
              Build my day
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

function ProgressRule({ step, total }: { step: number; total: number }) {
  return (
    <div
      className="h-px w-full bg-line"
      role="progressbar"
      aria-valuenow={step + 1}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Step ${step + 1} of ${total}`}
    >
      <div
        className="h-px bg-accent transition-[width] duration-(--duration-slow) ease-(--ease-out-expo)"
        style={{ width: `${((step + 1) / total) * 100}%` }}
      />
    </div>
  );
}

function Slide({
  question,
  helper,
  children,
  active,
}: {
  question: string;
  helper: string;
  children: React.ReactNode;
  active: boolean;
}) {
  return (
    // `inert` keeps off-screen steps out of the tab order and away from screen
    // readers, so tabbing from step one cannot land on an invisible step three.
    <section className="min-w-0 flex-[0_0_100%] overflow-y-auto" inert={!active}>
      <div className="column flex min-h-full flex-col justify-center py-14">
        <h1 className="font-display text-[2.25rem] leading-[1.02] sm:text-[2.75rem]">{question}</h1>
        <p className="mt-3 max-w-[34ch] text-[0.9375rem] leading-relaxed text-muted">{helper}</p>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

function Card({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'sheen relative min-h-[5.25rem] rounded-(--radius) p-4 text-left',
        'transition-[transform,border-color,background-color] duration-(--duration-fast) ease-(--ease-out-expo)',
        'hover:-translate-y-px active:translate-y-0 active:scale-[0.99]',
        selected ? 'glass border-accent' : 'glass-subtle',
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-[0.9375rem] font-medium leading-snug text-text">{label}</span>
        <span
          className={cn(
            'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border transition-colors duration-(--duration-fast)',
            selected ? 'border-accent bg-accent' : 'border-line-strong',
          )}
        >
          {selected && <Check className="size-2.5 stroke-[3.5] text-white" />}
        </span>
      </span>
      <span className="mt-1.5 block text-[0.8125rem] leading-snug text-muted">{hint}</span>
    </button>
  );
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[0.875rem]',
        'transition-[transform,border-color,color] duration-(--duration-fast) ease-(--ease-out-expo)',
        'active:scale-[0.98]',
        selected
          ? 'border border-accent bg-accent-soft text-text'
          : 'border border-line bg-white/50 text-muted hover:border-line-strong hover:text-text',
      )}
    >
      {selected && <Check className="size-3.5 shrink-0 stroke-[3] text-accent" />}
      {label}
    </button>
  );
}
