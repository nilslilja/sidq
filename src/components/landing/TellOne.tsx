import { cn } from "@/lib/cn";
import { SidqMark } from "@/components/SidqMark";

/*
 * Tell one AI. The rest already know.
 *
 * The film's promise, as four moments, and marked honestly. The film is
 * allowed to show where Sidq is going; the page people download from is not
 * allowed to blur that line. Two of these work on a Mac today: Claude Code is
 * handed what you decided elsewhere before it answers, and Cursor can ask
 * Sidq over MCP. The other two are the next thing being built, and they say
 * so. A first customer who buys the part that exists stays; one who buys the
 * part that does not asks for a refund.
 */

type Moment = {
  app: string;
  logo?: string;
  ask: string;
  answer: string;
  from: string;
  status: "today" | "next";
};

const MOMENTS: Moment[] = [
  {
    app: "Claude Code",
    logo: "/claude-logo.svg",
    ask: "Fix the checkout rounding.",
    answer: "Rounding once on the total, like you decided with ChatGPT on 21 Aug.",
    from: "ChatGPT · 21 Aug",
    status: "today",
  },
  {
    app: "Cursor",
    ask: "Add Apple Pay to checkout.",
    answer: "Adding it to your Stripe checkout. Retries still key on the session id.",
    from: "Claude Code · 2 Sep",
    status: "today",
  },
  {
    app: "ChatGPT",
    logo: "/openai-logo.svg",
    ask: "Help me write the next section.",
    answer: "Continuing your thesis on urban heat islands in Stockholm. Here is section 3.",
    from: "Claude · 12 Sep",
    status: "next",
  },
  {
    app: "Gemini",
    logo: "/gemini-logo.svg",
    ask: "Write the launch email.",
    answer: "Drafted in your voice: short, warm, no jargon.",
    from: "Claude · 3 Sep",
    status: "next",
  },
];

export function TellOne() {
  return (
    <section aria-labelledby="tell-one" className="mx-auto max-w-[76rem] px-5 py-20 sm:px-6 sm:py-28">
      <h2
        id="tell-one"
        className="mx-auto max-w-[18ch] text-center font-display text-[clamp(2.25rem,5vw,4.25rem)] font-semibold leading-[1.02] tracking-[-0.05em] text-ink"
      >
        Tell one AI. <span className="text-[#2448E8]">The rest already know.</span>
      </h2>
      <p className="mx-auto mt-5 max-w-[46ch] text-center text-[1.0625rem] leading-relaxed text-ink/65">
        Sidq reads the conversations already on your Mac, keeps what you decided
        in your own words, and hands it to whichever AI you open next.
      </p>

      <div className="mt-14 grid gap-5 md:grid-cols-2">
        {MOMENTS.map((m) => (
          <article
            key={m.app}
            className={cn(
              "relative rounded-[28px] bg-white p-7 ring-1 ring-black/[0.06]",
              "shadow-[0_1px_2px_rgba(20,18,28,0.05),0_26px_60px_-30px_rgba(60,40,120,0.35)]",
              "transition-transform duration-200 hover:-translate-y-0.5",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2.5 text-[0.9375rem] font-semibold text-ink/70">
                {m.logo ? (
                  <img src={m.logo} alt="" width={20} height={20} className="size-5" />
                ) : (
                  <span aria-hidden="true" className="grid size-5 place-items-center rounded-[6px] bg-ink text-[0.6875rem] font-semibold text-paper">
                    {m.app[0]}
                  </span>
                )}
                {m.app}
              </span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.08em]",
                  m.status === "today" ? "bg-[#E8F5EC] text-[#1E7A3C]" : "bg-black/[0.05] text-ink/60",
                )}
              >
                {m.status === "today" ? "Works today" : "Coming next"}
              </span>
            </div>
            <p className="mt-5 text-[1rem] text-ink/60">{m.ask}</p>
            <p className="mt-2 text-[1.3125rem] font-semibold leading-snug tracking-[-0.02em] text-ink">
              {m.answer}
            </p>
            <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#EEEDFC] py-1.5 pl-2.5 pr-3.5 text-[0.8125rem] font-semibold text-[#4F46E5]">
              <SidqMark className="h-3 w-8" />
              Remembered from {m.from}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
