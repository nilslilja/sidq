import { CardPreview } from '@/components/onboarding/CardPreview';
import { cn } from '@/lib/cn';

/*
 * How it helps, in two panels.
 *
 * Two cards, one filled and one glass, each with a live product fragment rather
 * than a description of one. The structure is the one every good product site in
 * this category converges on, for the sound reason that it forces exactly two
 * claims instead of a grid of nine.
 *
 * The two chosen are the two moments the product exists for: the morning, when
 * nothing has been decided, and the middle of the afternoon, when the plan has
 * already gone wrong. Everything else Sidq does hangs off those.
 */

export function HowItHelps() {
  return (
    <section className="mx-auto max-w-[76rem] px-6 py-24" aria-labelledby="how">
      <h2
        id="how"
        className="max-w-[20ch] font-display text-[clamp(2rem,4.6vw,3.5rem)] leading-[0.96] tracking-[-0.04em]"
      >
        How Sidq helps during the day
      </h2>

      <div className="mt-14 grid gap-5 lg:grid-cols-2">
        {/* ── Morning ───────────────────────────────────────────────────── */}
        <Panel filled>
          <h3 className="text-[clamp(1.375rem,2.4vw,1.75rem)] leading-snug tracking-[-0.02em] text-white">
            Sidq <Pill filled>decides</Pill> before you do
          </h3>
          {/* /85, not /70. Measured at 3.93:1 on this indigo at /70, which fails
              AA for body text. /85 clears it without flattening the hierarchy. */}
          <p className="mt-4 max-w-[38ch] text-[0.9375rem] leading-relaxed text-white/85">
            Three to six real moves, sized to blocks you actually finish, waiting when
            you sit down. One marked as the thing that matters.
          </p>

          <div className="mt-9">
            <CardPreview
              task="Write the pricing page copy"
              status="Top priority today"
              tone="calm"
              clock="0:00"
              plan={[
                { title: 'Write the pricing page copy', minutes: 45 },
                { title: 'Reply to the three from Tuesday', minutes: 15 },
                { title: 'Fix the signup redirect', minutes: 25 },
              ]}
              className="w-full"
            />
          </div>
        </Panel>

        {/* ── Afternoon ─────────────────────────────────────────────────── */}
        <Panel>
          <h3 className="text-[clamp(1.375rem,2.4vw,1.75rem)] leading-snug tracking-[-0.02em]">
            When it goes wrong, it <Pill>rebuilds</Pill>
          </h3>
          <p className="mt-4 max-w-[38ch] text-[0.9375rem] leading-relaxed ink-muted">
            At 3pm with nothing ticked, every other planner shows you the same eight hours
            you already failed. Sidq rebuilds the rest of the day around the hours that
            are actually left.
          </p>

          <div className="mt-9">
            <CardPreview
              task="Rest of the day"
              status="Rebuilt around the 1h 40m you actually have"
              tone="alert"
              clock="15:02"
              plan={[
                { title: 'Reply to the three from Tuesday', minutes: 15 },
                { title: 'Start the pricing copy, stop after 25', minutes: 25 },
              ]}
              className="w-full"
            />
          </div>
        </Panel>
      </div>
    </section>
  );
}

function Panel({ children, filled }: { children: React.ReactNode; filled?: boolean }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[22px] p-8 lg:p-10',
        filled
          ? 'bg-[linear-gradient(165deg,#6366F1_0%,#4F46E5_55%,#4338CA_100%)] shadow-[0_1px_0_0_rgba(255,255,255,0.22)_inset,0_36px_80px_-30px_rgba(79,70,229,0.5)]'
          : 'glass',
      )}
    >
      {children}
    </div>
  );
}

/** The inline highlight on the verb. One per panel, on the word doing the work. */
function Pill({ children, filled }: { children: React.ReactNode; filled?: boolean }) {
  return (
    <span
      className={cn(
        'mx-0.5 inline-block rounded-full px-3 py-0.5 align-baseline',
        filled ? 'bg-white/20 text-white' : 'bg-accent/10 text-accent',
      )}
    >
      {children}
    </span>
  );
}
