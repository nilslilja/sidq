import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/*
 * The whole loop, played out, once per beat.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * "We know for sure what to do at this point. But new users won't have a clue."
 * That is right, and it is the one thing setup could not fix by explaining
 * harder: the loop crosses three applications — an assistant in a browser, a
 * bar that floats over everything, and a file in Downloads — and no screen can
 * show all three at once with words.
 *
 * So it is shown. Five beats, on a loop, with the sentence for each beat
 * underneath. Somebody who watches it twice has seen the entire product.
 *
 * ── Why it is drawn rather than filmed ───────────────────────────────────────
 * A screen recording of this would be ten megabytes inside a four-megabyte app,
 * would be wrong the first time any of these sites changed colour, and could
 * not be read at this size. Drawn, it is a few kilobytes, it scales, and it can
 * carry the same glass the site uses instead of a scaled-down screenshot.
 *
 * ── Motion rules ─────────────────────────────────────────────────────────────
 * Transform and opacity only, so it stays on the compositor next to a live
 * accessibility sweep. Everything stops under prefers-reduced-motion: the beats
 * still advance, the easing just stops sliding things around, which is the
 * difference between explaining something and making somebody seasick.
 */

const BEATS = [
  {
    title: 'Open the chat you want',
    body: 'Not a new one. The conversation you actually want to carry over, in whichever AI it lives in.',
  },
  {
    title: 'Flick it to the top once',
    body: 'A browser only loads the recent part of a long conversation. Scroll up and the rest loads, and Sidq reads it within seconds.',
  },
  {
    title: 'Leave it there a few seconds',
    body: 'Sidq reads it from the window while you look at it. Nothing to click, nothing to sign into.',
  },
  {
    title: 'It tells you when it has it',
    body: 'A short tone and a notification naming the conversation. You do not need to click the notification.',
  },
  {
    title: 'Press ⌘⇧K and pick it',
    body: 'The bar opens over whatever you are in. Filter by which AI it came from, then choose the conversation.',
  },
  {
    title: 'Drop the file into any other AI',
    body: 'It lands in Downloads as one Markdown file. Attach it anywhere and that AI carries on where you stopped.',
  },
] as const;

/** Long enough to read the line under it without the loop feeling stuck. */
const BEAT_MS = 4200;

export function HowItGoes() {
  const [beat, setBeat] = useState(0);
  const still = useRef(false);

  /*
   * Restarted on every beat, including one somebody clicked to.
   *
   * A single interval running independently means a manual choice gets a
   * fraction of a beat before the loop moves on, which reads as the thing
   * ignoring you. Keyed on `beat`, every step gets its full time from the
   * moment it appears, whoever asked for it.
   */
  useEffect(() => {
    still.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const timer = setTimeout(() => setBeat((n) => (n + 1) % BEATS.length), BEAT_MS);
    return () => clearTimeout(timer);
  }, [beat]);

  const at = (n: number) => beat === n;
  const from = (n: number) => beat >= n;

  return (
    <div className="flex w-full max-w-[30rem] flex-col items-center">
      {/* ── The stage ──────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className={cn(
          'relative aspect-[4/3] w-full overflow-hidden rounded-[18px]',
          'bg-[radial-gradient(120%_100%_at_50%_0%,#2A2440_0%,#14121D_55%,#0B0B10_100%)]',
          'ring-1 ring-inset ring-white/[0.08]',
        )}
      >
        {/* The bar, floating above everything, the way the real one does. */}
        <div
          className={cn(
            'absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-1.5',
            'rounded-b-[7px] bg-black/35 px-2.5 py-1 backdrop-blur-md',
            'transition-[transform,opacity] duration-500 ease-out',
            from(1) ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0',
          )}
        >
          <span
            className={cn(
              'size-1 rounded-full bg-lilac',
              at(2) && !still.current && 'animate-pulse-once',
            )}
          />
          <span className="text-[7px] leading-none text-white/70">
            {at(2) ? 'Saved · ChatGPT' : at(3) || at(4) ? '24' : 'Sidq'}
          </span>
        </div>

        {/* ── Beat 1 and 2: the assistant, being read ───────────────────── */}
        <div
          className={cn(
            'absolute inset-x-7 top-9 rounded-[10px] bg-[#17151F] p-3',
            'ring-1 ring-inset ring-white/[0.07] shadow-[0_16px_40px_-20px_rgba(0,0,0,0.9)]',
            'transition-[transform,opacity] duration-500 ease-out',
            from(3) ? 'translate-y-1 scale-[0.97] opacity-30' : 'translate-y-0 scale-100 opacity-100',
          )}
        >
          <div className="flex items-center gap-1">
            <span className="size-1 rounded-full bg-white/20" />
            <span className="size-1 rounded-full bg-white/20" />
            <span className="ml-1.5 text-[6px] text-white/35">chatgpt.com/c/…</span>
          </div>
          <div className="mt-2.5 space-y-1.5">
            {[
              { w: '52%', me: true },
              { w: '88%', me: false },
              { w: '70%', me: false },
              { w: '40%', me: true },
              { w: '80%', me: false },
            ].map((line, i) => (
              <div
                key={i}
                className={cn('flex', line.me ? 'justify-end' : 'justify-start')}
              >
                <span
                  style={{ width: line.w, transitionDelay: `${i * 55}ms` }}
                  className={cn(
                    'h-1.5 rounded-full transition-colors duration-500',
                    line.me ? 'bg-[#6A4BEA]/60' : 'bg-white/[0.13]',
                    // Beat 2 is the read: every line lights, in order.
                    at(1) && (line.me ? 'bg-[#8B6BFF]/80' : 'bg-white/25'),
                  )}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Beat 3: the notification ──────────────────────────────────── */}
        <div
          className={cn(
            'absolute right-3 top-11 z-30 w-[46%] rounded-[9px] p-2',
            // The same glass as the site's Dock: blurred backdrop, white wash,
            // a lit top edge and a darker one underneath.
            'bg-white/[0.13] backdrop-blur-xl backdrop-brightness-125 ring-1 ring-inset ring-white/20',
            'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4),0_10px_30px_-12px_rgba(0,0,0,0.8)]',
            'transition-[transform,opacity] duration-500 ease-out',
            at(2) ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0',
          )}
        >
          <p className="text-[6.5px] font-medium leading-tight text-white">
            New chat from ChatGPT saved
          </p>
          <p className="mt-0.5 truncate text-[6px] leading-tight text-white/55">
            Raw Milk in Carrefour
          </p>
        </div>

        {/* ── Beat 4: the picker ────────────────────────────────────────── */}
        <div
          className={cn(
            'absolute inset-x-9 top-12 z-20 rounded-[10px] p-2.5',
            'bg-[#171520]/90 backdrop-blur-xl ring-1 ring-inset ring-white/[0.10]',
            'shadow-[0_22px_50px_-22px_rgba(0,0,0,0.95)]',
            'transition-[transform,opacity] duration-500 ease-out',
            at(3) ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-2 scale-[0.97] opacity-0',
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[6.5px] text-white/45">Pick up where you stopped</span>
            <span className="rounded-[3px] bg-white/[0.09] px-1 py-px text-[5.5px] text-white/60">
              ChatGPT ▾
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {['Raw Milk in Carrefour', 'Pricing page copy', 'Refund policy wording'].map(
              (row, i) => (
                <div
                  key={row}
                  className={cn(
                    'flex items-center gap-1.5 rounded-[5px] px-1.5 py-1',
                    i === 0 ? 'bg-white/[0.07]' : 'bg-transparent',
                  )}
                >
                  <span
                    className={cn(
                      'size-1 rounded-full',
                      i === 0 ? 'bg-lilac' : 'bg-white/20',
                    )}
                  />
                  <span
                    className={cn(
                      'text-[6px] leading-none',
                      i === 0 ? 'text-white' : 'text-white/40',
                    )}
                  >
                    {row}
                  </span>
                </div>
              ),
            )}
          </div>
        </div>

        {/* ── Beat 5: the file, and where it goes ───────────────────────── */}
        <div
          className={cn(
            'absolute inset-x-0 bottom-6 z-20 flex items-center justify-center gap-2',
            'transition-[transform,opacity] duration-500 ease-out',
            at(4) ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
          )}
        >
          <span
            className={cn(
              'rounded-[6px] bg-white/[0.10] px-2 py-1 text-[6px] text-white/85',
              'ring-1 ring-inset ring-white/15 backdrop-blur-md',
            )}
          >
            Raw-Milk-in-Carrefour.md
          </span>
          <span className="text-[7px] text-white/30">→</span>
          {['Claude', 'Gemini', 'Grok'].map((name) => (
            <span
              key={name}
              className="rounded-[6px] bg-white/[0.05] px-1.5 py-1 text-[6px] text-white/45 ring-1 ring-inset ring-white/[0.08]"
            >
              {name}
            </span>
          ))}
        </div>

        {/* The keystroke, called out on the beat that needs it. */}
        <span
          className={cn(
            'absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-[5px] px-1.5 py-0.5',
            'bg-white/[0.10] font-mono text-[6.5px] text-white/80 ring-1 ring-inset ring-white/15',
            'transition-opacity duration-300',
            at(3) ? 'opacity-100' : 'opacity-0',
          )}
        >
          ⌘⇧K
        </span>
      </div>

      {/* ── The sentence for this beat ─────────────────────────────────── */}
      <div className="mt-6 min-h-[4.5rem] w-full text-center">
        <p key={`t${beat}`} className="animate-rise text-[0.9375rem] font-medium text-white">
          {BEATS[beat].title}
        </p>
        <p
          key={`b${beat}`}
          className="animate-rise mx-auto mt-1.5 max-w-[34ch] text-[0.8125rem] leading-relaxed text-white/50"
          style={{ animationDelay: '60ms' }}
        >
          {BEATS[beat].body}
        </p>
      </div>

      {/* Where you are, and a way to go straight to a beat. */}
      <div className="mt-4 flex items-center gap-1.5">
        {BEATS.map((b, i) => (
          <button
            key={b.title}
            onClick={() => setBeat(i)}
            aria-label={b.title}
            className={cn(
              'h-1 rounded-full transition-[width,background-color] duration-300',
              'cursor-pointer',
              i === beat ? 'w-5 bg-lilac' : 'w-1.5 bg-white/20 hover:bg-white/40',
            )}
          />
        ))}
      </div>
    </div>
  );
}
