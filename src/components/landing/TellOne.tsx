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
 *
 * Set as a list with hairlines, not a grid of floating cards with badges on
 * them. The content is four sentences somebody said to an AI and what came
 * back; it reads best set like text.
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
    from: "ChatGPT, 21 Aug",
    status: "today",
  },
  {
    app: "Cursor",
    ask: "Add Apple Pay to checkout.",
    answer: "Adding it to your Stripe checkout. Retries still key on the session id.",
    from: "Claude Code, 2 Sep",
    status: "today",
  },
  {
    app: "ChatGPT",
    logo: "/openai-logo.svg",
    ask: "Help me write the next section.",
    answer: "Continuing your thesis on urban heat islands in Stockholm. Here is section 3.",
    from: "Claude, 12 Sep",
    status: "next",
  },
  {
    app: "Gemini",
    logo: "/gemini-logo.svg",
    ask: "Write the launch email.",
    answer: "Drafted in your voice: short, warm, no jargon.",
    from: "Claude, 3 Sep",
    status: "next",
  },
];

export function TellOne() {
  return (
    <section aria-labelledby="tell-one" className="mx-auto max-w-[64rem] px-5 py-20 sm:px-6 sm:py-28">
      <h2
        id="tell-one"
        className="max-w-[18ch] font-display text-[clamp(2.25rem,5vw,4.25rem)] font-semibold leading-[1.02] tracking-[-0.05em] text-ink"
      >
        Tell one AI. <span className="text-[#2448E8]">The rest already know.</span>
      </h2>
      <p className="mt-5 max-w-[46ch] text-[1.0625rem] leading-relaxed text-ink/65">
        Sidq reads the conversations already on your Mac, keeps what you decided
        in your own words, and hands it to whichever AI you open next.
      </p>

      <ol className="mt-14 border-t border-ink/10">
        {MOMENTS.map((m) => (
          <li
            key={m.app}
            className="grid gap-3 border-b border-ink/10 py-8 sm:grid-cols-[12rem_1fr] sm:gap-10"
          >
            <div>
              <p className="flex items-center gap-2.5 text-[0.9375rem] font-semibold text-ink">
                {m.logo ? (
                  <img src={m.logo} alt="" width={18} height={18} className="size-[18px]" />
                ) : (
                  <span aria-hidden="true" className="grid size-[18px] place-items-center rounded-[5px] bg-ink text-[0.625rem] font-semibold text-paper">
                    {m.app[0]}
                  </span>
                )}
                {m.app}
              </p>
              <p className={m.status === "today" ? "mt-1.5 text-[0.8125rem] text-[#1E7A3C]" : "mt-1.5 text-[0.8125rem] text-ink/50"}>
                {m.status === "today" ? "Works today" : "Coming next"}
              </p>
            </div>
            <div>
              <p className="text-[1rem] text-ink/55">{m.ask}</p>
              <p className="mt-1.5 text-[clamp(1.25rem,2vw,1.5rem)] font-semibold leading-snug tracking-[-0.02em] text-ink">
                {m.answer}
              </p>
              <p className="mt-3 flex items-center gap-2 text-[0.8125rem] text-[#4F46E5]">
                <SidqMark width={22} height={12} />
                Remembered from {m.from}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
