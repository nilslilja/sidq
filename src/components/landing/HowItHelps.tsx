import { PillPreview } from './PillPreview';
import { cn } from '@/lib/cn';

/*
 * How it helps, in two panels.
 *
 * Two cards, one filled and one glass, each with a live product fragment rather
 * than a description of one. The structure is the one every good product site in
 * this category converges on, for the sound reason that it forces exactly two
 * claims instead of a grid of nine.
 *
 * The two chosen are the two halves of the only thing Sidq does: finding the
 * conversation you were actually in the middle of, and putting all of it into
 * whichever assistant you are in now. There is nothing else to show.
 */

export function HowItHelps() {
  return (
    <section className="mx-auto max-w-[76rem] px-6 py-24" aria-labelledby="how">
      <h2
        id="how"
        className="max-w-[20ch] font-display text-[clamp(2rem,4.6vw,3.5rem)] leading-[0.96] tracking-[-0.04em]"
      >
        One keystroke, and it is already there
      </h2>

      <div className="mt-14 grid gap-5 lg:grid-cols-2">
        {/* ── Morning ───────────────────────────────────────────────────── */}
        <Panel filled>
          <h3 className="text-[clamp(1.375rem,2.4vw,1.75rem)] leading-snug tracking-[-0.02em] text-white">
            It knows <Pill filled>which one</Pill> you meant
          </h3>
          {/* /85, not /70. Measured at 3.93:1 on this indigo at /70, which fails
              AA for body text. /85 clears it without flattening the hierarchy. */}
          <p className="mt-4 max-w-[38ch] text-[0.9375rem] leading-relaxed text-white/85">
            Not the last thing you typed, which is usually a passing question. The
            conversations you actually put hours into, ranked, waiting.
          </p>

          <div className="mt-9">
            <PillPreview
              rows={[
                { title: 'Pricing page copy', meta: '5h session · Sidq' },
                { title: 'Onboarding email sequence', meta: '95 exchanges · Verdict' },
                { title: 'Refund policy wording', meta: '40m · Sidq' },
              ]}
              className="w-full"
            />
          </div>
        </Panel>

        {/* ── Afternoon ─────────────────────────────────────────────────── */}
        <Panel>
          <h3 className="text-[clamp(1.375rem,2.4vw,1.75rem)] leading-snug tracking-[-0.02em]">
            Then it hands over <Pill>all of it</Pill>
          </h3>
          <p className="mt-4 max-w-[38ch] text-[0.9375rem] leading-relaxed ink-muted">
            The whole conversation, word for word, into whichever assistant you are in
            now. Not a summary. It arrives knowing what you already decided and what you
            already threw out.
          </p>

          <div className="mt-9">
            <PillPreview
              query="pricing"
              rows={[{ title: 'Pricing page copy', meta: '5h session · Sidq' }]}
              selected={0}
              status="1,402 messages"
              footer="Copied. Paste it anywhere."
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
          ? 'bg-[linear-gradient(165deg,#B8A6FF_0%,#4F46E5_55%,#4338CA_100%)] shadow-[0_1px_0_0_rgba(255,255,255,0.22)_inset,0_36px_80px_-30px_rgba(79,70,229,0.5)]'
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
