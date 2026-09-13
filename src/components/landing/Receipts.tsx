import { Reveal, Stagger } from "./Reveal";

/**
 * What a subscription actually buys before it stops.
 *
 * ── The rule this page lives or dies by ─────────────────────────────────────
 * Every number here is either quoted from a vendor's own published page or
 * measured on a real machine by `burn`, and it is labelled which. Nothing is
 * estimated, nothing is rounded up, and nothing is here because it would help.
 *
 * That is not scruple, it is the whole argument. A page claiming somebody
 * else's plan is worse than they say survives exactly one reply from somebody
 * with a screenshot. A page that publishes its method and its sample size
 * cannot be answered that way, which is why the measured section below says it
 * is empty rather than showing a figure.
 *
 * ── Why it is empty today ───────────────────────────────────────────────────
 * Because the meter shipped before the data did. `wall` counts a limit message
 * only when it is the *last* thing an assistant said, which is the difference
 * between a conversation that stopped and one that mentioned stopping. On the
 * machine this was written on that is zero sessions out of thirty.
 *
 * When there is something to say it comes from `burn::this_week` and nowhere
 * else.
 */

/** What each vendor publishes about its own limits. Quoted, never inferred. */
const PUBLISHED = [
  {
    plan: "Claude Pro",
    price: "$20",
    says: "A usage limit that resets every five hours, with a weekly cap on top of it.",
  },
  {
    plan: "Claude Max",
    price: "$100",
    says: "Sold as a multiple of Pro. The multiple is published; the tokens behind it are not.",
  },
  {
    plan: "Claude Max 20x",
    price: "$200",
    says: "The largest published tier, and still a weekly cap rather than an unmetered one.",
  },
];

export function Receipts() {
  return (
    <>
      <Reveal mode="pop" repeat>
        <p className="text-[0.8125rem] font-medium uppercase tracking-[0.14em] ink-muted">
          Receipts
        </p>
      </Reveal>

      <Reveal mode="pop" repeat delay={0.06}>
        <h1 className="mt-4 max-w-[20ch] font-serif text-[clamp(2.25rem,5.2vw,4rem)] leading-[1.02]">
          What your plan lasts before it stops
        </h1>
      </Reveal>

      <Reveal mode="pop" repeat delay={0.12}>
        <p className="mt-6 max-w-[62ch] text-[1.0625rem] leading-relaxed ink-muted">
          Sidq reads the conversations already on your Mac, so it can see the
          exact moment an assistant stopped answering: the limit message is the
          last thing in the transcript. This page is that measurement and
          nothing else.
        </p>
      </Reveal>

      <section className="mt-16">
        <h2 className="font-serif text-[clamp(1.5rem,3vw,2.25rem)] leading-tight">
          What they publish
        </h2>
        <p className="mt-3 max-w-[62ch] text-[0.9375rem] leading-relaxed ink-muted">
          Quoted from their own pages. None of this is in dispute, and none of
          it is the point: a published limit is a policy, not a measurement of
          what a day of work actually costs.
        </p>

        <div className="mt-8 grid gap-px overflow-hidden rounded-[18px] bg-ink/10 ring-1 ring-ink/10 sm:grid-cols-3">
          <Stagger step={0.06}>
            {PUBLISHED.map((row) => (
              <div key={row.plan} className="bg-paper p-6">
                <p className="font-medium">{row.plan}</p>
                <p className="mt-1 font-serif text-[1.75rem] leading-none">
                  {row.price}
                  <span className="text-[0.875rem] ink-muted"> a month</span>
                </p>
                <p className="mt-4 text-[0.875rem] leading-relaxed ink-muted">
                  {row.says}
                </p>
              </div>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="mt-20">
        <h2 className="font-serif text-[clamp(1.5rem,3vw,2.25rem)] leading-tight">
          What we measured
        </h2>

        <Reveal mode="pop" repeat>
          <div className="mt-6 max-w-[62ch] rounded-[18px] border border-ink/12 bg-ink/[0.02] p-6">
            {/*
             * The empty state, said out loud.
             *
             * It would take one line to put a plausible number here and nobody
             * could check it, which is exactly why there is not one. A receipt
             * with an invented figure on it is not a receipt.
             */}
            <p className="text-[0.9375rem] font-medium">
              Nothing yet, and that is the honest answer.
            </p>
            <p className="mt-3 text-[0.9375rem] leading-relaxed ink-muted">
              The meter counts a limit message only when it is the last thing an
              assistant said, which is the difference between a conversation
              that stopped and one that merely talked about stopping. Across
              thirty indexed conversations on the machine this was written on,
              that is zero so far.
            </p>
            <p className="mt-3 text-[0.9375rem] leading-relaxed ink-muted">
              This page fills in as the measurement arrives. Until it does there
              is no number here to quote, and inventing one would cost more than
              the number is worth.
            </p>
          </div>
        </Reveal>
      </section>

      <section className="mt-20">
        <h2 className="font-serif text-[clamp(1.5rem,3vw,2.25rem)] leading-tight">
          How you would check it yourself
        </h2>
        <p className="mt-3 max-w-[62ch] text-[0.9375rem] leading-relaxed ink-muted">
          Install Sidq. It reads the transcripts already on your disk, on your
          machine, and sends nothing anywhere. Your own figure appears in the
          app, computed from your own conversations, and you never have to take
          this page's word for anything.
        </p>
      </section>
    </>
  );
}
