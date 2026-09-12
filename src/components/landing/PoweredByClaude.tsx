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
  /*
   * The same brand, lightened for the sky.
   *
   * These wordmarks were picked against the old purple zenith. On the blue they
   * fall apart: ChatGPT's teal measures 3.13:1, Gemini's blue 2.85 and
   * DeepSeek's 2.31, all against a 4.5:1 requirement at thirteen pixels — a
   * blue wordmark on a blue sky was never going to work.
   *
   * Lifted toward white by the least amount that clears the bar, so the hue is
   * still recognisably theirs. Absent where the original already passes.
   */
  onSky?: string;
  /**
   * A one-colour mark, drawn in the text's colour rather than its own.
   *
   * OpenAI ships theirs as `fill="#000000"` and xAI ships theirs as
   * `currentColor`, which inside an `<img>` resolves to the file's own default,
   * also black. Both were invisible on the dark hero and the dark setup screen:
   * a 26 point hole where a logo should be.
   *
   * A mask takes the colour of the text beside it, which is what a monochrome
   * mark is supposed to do anyway. The full-colour ones stay images.
   */
  mono?: true;
}

/*
 * Claude first and Cursor second, because those two are read with nothing to
 * set up. ChatGPT and Gemini stay in the rotation because people do use them and
 * Sidq does read them, but they need an export, so leading with either would be
 * advertising the slowest path into the product.
 */
const MODELS: Model[] = [
  { name: 'ChatGPT', logo: '/openai-logo.svg', colour: '#10A37F', onSky: '#5CC0A8', mono: true },
  { name: 'Claude', logo: '/claude-logo.svg', colour: '#D97757', onSky: '#E49D86' },
  { name: 'Gemini', logo: '/gemini-logo.svg', colour: '#3186FF', onSky: '#7BB2FF' },
  { name: 'Cursor', logo: '', colour: '#E5E5E5' },
  { name: 'DeepSeek', logo: '', colour: '#4D6BFE', onSky: '#98A9FE' },
  { name: 'Grok', logo: '/grok-logo.svg', colour: '#E5E5E5', mono: true },
  { name: 'Copilot', logo: '/copilot-logo.svg', colour: '#8B7BF7', onSky: '#B0A5FA' },
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

  const light = tone === 'light';

  /*
   * No longer a link to anthropic.com. That was right for "Powered by Claude",
   * which was an attribution. This is a claim about what Sidq holds, and sending
   * someone to Anthropic to read about it would be misdirection.
   */
  return (
    <div
      aria-label="Sidq reads your conversations with ChatGPT, Claude, Gemini, Cursor and every other AI, stored only on this Mac"
      /*
        * `@container` here, and `w-full` so it measures the column rather than
        * its own contents. A container that is sized by what is inside it
        * cannot constrain what is inside it.
        */
      className={cn('@container flex w-full flex-col items-center gap-1', className)}
    >
      <span
        className={cn(
          /*
           * One line, always, and sized by the column it is in.
           *
           * It wrapped once, and the wrap put "and every other one" on a line
           * of its own under the logo, which read as two claims colliding
           * rather than one sentence. `whitespace-nowrap` fixed that and
           * introduced the opposite fault: it cannot wrap, so anywhere too
           * narrow it runs off the edge instead. Setup is where that showed —
           * "and every" cut off mid-word against the panel edge.
           *
           * The size steps were part of it, because `sm:` and `lg:` measure the
           * *window*, not the column: on a wide screen with a narrow column —
           * exactly setup's two-pane layout — the widest step won and there was
           * nowhere for it to go. They are container queries now.
           *
           * But no size fixes it. Measured across the window widths setup
           * actually opens at, the column is 266 to 384 points and the sentence
           * is 355 even at the smallest step, so `nowrap` clips at anything
           * under about 1200. Refusing to wrap was the wrong rule; it just
           * moved the damage from a bad wrap to a cut-off word.
           *
           * So it wraps when it has to and holds one line when it fits. What
           * made the original wrap look broken was never the wrap — it was the
           * second half being rendered in a colour that could not be read on
           * that background, so it looked like two claims on top of each other
           * rather than one sentence continuing.
           */
          'inline-flex items-center gap-2.5 font-semibold @[26rem]:whitespace-nowrap',
          'tracking-[-0.01em] text-[0.8125rem] @[30rem]:text-[0.9375rem] @[38rem]:text-[1.0625rem]',
          'transition-opacity',
          light ? 'text-white/70' : 'text-ink/60',
        )}
      >
        {/*
          * ── Only the assistant changes ────────────────────────────────────
          *
          * The whole sentence used to carry the opacity transition, so every
          * two seconds the claim itself blinked out and back. The words are
          * the constant here and the assistant is the variable, so now only
          * the mark and the name cross-fade and the sentence never moves.
          *
          * Both live in a grid with every name stacked in the same cell. The
          * cell is therefore as wide as the longest name and nothing after it
          * shifts when a short one is showing — without that, "conversations"
          * slid left and right on a two second clock, which is the exact
          * twitchiness this was meant to remove.
          */}
        <span className="grid shrink-0 place-items-center">
          {MODELS.map((m, i) => (
            <span
              key={m.name}
              aria-hidden="true"
              className="col-start-1 row-start-1 transition-opacity"
              style={{
                opacity: i === index && visible ? 1 : 0,
                transitionDuration: `${FADE_MS}ms`,
              }}
            >
              {m.logo && m.mono && !missing[m.logo] && (
                <span
                  className="block size-[1.4em]"
                  style={{
                    backgroundColor: 'currentColor',
                    maskImage: `url(${m.logo})`,
                    WebkitMaskImage: `url(${m.logo})`,
                    maskSize: 'contain',
                    WebkitMaskSize: 'contain',
                    maskRepeat: 'no-repeat',
                    WebkitMaskRepeat: 'no-repeat',
                    maskPosition: 'center',
                    WebkitMaskPosition: 'center',
                  }}
                />
              )}
              {m.logo && !m.mono && !missing[m.logo] && (
                <img
                  src={m.logo}
                  alt=""
                  width={26}
                  height={26}
                  className="block size-[1.4em]"
                  onError={() => setMissing((x) => ({ ...x, [m.logo]: true }))}
                />
              )}
            </span>
          ))}
        </span>

        <span>
          Reads your{' '}
          {/*
            * Centred, not left-aligned. The cell is as wide as the longest
            * name so that "conversations" cannot slide about on a two second
            * clock, which means every shorter name leaves slack. Against the
            * left edge that slack is a hole after the word and reads as a
            * typo; split either side of a centred name it reads as spacing.
            */}
          <span className="inline-grid justify-items-center align-bottom">
            {MODELS.map((m, i) => (
              <span
                key={m.name}
                className="col-start-1 row-start-1 font-medium transition-opacity"
                style={{
                  color: (light && m.onSky) || m.colour,
                  opacity: i === index && visible ? 1 : 0,
                  transitionDuration: `${FADE_MS}ms`,
                }}
              >
                {m.name}
              </span>
            ))}
          </span>{' '}
          conversations
          {/*
            * Follows the tone like everything else here.
            *
            * This was `text-ink/35` whatever the surface was, so on the dark
            * onboarding panel it was near-black on near-black: the clause was
            * there, took up a line, and could not be read.
            */}
          {/*
              * 35% measured 2.55:1 on the blue sky at thirteen pixels, against a
              * 4.5:1 requirement — the same failure this comment was already
              * describing, reintroduced by changing the ground underneath it.
              * The clause is subordinate, which is a job for weight and size
              * rather than for making it unreadable.
              */}
            <span className={light ? 'text-white/70' : 'text-ink/55'}>
            {' '}
            and every other one
          </span>
        </span>
      </span>

      {/* The sentence above is a strong claim. This is the one that makes it safe. */}
      <span
        className={cn(
          'text-[0.75rem] tracking-[-0.005em]',
          /*
             * 40% was calibrated against the old purple zenith. On the blue sky
             * this measures 2.87:1 at twelve pixels, where body text owes
             * 4.5:1 — a legibility failure rather than a soft one.
             */
            light ? 'text-white/80' : 'text-ink/55',
        )}
      >
        {LOCALITY_NOTE}
      </span>
    </div>
  );
}
