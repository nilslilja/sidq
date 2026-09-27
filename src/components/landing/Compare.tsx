import { cn } from "@/lib/cn";
import { SidqMark } from "@/components/SidqMark";
import { SUPPORTED } from "@/lib/companion/sources";

/*
 * Sidq against the other ways of having an AI remember you.
 *
 * The rule from docs/voice.md holds here more than anywhere: never punch at
 * the labs. Built-in memory is good, and every cell below says what each one
 * does rather than what it fails at. The gap is the villain, not a company:
 * each assistant remembers, and each one remembers only itself.
 *
 * Every claim has to survive somebody checking it. ChatGPT, Claude and Gemini
 * all keep memory and search their own chats, in their own cloud, as their own
 * summaries. A notes document works anywhere, by hand. Sidq's column is what
 * 0.9.11 does on a Mac today: it reads every assistant in SUPPORTED from disk and
 * browser, keeps your own sentences with the date, searches them by meaning on
 * the machine, and starts Codex in the same folder when Claude Code stops.
 */

type Cell = { text: string; good?: boolean };
type Column = { name: string; logo?: string; mark?: boolean; note?: boolean };

const COLUMNS: Column[] = [
  { name: "Sidq", mark: true },
  { name: "ChatGPT memory", logo: "/openai-logo.svg" },
  { name: "Claude memory", logo: "/claude-logo.svg" },
  { name: "Gemini", logo: "/gemini-logo.svg" },
  { name: "A notes doc", note: true },
];

const ROWS: { label: string; cells: Cell[] }[] = [
  {
    label: "Remembers across every AI you use",
    cells: [
      { text: `${SUPPORTED.length} assistants`, good: true },
      { text: "Only ChatGPT" },
      { text: "Only Claude" },
      { text: "Only Gemini" },
      { text: "If you paste it" },
    ],
  },
  {
    label: "Keeps what you decided, in your words",
    cells: [
      { text: "Quoted, with the date", good: true },
      { text: "Its own summary" },
      { text: "Its own summary" },
      { text: "Its own summary" },
      { text: "If you write it down" },
    ],
  },
  {
    label: "Search everything you ever said, by meaning",
    cells: [
      { text: "Across every AI", good: true },
      { text: "Its own chats" },
      { text: "Its own chats" },
      { text: "Its own chats" },
      { text: "Keyword only" },
    ],
  },
  {
    label: "Carries on when one AI hits its limit",
    cells: [
      { text: "Codex picks it up", good: true },
      { text: "Start over" },
      { text: "Start over" },
      { text: "Start over" },
      { text: "Copy and paste" },
    ],
  },
  {
    label: "Where your memory lives",
    cells: [
      { text: "On your Mac", good: true },
      { text: "OpenAI cloud" },
      { text: "Anthropic cloud" },
      { text: "Google cloud" },
      { text: "Wherever you keep it" },
    ],
  },
];

function Head({ col }: { col: Column }) {
  return (
    <span className="flex flex-col items-center gap-2 text-center">
      {col.mark ? (
        <span className="grid h-7 place-items-center text-[#4F46E5]">
          <SidqMark width={40} height={20} />
        </span>
      ) : col.logo ? (
        <img src={col.logo} alt="" width={22} height={22} className="size-[22px]" />
      ) : (
        <span aria-hidden="true" className="grid size-[22px] place-items-center text-[0.9375rem] text-ink/60">
          ✎
        </span>
      )}
      <span className={cn("text-[0.875rem]", col.mark ? "font-semibold text-ink" : "font-medium text-ink/60")}>
        {col.name}
      </span>
    </span>
  );
}

export function Compare() {
  return (
    <section aria-labelledby="compare" className="mx-auto max-w-[64rem] px-5 py-20 sm:px-6 sm:py-28">
      <h2
        id="compare"
        className="max-w-[20ch] font-display text-[clamp(2.125rem,4.6vw,3.75rem)] font-semibold leading-[1.04] tracking-[-0.05em] text-ink"
      >
        Every AI remembers. <span className="text-ink/45">Only inside itself.</span>
      </h2>
      <p className="mt-5 max-w-[48ch] text-[1.0625rem] leading-relaxed text-ink/65">
        Built in memory is good. It just stays in one app, and you use five.
        Sidq is the one memory that sits across all of them.
      </p>

      <div className="mt-14 overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-left">
          <thead>
            <tr>
              <th scope="col" className="w-[26%] pb-5 pr-6">
                <span className="sr-only">What it does</span>
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c.name}
                  scope="col"
                  className="px-3 pb-5 align-bottom"
                >
                  <Head col={c} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-t border-ink/10">
                <th scope="row" className="py-5 pr-6 text-[0.9375rem] font-medium leading-snug text-ink">
                  {row.label}
                </th>
                {row.cells.map((cell, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-3 py-5 text-center text-[0.875rem] leading-snug",
                      cell.good ? "font-semibold text-ink" : "text-ink/50",
                    )}
                  >
                    {cell.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
