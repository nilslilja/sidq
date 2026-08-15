import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { entitlementsFor } from '@/lib/entitlements';
import { DEFAULT_NUDGE_POLICY as NUDGE } from '@/lib/focus-engine';

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
 * what it can see, whether it is another wrapper, what the free plan really is.
 *
 * Written to be read by someone deciding, not by a search engine. Every answer
 * that could be "yes, but" is written as the plain answer first.
 */

const FAQS = [
  {
    q: 'What can it actually see on my screen?',
    a: 'The name of the app in front of you and the title of its window. That is all. No screenshots, no screen recording, no vision model, no camera, no microphone. It is read on your machine and never uploaded, which is also why it is instant and works with the wifi off.',
  },
  {
    q: 'Is this just a wrapper around a chatbot?',
    a: 'No. The part that matters is the calibration engine, and it runs on your own history rather than a model: which block sizes you finish, how many tasks you really close in a day, when your good hours are, what you have quietly carried for a week. A model writes the words. Your data decides the plan, and it gets better the longer you use it, which is not something a wrapper can do.',
  },
  {
    q: 'What do I get for free?',
    a: `The whole product, metered. ${FREE.rebuildsPerWeek} plan rebuilds a week and ${FREE.companionMinutesPerDay} minutes of the companion a day, plus the last ${FREE.historyDays} days of history. Nothing is behind a padlock, you simply run out. Most people who upgrade do it because they hit the meter on a good week, not because a feature was hidden.`,
  },
  {
    q: 'How is it different from a to-do list?',
    a: 'A to-do list is a place you put things. It has no opinion, it never gets shorter, and it never tells you that eleven tasks was never going to happen. Sidq starts from what you have actually completed before and refuses to write a day you have never once managed.',
  },
  {
    q: 'Does it nag me?',
    a: `It is built to be reluctant. It watches ${NUDGE.samplesBeforeNudge} consecutive samples before saying anything, waits ${NUDGE.cooldownMinutes} minutes between anything it does say, and stays quiet unless it is fairly confident. One line, then it stops. An overlay that talks too much gets quit in a week, and a quit overlay is worth nothing.`,
  },
  {
    q: 'Do I have to install the desktop app?',
    a: 'No, the web app works on its own. But the parts nobody else has, noticing you drifted, catching a thought from inside another app, seeing where the day actually went, only exist because something is on your screen while you work. A browser tab cannot see Figma.',
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
