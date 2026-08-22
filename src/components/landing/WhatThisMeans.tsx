import { cn } from '@/lib/cn';

/*
 * The argument, below the fold.
 *
 * It used to be two paragraphs in the hero, one of them fifty words, competing
 * with the download button for the second and a half somebody spends deciding
 * whether to keep scrolling. Nothing was cut; it moved here, where the reader
 * has already chosen to care and will actually read a sentence.
 *
 * Three beats, in the order the case is made: the absurdity everybody has
 * accepted, the workaround that cannot work, and the number that explains why.
 */

const BEATS: { count: string; label: string; body: string }[] = [
  {
    count: '4',
    label: 'assistants, no introductions',
    body: 'Most people now pay for three or four. Not one of them can read another. You explain your project to the first, then explain it again to the second, and again on Monday to both.',
  },
  {
    count: '1',
    label: 'summary, and the detail is gone',
    body: 'Want a second opinion, which is the entire reason to keep a second model? All you can hand it is a paste. So what comes back is an opinion on your summary rather than on your problem.',
  },
  {
    count: '44%',
    label: 'you were never shown',
    body: 'And the summary was never going to work anyway. Your assistant writes its reasoning to your own disk, renders none of it, and forgets it after the turn. You cannot summarise what you never saw.',
  },
];

export function WhatThisMeans({ className }: { className?: string }) {
  return (
    <section aria-labelledby="what-this-means" className={cn('mx-auto max-w-[68rem] px-6', className)}>
      <h2
        id="what-this-means"
        className="mx-auto max-w-[24ch] text-center font-display text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.05] tracking-[-0.035em]"
      >
        Four subscriptions. Four systems that have never met.
      </h2>

      <p className="mx-auto mt-5 max-w-[52ch] text-center text-[1.0625rem] leading-relaxed ink-muted">
        Everybody accepted this. It is the most obvious gap in the most impressive
        technology of the decade, and it is sitting on your own hard drive.
      </p>

      <ol className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-8">
        {BEATS.map((beat) => (
          <li key={beat.label}>
            {/* The number carries the weight; the sentence explains it. Reading
                only the three numerals should still make the argument. */}
            <p className="font-display text-[clamp(2.5rem,4.4vw,3.5rem)] leading-none tracking-[-0.04em] text-accent">
              {beat.count}
            </p>
            <p className="mt-3 text-[0.9375rem] font-medium">{beat.label}</p>
            <p className="mt-2.5 text-[0.9375rem] leading-relaxed ink-muted">{beat.body}</p>
          </li>
        ))}
      </ol>

      <p className="mx-auto mt-14 max-w-[54ch] text-center text-[1.0625rem] leading-relaxed">
        Sidq reads the conversations already on your Mac and carries any one of them into any
        other assistant, whole. Word for word, including the half you were never shown.{' '}
        <span className="ink-muted">Nothing is uploaded. It fetches nothing.</span>
      </p>
    </section>
  );
}
