import { cn } from '@/lib/cn';

/*
 * The soft field the download sits in.
 *
 * Everything here is atmosphere and nothing here is information, so it is all
 * aria-hidden and the whole stage is pointer-events-none above the content layer.
 *
 * The keycaps are Sidq's real shortcuts rather than a generic ⌘ and ↵. A visitor
 * who scrolls past has still been told, without reading anything, that this is a
 * thing you press from inside another app. Decoration that teaches beats
 * decoration that fills space.
 */

export interface StageKey {
  keys: string[];
  label: string;
  className: string;
  drift: 'drift-a' | 'drift-b';
}

const KEYS: StageKey[] = [
  {
    keys: ['⌘', '⇧', 'N'],
    label: 'Catch a thought',
    className: 'right-[6%] top-[8%] rotate-[-8deg]',
    drift: 'drift-a',
  },
  {
    keys: ['⌘', '⇧', 'S'],
    label: 'Out of the way',
    className: 'right-[26%] top-[46%] rotate-[11deg]',
    drift: 'drift-b',
  },
];

export function GlassStage({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0', className)}>
      {/* The field. Two offset radial washes rather than one linear gradient, so
          the light has a direction and a falloff instead of a seam. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_78%_8%,rgba(238,240,254,0.95)_0%,rgba(238,240,254,0)_55%),radial-gradient(90%_70%_at_18%_92%,rgba(224,228,252,0.7)_0%,rgba(224,228,252,0)_60%)]" />

      {/* The bloom, breathing. Slow enough to be felt rather than watched. */}
      <div className="bloom-breathe absolute right-[12%] top-[18%] size-[26rem] rounded-full bg-[#B8A6FF] opacity-[0.14] blur-[90px]" />

      {/* Hidden below the two-column breakpoint. In one column the copy fills the
          width, and floating keycaps stop being atmosphere the moment they land on
          top of the headline. The field and the bloom carry the section alone. */}
      {KEYS.map((key) => (
        <div key={key.label} className={cn('absolute hidden lg:block', key.className, key.drift)}>
          <div className="keycap flex items-center gap-1.5 rounded-[18px] px-4 py-3">
            {key.keys.map((glyph) => (
              <span
                key={glyph}
                className="grid size-8 place-items-center rounded-[9px] bg-white/70 text-[0.9375rem] font-medium text-ink/80 shadow-[0_1px_0_0_rgba(255,255,255,0.9)_inset,0_1px_2px_0_rgba(18,18,26,0.06)]"
              >
                {glyph}
              </span>
            ))}
          </div>
          <p className="mt-2.5 text-center text-[0.6875rem] uppercase tracking-[0.16em] text-ink/45">
            {key.label}
          </p>
        </div>
      ))}
    </div>
  );
}
