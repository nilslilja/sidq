import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { INVITE, entitlementsFor } from "@/lib/entitlements";

/*
 * The numbers come from the code, never from memory.
 *
 * This page advertised ten rebuilds a week and two hours of companion while the
 * server enforced three and ninety minutes. Nobody noticed because a paragraph
 * of prose has nothing checking it. Interpolating the real values means the
 * claim cannot drift from the product again.
 */
const FREE = entitlementsFor("free");

/*
 * FAQ.
 *
 * Answers the objections that actually stop a download, in the order they occur:
 * what it does, what it reads, whether anything leaves the machine, and why a
 * summary is not the same thing.
 *
 * Written to be read by someone deciding, not by a search engine. Every answer
 * that could be "yes, but" is written as the plain answer first.
 */

export const FAQS = [
  {
    q: "What does it actually do?",
    a: [
      "It keeps a memory of each thing you are working on, and gives it to whichever AI you open. Not a folder of chats — a record: what the project opened with, what you decided along the way, what you already tried and ruled out, where it got to yesterday. Built from your own sentences across every assistant you use, with the number of conversations each line came from printed beside it.",
      "So you stop being the one carrying the context. You press one key and the AI in front of you knows the project, including the parts you worked out three weeks ago in a different assistant you have since stopped paying for.",
      "It also hands over any single conversation, word for word, when that is what you want. It drops the greetings and the ok-thanks, and if the conversation is bigger than the window it is going into it carries what matters and names what it left, in the file, where the next AI reads it. Nothing is ever summarised.",
    ],
  },
  {
    q: "Which AIs does it work with?",
    a: [
      "Two kinds, and neither asks you to remember anything.",
      "The ones that keep their conversations on your Mac — Claude Code, Cowork, Cursor, Windsurf, VS Code — are read with nothing to connect and nothing to set up, including everything you did before you installed Sidq.",
      "The ones that live in a browser — ChatGPT, Claude, Gemini, Grok, DeepSeek — keep nothing readable on your computer. So you use them in your own browser, exactly as you do now, already signed in with your passkeys and password manager working, and Sidq reads them as you go. It never asks you to log in to an AI. For what you said in them before today, each one lets you download your history, and Sidq reads the file.",
      "Nothing is uploaded either way. The reading happens between two programs on your own Mac, on a connection that cannot leave it.",
    ],
  },
  {
    q: "I only installed it today. Is it empty until I build up history?",
    a: "No, and this is the part people expect to be worse than it is. Sidq reads what is already on your Mac, so a conversation from two months ago is there the first time you open it. Nothing has to accumulate.",
  },
  {
    q: "Why not just ask the AI to summarise the chat and paste that?",
    a: "Because a summary is the thing you lose. It keeps the conclusions and throws away the corrections, the ideas you rejected, the way you actually talk. The next AI reads about your work instead of having been there, and you spend the next twenty minutes fixing its assumptions. Sidq hands over the conversation itself, not a description of it.",
  },
  {
    q: "Does any of this leave my Mac?",
    a: "No. Your conversations are read from your own disk and go to your own clipboard. Nothing is uploaded and it works with the wifi off. An account is needed to set Sidq up, so your history and subscription follow you to a new machine, but your conversations are never part of it. Sidq does read your transcripts in the background, about every ninety seconds, to keep search working, and it skips any conversation that has not changed since it last looked. That index is a file on your Mac. It is never uploaded, and deleting Sidq deletes it.",
  },
  {
    q: "What can it see on my screen?",
    a: "Nothing. Sidq does not read your screen, take screenshots, record, or watch which app you have open. It reads the conversation files your AIs already write to your Mac, and only when you pick one. An earlier version watched window titles to notice when you drifted off a task; that went with the rest of the planner.",
  },
  {
    q: "What does Duo actually share between two people?",
    a: [
      'Two things automatically, and one only when you say so. The automatic ones are standing instructions and nothing else: the lines on your "How you work" tab are sentences you have typed to assistants more than once — how you want things done, what stack you are on, the conventions you keep repeating. Those are shared with the people you work with, so every handover any of you makes arrives knowing how the team works and not just how one of you does.',
      "The one you choose is a project: its memory — what it started as, what was decided, what was ruled out — published to the team as a Markdown file you can read in full first. Somebody joining picks up months of decisions without booking time with the person who made them. Nothing goes until you press the button on that project, nothing is on a timer, and no conversation of yours is shared because a folder was set up once.",
      "It works through a folder you already sync, whether that is iCloud Drive, Dropbox or a git repo. Sidq writes its file there and reads the ones your teammates wrote. It still uploads nothing and still opens no connection, which also means it works between people in different countries rather than two laptops on one wifi.",
    ],
  },
  {
    q: "Is this just a wrapper around a chatbot?",
    a: "No, and the honest test is that most of it does not call a model at all. Finding what is worth resuming, reading the transcript and handing it over are file operations on your machine. That is why it is instant, why it costs nothing to run, and why it works offline.",
  },
  {
    q: "What do I get for free?",
    /*
     * This said "and 1 AI connected", which was wrong twice.
     *
     * Nothing has ever enforced a source limit — entitlement.rs caps handovers
     * and the history window, and that is all — so it was a paid boundary that
     * did not exist. And it contradicted the product: Sidq reads every AI on
     * the Mac with no connecting step at all, which is the whole pitch.
     */
    a: `${FREE.handoffsPerWeek} handovers a week, and every AI on your Mac read with nothing to connect. Search reaches back ${FREE.historyDays} days on free and all the way on Pro. Nothing is behind a padlock, you simply run out. Inviting a friend adds ${INVITE.bonusPerWeek} more a week to both of you for ${INVITE.lastsDays} days, up to ${INVITE.perWeek} friends a week. That is the other way past it.`,
  },
  {
    q: "Is there a web version?",
    a: "No. Sidq is a Mac app and only a Mac app, because everything it does depends on being on the machine your conversations are already stored on. A browser tab cannot read them, so shipping one would mean selling a different and much worse product under the same name.",
  },
];

/*
 * `limit` is what keeps the landing page short.
 *
 * All ten of these belong on /faq, where somebody has gone looking. On the
 * landing they were the longest thing on the page by a wide margin — more words
 * than everything above them put together — for a free Mac app most people
 * install rather than research. The first few answer the questions that decide
 * it; the rest are one click away.
 */
/*
 * The heading level is a prop because this component has two homes.
 *
 * On the landing page it is a section under the hero's h1 and must be an h2.
 * On its own route it is the top of the document, and shipping an h2 there
 * left /pricing and /faq with no h1 at all — a hierarchy starting at level two,
 * which is the first thing an on-page audit flags and the strongest signal on
 * the page simply absent.
 */
export function Faq({ limit, top = false }: { limit?: number; top?: boolean } = {}) {
  const Heading = top ? "h1" : "h2";
  const [open, setOpen] = useState<number | null>(0);
  const shown = limit ? FAQS.slice(0, limit) : FAQS;

  return (
    <section className="mx-auto max-w-[64rem] px-6 py-24" aria-labelledby="faq">
      <Heading
        id="faq"
        className="scroll-mt-24 font-display text-[clamp(2rem,4.6vw,3.5rem)] leading-[0.96] tracking-[-0.04em]"
      >
        The questions people actually ask
      </Heading>

      <dl className="mt-12 border-t border-ink/12">
        {shown.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={item.q} className="border-b border-ink/12">
              <dt>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex min-h-[4.5rem] w-full items-center justify-between gap-6 py-5 text-left"
                >
                  <span className="text-[clamp(1rem,1.6vw,1.1875rem)] font-medium leading-snug">
                    {item.q}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      "size-5 shrink-0 ink-muted transition-transform duration-300 ease-(--ease-out-expo)",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
              </dt>

              {/*
               * Grid-rows trick rather than max-height. A max-height guess is
               * either too small, which clips the long answers here, or far too
               * large, which makes the close animation visibly lag.
               */}
              <dd
                className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-300 ease-(--ease-out-expo)",
                  isOpen
                    ? "grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0",
                )}
              >
                {/*
                 * Answers may be several paragraphs.
                 *
                 * The longest one here ran to a hundred and seventy-five words
                 * in a single block, which is where an answer goes to not be
                 * read. Nothing about it was wrong; it was just a wall.
                 */}
                <div className="space-y-3.5 overflow-hidden pb-6">
                  {(Array.isArray(item.a) ? item.a : [item.a]).map((para) => (
                    <p
                      key={para}
                      className="max-w-[62ch] text-[0.9375rem] leading-relaxed ink-muted"
                    >
                      {para}
                    </p>
                  ))}
                </div>
              </dd>
            </div>
          );
        })}
      </dl>

      {/* Only when some were held back. On /faq this would point at itself. */}
      {limit && limit < FAQS.length && (
        <Link
          to="/faq"
          className="mt-10 inline-flex items-center gap-1.5 text-[0.9375rem] font-medium transition-opacity duration-150 hover:opacity-60"
        >
          The other {FAQS.length - limit} questions
          <span aria-hidden="true">&rarr;</span>
        </Link>
      )}
    </section>
  );
}
