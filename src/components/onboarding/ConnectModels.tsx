import { useState } from 'react';
import { GrantAccess } from '@/components/companion/GrantAccess';
import { PrimaryAction } from '@/components/onboarding/Shell';
import { cn } from '@/lib/cn';

/*
 * Connecting the assistants, early in setup.
 *
 * Two different things are happening on this screen and conflating them would be
 * the easy mistake. Some assistants keep their history on this Mac and are
 * already readable before anybody clicks anything. The web ones keep nothing
 * here, so they need one macOS permission.
 *
 * So the screen states the first group as already done, with the real number of
 * conversations found, and asks for the permission only for the second. Claiming
 * a connection that has not happened is the one thing that would make the rest
 * of the privacy copy unbelievable.
 *
 * The rotating "Sidq connects to…" line that opened this screen is gone. The
 * film beside it ticks off the same assistants from the person's own disk,
 * which says it better and asks nobody to read anything.
 */

/** The assistants that live in a browser, named on the way past. */
const WEB = ['ChatGPT', 'Gemini', 'Claude.ai', 'Grok', 'DeepSeek'];

export interface ConnectModelsProps {
  found: number;
  onContinue: () => void;
}

export function ConnectModels({ found, onContinue }: ConnectModelsProps) {
  const [granted, setGranted] = useState(false);

  return (
    <div>
      {found > 0 && (
        <p className="mb-6 border-y border-ink/10 py-4 text-[0.9375rem] leading-relaxed text-ink/60">
          <span className="font-medium text-ink">
            {found.toLocaleString()} {found === 1 ? 'conversation' : 'conversations'} already found
          </span>{' '}
          on this Mac. Claude Code, Cursor and Codex need no setup at all.
        </p>
      )}

      {/*
       * ── No browser trip ───────────────────────────────────────────────────
       *
       * This used to open a tab, and the page it opened explained how to
       * install a browser extension. Neither is needed: the AIs that run in a
       * browser are read through one macOS permission, granted right here.
       */}
      <GrantAccess compact onGranted={setGranted} />

      <div className="mt-6">
        {granted ? (
          <PrimaryAction label="Continue" onClick={onContinue} />
        ) : (
          <button
            onClick={onContinue}
            className={cn(
              'text-left text-[0.8125rem] text-ink/45 underline-offset-4',
              'cursor-pointer transition-colors duration-150 hover:text-ink hover:underline',
            )}
          >
            Skip for now. {WEB.join(', ')} will not be read
          </button>
        )}
      </div>
    </div>
  );
}
