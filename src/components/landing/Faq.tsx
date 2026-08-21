import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { entitlementsFor } from '@/lib/entitlements';

/*
 * The numbers come from the code, never from memory.
 *
 * This page advertised ten rebuilds a week and two hours of companion while the
 * server enforced three and ninety minutes. Nobody noticed because a paragraph
 * of prose has nothing checking it. Interpolating the real values means the
 * claim cannot drift from the product again.
 */
const FREE = entitlementsFor('free');

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

const FAQS = [
  {
    q: 'What does it actually do?',
    a: 'You are in the middle of something with one assistant and you want to carry it to another, because that one is better at this part, or you have run out, or you simply prefer it. Normally you re-explain everything and get a worse version of what you already had. Sidq puts the entire conversation into the new one, word for word, from a single keystroke.',
  },
  {
    q: 'Which assistants does it work with?',
    a: 'Claude Code, Cowork, Cursor, Windsurf and VS Code are read straight off this Mac with nothing to connect and nothing to set up, including everything you did before you installed Sidq. ChatGPT, Claude, Gemini and the rest run in a browser and keep nothing readable on your computer, so those are read by the Sidq extension while the tab is open. Nothing is uploaded either way: the extension hands the text to the app over your own machine\u2019s loopback address, which cannot leave it.',
  },
  {
    q: 'I only installed it today. Is it empty until I build up history?',
    a: 'No, and this is the part people expect to be worse than it is. Sidq reads what is already on your Mac, so a conversation from two months ago is there the first time you open it. Nothing has to accumulate.',
  },
  {
    q: 'Why not just ask the AI to summarise the chat and paste that?',
    a: 'Because a summary is the thing you lose. It keeps the conclusions and throws away the corrections, the ideas you rejected, the way you actually talk. The next assistant reads about your work instead of having been there, and you spend the next twenty minutes fixing its assumptions. Sidq hands over the conversation itself, not a description of it.',
  },
  {
    q: 'Does any of this leave my Mac?',
    a: 'No. Your conversations are read from your own disk and go to your own clipboard. Nothing is uploaded and it works with the wifi off. An account is needed to set Sidq up, so your history and subscription follow you to a new machine, but your conversations are never part of it. A conversation is only ever read when you pick it yourself, never on a timer and never in the background.',
  },
  {
    q: 'What can it see on my screen?',
    a: 'Nothing. Sidq does not read your screen, take screenshots, record, or watch which app you have open. It reads the conversation files your assistants already write to your Mac, and only when you pick one. An earlier version watched window titles to notice when you drifted off a task; that went with the rest of the planner.',
  },
  {
    q: 'Is this just a wrapper around a chatbot?',
    a: 'No, and the honest test is that most of it does not call a model at all. Finding what is worth resuming, reading the transcript and handing it over are file operations on your machine. That is why it is instant, why it costs nothing to run, and why it works offline.',
  },
  {
    q: 'What do I get for free?',
    a: `${FREE.handoffsPerWeek} handovers a week and ${FREE.sources} assistant connected, with your full history and complete transcripts. Nothing is behind a padlock, you simply run out. People upgrade when they start doing this every day, which is the point at which one connected assistant stops being enough.`,
  },
  {
    q: 'Is there a web version?',
    a: 'No. Sidq is a Mac app and only a Mac app, because everything it does depends on being on the machine your conversations are already stored on. A browser tab cannot read them, so shipping one would mean selling a different and much worse product under the same name.',
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="mx-auto max-w-[64rem] px-6 py-24" aria-labelledby="faq">
      <h2
        id="faq"
        className="font-display text-[clamp(2rem,4.6vw,3.5rem)] leading-[0.96] tracking-[-0.04em]"
      >
        Frequently asked questions
      </h2>

      <dl className="mt-12 border-t border-ink/12">
        {FAQS.map((item, i) => {
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
                      'size-5 shrink-0 ink-muted transition-transform duration-300 ease-(--ease-out-expo)',
                      isOpen && 'rotate-180',
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
                  'grid transition-[grid-template-rows,opacity] duration-300 ease-(--ease-out-expo)',
                  isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                )}
              >
                <div className="overflow-hidden">
                  <p className="max-w-[62ch] pb-6 text-[0.9375rem] leading-relaxed ink-muted">
                    {item.a}
                  </p>
                </div>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
