import { FOCUS_AREAS, BLOCKERS, RHYTHMS, type IntakeOption } from '@/lib/onboarding/steps';
import { cn } from '@/lib/cn';

/*
 * Intake, at first run.
 *
 * The step nothing else in this category has, because nothing else needs to know
 * anything about you. Sidq is useless until it does.
 *
 * Taps only. At this point in the flow no trust has been earned, and every text
 * field is a place to quit. Three questions, four taps, done.
 *
 * The second question is the one that matters. "What gets in the way" is the input
 * the planner uses to decide block sizes and ordering, and it is the question no
 * competitor asks, because none of them plan anything.
 */

export function IntakeChips({
  focus,
  blockers,
  rhythm,
  onFocus,
  onBlockers,
  onRhythm,
}: {
  focus: string[];
  blockers: string[];
  rhythm: string | null;
  onFocus: (next: string[]) => void;
  onBlockers: (next: string[]) => void;
  onRhythm: (next: string) => void;
}) {
  return (
    <div className="space-y-7">
      <Group
        label="What matters right now"
        options={FOCUS_AREAS}
        selected={focus}
        onToggle={(id) => onFocus(toggle(focus, id))}
      />
      <Group
        label="What gets in the way"
        options={BLOCKERS}
        selected={blockers}
        onToggle={(id) => onBlockers(toggle(blockers, id))}
      />
      <Group
        label="When you actually work"
        options={RHYTHMS}
        selected={rhythm ? [rhythm] : []}
        onToggle={onRhythm}
      />
    </div>
  );
}

/**
 * Functional update, always.
 *
 * Two chips tapped inside one render would otherwise drop the first, which is
 * exactly the bug this pattern exists to prevent and is easy to hit on a trackpad.
 */
function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function Group({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: IntakeOption[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <p className="text-[0.625rem] uppercase tracking-[0.2em] text-white/35">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => {
          const on = selected.includes(option.id);
          return (
            <button
              key={option.id}
              onClick={() => onToggle(option.id)}
              aria-pressed={on}
              className={cn(
                // 40px tall. Below the 44px touch minimum, and deliberately: this
                // is a pointer-only desktop window, and full-size chips would push
                // three groups past the fold on a 13 inch screen.
                'min-h-10 rounded-full px-3.5 text-[0.8125rem] transition-all duration-150',
                on
                  ? 'bg-[#6366F1] text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,0.8)]'
                  : 'bg-white/[0.06] text-white/65 hover:bg-white/[0.11] hover:text-white',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
