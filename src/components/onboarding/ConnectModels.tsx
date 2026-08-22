import { useEffect, useState } from 'react';
import { GrantAccess } from '@/components/companion/GrantAccess';
import { PrimaryAction } from '@/components/onboarding/Shell';
import { cn } from '@/lib/cn';

/*
 * Connecting the assistants, early in setup.
 *
 * Two different things are happening on this screen and conflating them would be
 * the easy mistake. Some assistants keep their history on this Mac and are
 * already readable before anybody clicks anything. The web ones keep nothing
 * here, so they need the browser extension.
 *
 * So the screen shows the first group as already done, with the real number of
 * conversations found, and offers the browser trip only for the second. Claiming
 * a connection that has not happened is the one thing that would make the rest
 * of the privacy copy unbelievable.
 */

/** How long a name stays up. Long enough to read twice. */
const ROTATE_MS = 2600;
const FADE_MS = 240;

interface Assistant {
  name: string;
  logo?: string;
  colour: string;
  /** Readable from disk with no setup, or needs the browser. */
  local: boolean;
}

const ASSISTANTS: Assistant[] = [
  { name: 'Claude Code', logo: '/claude-logo.svg', colour: '#D97757', local: true },
  { name: 'Cursor', colour: '#E5E5E5', local: true },
  { name: 'ChatGPT', logo: '/openai-logo.svg', colour: '#10A37F', local: false },
  { name: 'Gemini', logo: '/gemini-logo.svg', colour: '#3186FF', local: false },
  { name: 'Perplexity', logo: '/perplexity-logo.svg', colour: '#22B8CD', local: false },
  { name: 'Grok', logo: '/grok-logo.svg', colour: '#E5E5E5', local: false },
  { name: 'Copilot', logo: '/copilot-logo.svg', colour: '#8B7BF7', local: false },
];

export interface ConnectModelsProps {
  /** Conversations actually found on this machine. Never a guess. */
  found: number;
  /** Move on. There is nothing here that can fail, so there is nothing to skip. */
  onContinue: () => void;
}

export function ConnectModels({ found, onContinue }: ConnectModelsProps) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % ASSISTANTS.length);
        setVisible(true);
      }, FADE_MS);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  const current = ASSISTANTS[index];
  const web = ASSISTANTS.filter((a) => !a.local);

  return (
    <div>
      {/* ── The rotation ─────────────────────────────────────────────────── */}
      <div className="flex min-h-[2.25rem] items-center gap-2.5">
        <span
          className="inline-flex items-center gap-2.5 text-[1.0625rem] font-semibold tracking-[-0.01em] text-white/80 transition-opacity"
          style={{ opacity: visible ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
        >
          {current.logo && (
            <img
              src={current.logo}
              alt=""
              aria-hidden="true"
              width={26}
              height={26}
              className="size-[1.625rem] shrink-0"
            />
          )}
          <span>
            Sidq connects to <span style={{ color: current.colour }}>{current.name}</span>
          </span>
        </span>
      </div>

      {/*
       * The count, which is the whole argument for this screen.
       *
       * Somebody who has installed Sidq sixty seconds ago expects it to be
       * empty. Showing real conversations it has already found, before they
       * connected anything, is more convincing than any sentence here could be.
       */}
      {found > 0 && (
        <p className="mt-6 rounded-[12px] border border-white/[0.08] bg-white/[0.02] p-4 text-[0.875rem] leading-relaxed text-white/60">
          <span className="text-white">
            {found} {found === 1 ? 'conversation' : 'conversations'} already found
          </span>{' '}
          on this Mac, going back as far as your history does. Claude Code and Cursor need
          no setup at all.
        </p>
      )}

      {/*
       * ── No browser trip ───────────────────────────────────────────────────
       *
       * This used to open a tab, and the page it opened explained how to
       * install a browser extension. Neither is needed: the AIs that run in a
       * browser are read through one macOS permission, granted right here.
       * Sending somebody out of the app to read instructions for a thing they
       * no longer have to do was three clicks of pure friction.
       */}
      <div className="mt-6">
        <GrantAccess compact />
      </div>

      <p className="mt-3 text-[0.8125rem] leading-relaxed text-white/40">
        {web.map((a) => a.name).join(', ')} keep nothing readable on your Mac, so Sidq reads
        them from the window instead, in whichever browser you already use.
      </p>

      <div className="mt-6">
        <PrimaryAction label="Continue" onClick={onContinue} />
      </div>

    </div>
  );
}

/** The right-hand pane: what is connected, and what each one gives up. */
export function ConnectModelsPreview({ found }: { found: number }) {
  return (
    <div className="w-full max-w-[26rem] space-y-2">
      {ASSISTANTS.map((a) => (
        <div
          key={a.name}
          className={cn(
            'flex items-center gap-3 rounded-[12px] px-4 py-3',
            'bg-white/[0.03] ring-1 ring-inset ring-white/[0.06]',
          )}
        >
          {a.logo ? (
            <img src={a.logo} alt="" aria-hidden="true" width={22} height={22} className="size-[1.375rem] shrink-0" />
          ) : (
            <span
              aria-hidden="true"
              className="size-[1.375rem] shrink-0 rounded-[6px]"
              style={{ backgroundColor: a.colour, opacity: 0.9 }}
            />
          )}
          <span className="flex-1 text-[0.875rem] text-white/80">{a.name}</span>
          <span
            className={cn(
              'text-[0.6875rem]',
              a.local ? 'text-[#B8A6FF]' : 'text-white/30',
            )}
          >
            {a.local ? (found > 0 ? 'Connected' : 'No setup needed') : 'Via browser'}
          </span>
        </div>
      ))}
    </div>
  );
}
