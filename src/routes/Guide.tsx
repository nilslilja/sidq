import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/cn";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { DownloadButton } from "@/components/landing/DownloadButton";
import { guideFor, type Guide } from "@/lib/guides";

/*
 * ── Why this page exists ─────────────────────────────────────────────────────
 *
 * The site had five pages and none of them answered a question anybody types.
 * "Sidq" is not searched, the headline is a claim about a category, and the
 * pricing and FAQ pages are read by people who already arrived. That is a site
 * with nothing for search to rank, which is a different problem from the
 * canonical bug underneath it and is not fixed by fixing that.
 *
 * Somebody typing "how do I move my ChatGPT conversation to Claude" is not a
 * blog reader at the top of a funnel. They are stuck, right now, in the exact
 * situation this product was built for. That is the highest-intent query the
 * product has and nobody owns it.
 *
 * ── Why it is one page and not twenty ────────────────────────────────────────
 *
 * Five assistants make twenty pairs, and twenty near-identical pages is the
 * thin-content trap: Google reads them as one page duplicated nineteen times
 * and ranks none of them. One page that genuinely answers the question beats
 * twenty that gesture at it, and the honest four options below — including the
 * three that do not involve Sidq — are what makes it worth linking to.
 */

/** A step in the guide. Numbered in the markup so the count is not decorative. */
function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="relative border-t border-ink/10 pt-8">
      <div className="flex items-baseline gap-4">
        <span className="font-display text-[0.875rem] tabular-nums text-ink/35">
          {String(n).padStart(2, "0")}
        </span>
        <h3 className="font-display text-[clamp(1.25rem,2.2vw,1.625rem)] leading-tight tracking-[-0.03em]">
          {title}
        </h3>
      </div>
      <div className="mt-3 max-w-[62ch] space-y-3 pl-[2.6rem] text-[1rem] leading-relaxed text-ink/70">
        {children}
      </div>
    </li>
  );
}

export function ChatgptToClaude() {
  return (
    <div className="bg-paper">
      <header className="border-b border-ink/10">
        <div className="mx-auto flex max-w-[76rem] items-center justify-between gap-6 px-6 py-5">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center font-display text-[1.375rem] leading-none tracking-[-0.05em] sm:min-h-0"
          >
            Sidq
          </Link>
          <nav className="flex items-center gap-6 sm:gap-7">
            <Link
              to="/pricing"
              className="inline-flex min-h-11 items-center text-[0.875rem] transition-opacity duration-150 hover:opacity-60 sm:min-h-0"
            >
              Pricing
            </Link>
            <Link
              to="/faq"
              className="inline-flex min-h-11 items-center text-[0.875rem] transition-opacity duration-150 hover:opacity-60 sm:min-h-0"
            >
              Questions
            </Link>
            <Link
              to="/"
              className="inline-flex min-h-11 items-center rounded-[10px] bg-ink px-4 text-[0.875rem] font-medium text-paper transition-opacity duration-150 hover:opacity-90 sm:min-h-9"
            >
              Download
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[76rem] px-6 py-16 lg:py-24">
        {/*
         * The h1 is the query, near enough word for word.
         *
         * A headline that is a clever claim performs on a landing page and
         * loses in a result, where the reader is scanning ten blue lines for
         * the one that repeats what they just typed.
         */}
        <h1 className="max-w-[24ch] font-display text-[clamp(2rem,4.6vw,3.5rem)] leading-[0.96] tracking-[-0.04em]">
          How to move a ChatGPT conversation into Claude
        </h1>

        <p className="ink-muted mt-6 max-w-[62ch] text-[1.0625rem] leading-relaxed">
          There are four ways, and three of them are free and have nothing to do
          with us. They are below in order of how much of the conversation
          survives, because that is the only thing that actually differs between
          them.
        </p>

        {/*
         * The short answer first, before the reasoning.
         *
         * Somebody who searched this has a question, not an interest. Making
         * them read nine hundred words to find out that copy and paste mostly
         * works is how a page gets closed, and a page that gets closed in four
         * seconds does not keep whatever position it earned.
         */}
        <div className="mt-10 max-w-[62ch] rounded-[14px] border border-ink/12 bg-ink/[0.03] p-6">
          <p className="text-[0.75rem] uppercase tracking-[0.16em] text-ink/45">
            Short answer
          </p>
          <p className="mt-2 text-[1rem] leading-relaxed">
            Select the whole conversation, copy it, and paste it into Claude with
            one line at the top saying where it came from. That works, and it is
            free. It breaks when the conversation is long enough that selecting
            it is a chore, or when the useful part is spread over six chats
            instead of one.
          </p>
        </div>

        <h2 className="mt-16 font-display text-[clamp(1.5rem,2.8vw,2rem)] leading-tight tracking-[-0.035em]">
          The four ways, worst to best
        </h2>

        <ol className="mt-8 space-y-10">
          <Step n={1} title="Ask ChatGPT to summarise it, then paste the summary">
            <p>
              This is the one everybody tries first and it is the worst of the
              four. A summary keeps the conclusions and throws away the
              corrections, the ideas you rejected, and the way you actually
              phrase things. Claude then reads <em>about</em> your work instead
              of having been there, and confidently repeats the assumption you
              spent forty minutes talking ChatGPT out of.
            </p>
            <p>
              Use it only when the conversation is genuinely long and genuinely
              settled, and you want the outcome rather than the reasoning.
            </p>
          </Step>

          <Step n={2} title="Select all, copy, paste">
            <p>
              Click at the top of the conversation, scroll to the bottom,
              shift-click, copy. Paste into Claude under a line like{" "}
              <span className="font-mono text-[0.9375rem]">
                “This is a conversation I had with ChatGPT. Read it, then carry
                on from the end.”
              </span>
            </p>
            <p>
              That framing line matters more than it looks. Without it Claude
              receives a wall of dialogue with no brief and often starts
              critiquing the conversation rather than continuing it.
            </p>
            <p>
              The real limit is not quality, it is friction. It works fine once.
              It is miserable on a 200-message thread, and it does nothing at
              all for the case where what you need is spread across several
              chats.
            </p>
          </Step>

          <Step n={3} title="Export your ChatGPT data and paste from the file">
            <p>
              In ChatGPT, open Settings, then Data controls, then Export data.
              OpenAI emails you a link to a zip archive. Inside it is{" "}
              <span className="font-mono text-[0.9375rem]">conversations.json</span>{" "}
              containing everything you have ever asked.
            </p>
            <p>
              The export is complete, which is its advantage, and it is also
              JSON, which is its problem: finding one conversation in it is a
              search through a single enormous file, and the email does not
              always arrive quickly.
            </p>
            <p>
              Worth doing once regardless. It is your data and having a copy of
              it costs nothing.
            </p>
          </Step>

          <Step n={4} title="Use a tool that already has all of it">
            <p>
              This is what we build, so read it as an interested party. Sidq is
              a Mac app that reads the AI conversations already on your machine
              and hands any of them to any other assistant with one keystroke,
              word for word.
            </p>
            <p>
              What it changes over option 2 is not fidelity, it is that you stop
              doing it by hand: no selecting, no scrolling, and the framing line
              is written for you. It also drops the greetings and the
              ok-thanks, and if the conversation is bigger than the window it is
              going into, it carries what matters and names what it left, in the
              file, where Claude reads it.
            </p>
            <p>
              Nothing is uploaded. The conversations are read from your own disk
              and go to your own clipboard, and it works with the wifi off.
            </p>
          </Step>
        </ol>

        <h2 className="mt-20 font-display text-[clamp(1.5rem,2.8vw,2rem)] leading-tight tracking-[-0.035em]">
          What actually transfers, and what does not
        </h2>

        <div className="mt-6 max-w-[62ch] space-y-4 text-[1rem] leading-relaxed text-ink/70">
          <p>
            Text transfers. Every one of these four methods moves the words, and
            the words are almost always the thing you needed.
          </p>
          <p>
            What does not transfer, by any method: ChatGPT&rsquo;s memory of you
            across other chats, custom instructions, uploaded files, images, and
            anything a tool did rather than said. Claude starts with the
            conversation and none of the account around it. If your custom
            instructions matter, paste them too, once, at the top.
          </p>
        </div>

        <h2 className="mt-20 font-display text-[clamp(1.5rem,2.8vw,2rem)] leading-tight tracking-[-0.035em]">
          Going the other way, or anywhere else
        </h2>

        <div className="mt-6 max-w-[62ch] space-y-4 text-[1rem] leading-relaxed text-ink/70">
          <p>
            All four work in reverse, and between any two assistants. Claude into
            ChatGPT, Gemini into Claude, Grok into anything. Nothing above is
            specific to the pair in the title except which settings menu the
            export lives in.
          </p>
          <p>
            Claude&rsquo;s export is under Settings, then Privacy, then Export
            data. Gemini&rsquo;s is in Google Takeout.
          </p>
        </div>

        {/*
         * The download sits at the end, not the top.
         *
         * Three of the four answers are free and do not involve us. A page that
         * answers the question and then offers the tool is worth linking to; a
         * page that withholds the answer until you install something is the
         * thing everybody searching this has already closed twice.
         */}
        <div className="mt-20 max-w-[62ch] rounded-[16px] border border-ink/12 bg-ink/[0.03] p-8">
          <h2 className="font-display text-[1.5rem] leading-tight tracking-[-0.035em]">
            If you do this more than once a week
          </h2>
          <p className="mt-3 text-[1rem] leading-relaxed text-ink/70">
            Sidq is free for five handovers a week, with no card. It reads
            ChatGPT, Claude, Gemini, Grok and DeepSeek in your own browser, and
            Claude Code, Cursor, Windsurf and VS Code straight off the disk,
            including everything you did before you installed it.
          </p>
          <div className="mt-6">
            <DownloadButton />
          </div>
          <p className="mt-3 text-[0.8125rem] text-ink/50">
            Mac app. Free, no card, about a minute to set up.
          </p>
        </div>

        <p className="mt-12 text-[0.875rem] text-ink/50">
          More questions:{" "}
          <Link to="/faq" className={cn("underline underline-offset-4", "hover:opacity-60")}>
            how Sidq reads each assistant
          </Link>{" "}
          &middot;{" "}
          <Link to="/pricing" className={cn("underline underline-offset-4", "hover:opacity-60")}>
            what it costs
          </Link>
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}


/*
 * ── The other guides, sharing this page's layout and none of its words ───────
 *
 * The comment at the top of this file argues against twenty near-identical
 * pages and that argument still holds. What it did not cover is that an editor
 * is a different article from a browser assistant: when the transcript is
 * already on the disk, the whole "export it first" half of the advice does not
 * apply, and the page that pretends otherwise is wrong rather than merely thin.
 *
 * So the layout is shared here and every word is written per pair in
 * `src/lib/guides.ts`. Four pages, not ninety. If a fifth ever earns a URL it
 * earns it by having something of its own to say.
 */
function GuidePage({ guide }: { guide: Guide }) {
  return (
    <div className="bg-paper">
      <header className="border-b border-ink/10">
        <div className="mx-auto flex max-w-[76rem] items-center justify-between gap-6 px-6 py-5">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center font-display text-[1.375rem] leading-none tracking-[-0.05em] sm:min-h-0"
          >
            Sidq
          </Link>
          <nav className="flex items-center gap-6 sm:gap-7">
            <Link
              to="/pricing"
              className="inline-flex min-h-11 items-center text-[0.875rem] transition-opacity duration-150 hover:opacity-60 sm:min-h-0"
            >
              Pricing
            </Link>
            <Link
              to="/faq"
              className="inline-flex min-h-11 items-center text-[0.875rem] transition-opacity duration-150 hover:opacity-60 sm:min-h-0"
            >
              Questions
            </Link>
            <Link
              to="/"
              className="inline-flex min-h-11 items-center rounded-[10px] bg-ink px-4 text-[0.875rem] font-medium text-paper transition-opacity duration-150 hover:opacity-90 sm:min-h-9"
            >
              Download
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[76rem] px-6 py-16 lg:py-24">
        {/* The h1 is the query, near enough word for word. See above. */}
        <h1 className="max-w-[24ch] font-display text-[clamp(2rem,4.6vw,3.5rem)] leading-[0.96] tracking-[-0.04em]">
          {guide.title}
        </h1>

        <p className="ink-muted mt-6 max-w-[62ch] text-[1.0625rem] leading-relaxed">
          {guide.intro}
        </p>

        <h2 className="mt-16 font-display text-[clamp(1.5rem,2.8vw,2rem)] leading-tight tracking-[-0.035em]">
          The four ways, worst to best
        </h2>

        <ol className="mt-8 space-y-10">
          {guide.steps.map((step, i) => (
            <Step key={step.title} n={i + 1} title={step.title}>
              {step.body.map((paragraph) => (
                <p key={paragraph.slice(0, 24)}>{paragraph}</p>
              ))}
            </Step>
          ))}
        </ol>

        {/* The download sits at the end. Three of the four answers are free. */}
        <div className="mt-20 max-w-[62ch] rounded-[16px] border border-ink/12 bg-ink/[0.03] p-8">
          <h2 className="font-display text-[1.5rem] leading-tight tracking-[-0.035em]">
            If you do this more than once a week
          </h2>
          <p className="mt-3 text-[1rem] leading-relaxed text-ink/70">
            Sidq is free for five handovers a week, with no card. It reads
            ChatGPT, Claude, Gemini, Grok and DeepSeek in your own browser, and
            Claude Code, Cursor, Windsurf and VS Code straight off the disk,
            including everything you did before you installed it.
          </p>
          <div className="mt-6">
            <DownloadButton />
          </div>
          <p className="mt-3 text-[0.8125rem] text-ink/50">
            Mac app. Free, no card, about a minute to set up.
          </p>
        </div>

        <p className="mt-12 text-[0.875rem] text-ink/50">
          More questions:{" "}
          <Link to="/faq" className={cn("underline underline-offset-4", "hover:opacity-60")}>
            how Sidq reads each assistant
          </Link>{" "}
          &middot;{" "}
          <Link to="/pricing" className={cn("underline underline-offset-4", "hover:opacity-60")}>
            what it costs
          </Link>
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}

/**
 * One component for every generated guide, picking its content by path.
 *
 * Renders nothing for a path with no guide rather than throwing. The route
 * table and `GUIDES` come from the same array so that cannot happen in the app,
 * and a blank page is a better failure than a crashed one if it ever does.
 */
export function PairGuide() {
  const guide = guideFor(useLocation().pathname);
  if (!guide) return null;
  return <GuidePage guide={guide} />;
}
