import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

/*
 * "Powered by Claude / ChatGPT / Gemini", rotating.
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
 * "Powered by", not "Sidq × Claude". The × convention means a collaboration
 * between two parties and there is no partnership with any of them.
 */

interface Model {
  name: string;
  logo: string;
  /** The brand colour, used on the word so it reads even before the mark loads. */
  colour: string;
}

const MODELS: Model[] = [
  { name: 'Claude', logo: '/claude-logo.svg', colour: '#D97757' },
  { name: 'ChatGPT', logo: '/openai-logo.svg', colour: '#10A37F' },
  { name: 'Gemini', logo: '/gemini-logo.svg', colour: '#3186FF' },
];

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

  return (
    <a
      href="https://www.anthropic.com/claude"
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Sidq reads your work across Claude, ChatGPT and Gemini"
      className={cn(
        'inline-flex items-center gap-2.5 text-[1.0625rem] font-semibold tracking-[-0.01em]',
        'transition-opacity duration-200 hover:opacity-75',
        light ? 'text-white/70' : 'text-ink/60',
        className,
      )}
    >
      <span
        className="inline-flex items-center gap-2.5 transition-opacity"
        style={{ opacity: visible ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
      >
        {!missing[model.logo] && (
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
          Powered by <span style={{ color: model.colour }}>{model.name}</span>
        </span>
      </span>
    </a>
  );
}
