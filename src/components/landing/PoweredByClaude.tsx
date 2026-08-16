import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

/*
 * "Remembers every Claude / Cursor / ChatGPT / Gemini conversation", rotating.
 *
 * Free bold text, no pill, no container. A badge reads as a sponsor slot; plain
 * type reads as a fact.
 *
 * ── Why it rotates, and why that is the actual product ────────────────────────
 * This is not a logo flex. Your work is scattered across three assistants and
 * none of them know the others exist: you debugged something in Claude Code,
 * asked ChatGPT about the same error, checked docs in Gemini. Three separate
 * memories, and you are the only thing joining them up.
 *
 * No vendor can fix that, because no vendor can read a competitor's history.
 * Something running on your machine can. That is the line the rotation is
 * making, and it is why all three appear rather than whichever we happen to
 * call.
 *
 * ── On the marks ──────────────────────────────────────────────────────────────
 * Official assets, unmodified except for swapping `1em` dimensions for `100%`
 * so the CSS class can size them inside an <img>, and pinning OpenAI's
 * `currentColor` to black since there is no inheriting context in an image.
 * None of them is ever redrawn: an approximated trademark is a wrong trademark.
 *
 * ── On the wording ────────────────────────────────────────────────────────────
 * Not "Powered by". That phrasing says the assistants run Sidq, which is both
 * untrue and the precise accusation the product has to survive: that it is a
 * wrapper. Nothing here is powered by them. It reads what they already wrote to
 * this machine, which is the opposite relationship and the actual selling point.
 *
 * Not "Sidq × Claude" either. The × convention claims a partnership, and there
 * is none with any of them.
 *
 * "Remembers" is deliberately close to the line. It says plainly that Sidq holds
 * your conversations, because pretending otherwise while doing exactly that is
 * worse than saying it. The line underneath is what keeps it the right side of
 * the line: it never leaves this Mac, so the sentence describes a filing cabinet
 * you own rather than a company watching you.
 */

interface Model {
  name: string;
  logo: string;
  /** The brand colour, used on the word so it reads even before the mark loads. */
  colour: string;
}

/*
 * Claude first and Cursor second, because those two are read with nothing to
 * set up. ChatGPT and Gemini stay in the rotation because people do use them and
 * Sidq does read them, but they need an export, so leading with either would be
 * advertising the slowest path into the product.
 */
const MODELS: Model[] = [
  { name: 'Claude', logo: '/claude-logo.svg', colour: '#D97757' },
  { name: 'Cursor', logo: '', colour: '#E5E5E5' },
  { name: 'ChatGPT', logo: '/openai-logo.svg', colour: '#10A37F' },
  { name: 'Gemini', logo: '/gemini-logo.svg', colour: '#3186FF' },
];

/** Sits under the rotating line and is what makes it not sound like surveillance. */
const LOCALITY_NOTE = 'Every word stays on this Mac';

/** Long enough to read twice, short enough to notice it changed. */
const ROTATE_MS = 3200;
/** Matches the CSS transition below, so the swap lands while it is invisible. */
const FADE_MS = 260;

export function PoweredByClaude({
  tone = 'light',
  className,
}: {
  /** 'light' sits on the dark hero sky; 'dark' on the pale surfaces. */
  tone?: 'light' | 'dark';
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [missing, setMissing] = useState<Record<string, boolean>>({});

  /*
   * Fade out, swap, fade in.
   *
   * Crossfading two absolutely positioned copies would avoid the pause but also
   * means measuring and reserving the width of the longest name, and a badge
   * that reflows the headline every three seconds is far worse than a beat of
   * nothing.
   */
  useEffect(() => {
    // Nothing to rotate through, and nothing to animate.
    if (MODELS.length < 2) return;

    const id = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % MODELS.length);
        setVisible(true);
      }, FADE_MS);
    }, ROTATE_MS);

    return () => window.clearInterval(id);
  }, []);

  const model = MODELS[index];
  const light = tone === 'light';

  /*
   * No longer a link to anthropic.com. That was right for "Powered by Claude",
   * which was an attribution. This is a claim about what Sidq holds, and sending
   * someone to Anthropic to read about it would be misdirection.
   */
  return (
    <div
      aria-label="Sidq remembers your conversations with Claude, Cursor, ChatGPT and Gemini, stored only on this Mac"
      className={cn('inline-flex flex-col items-center gap-1', className)}
    >
      <span
        className={cn(
          'inline-flex items-center gap-2.5 text-[1.0625rem] font-semibold tracking-[-0.01em]',
          'transition-opacity',
          light ? 'text-white/70' : 'text-ink/60',
        )}
        style={{ opacity: visible ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
      >
        {model.logo && !missing[model.logo] && (
          <img
            src={model.logo}
            alt=""
            aria-hidden="true"
            width={30}
            height={30}
            className="size-[1.875rem] shrink-0"
            // Hidden silently if absent. A broken-image icon beside a brand name
            // is worse than the wordmark standing alone.
            onError={() => setMissing((m) => ({ ...m, [model.logo]: true }))}
          />
        )}
        <span>
          Remembers every <span style={{ color: model.colour }}>{model.name}</span> conversation
        </span>
      </span>

      {/* The sentence above is a strong claim. This is the one that makes it safe. */}
      <span
        className={cn(
          'text-[0.75rem] tracking-[-0.005em]',
          light ? 'text-white/40' : 'text-ink/40',
        )}
      >
        {LOCALITY_NOTE}
      </span>
    </div>
  );
}
