import { useEffect, useState } from 'react';
import { desktopBridge } from '@/lib/onboarding/bridge';
import { cn } from '@/lib/cn';

/*
 * The one permission Sidq asks for.
 *
 * It is what makes the product work with nothing installed. AIs that run in a
 * browser write nothing readable to disk, and the alternatives were both worse:
 * a store extension with a developer-mode install, or opening them inside
 * Sidq's own window, where passkeys and password managers do not work.
 *
 * ── Saying exactly what it does ──────────────────────────────────────────────
 * Accessibility is the scariest thing macOS can grant and the prompt says so.
 * The honest answer to that is not reassurance, it is specificity: the list of
 * applications, the fact that a tab has to be an AI before a single character
 * is read, and that nothing leaves the machine. All three are enforced in code
 * and tested, so they are claims that can be checked rather than promises.
 *
 * ── And it goes green on its own ─────────────────────────────────────────────
 * The permission is granted in another application, so the person comes back
 * with no idea whether it worked. Polling means nobody has to wonder, which is
 * the thing that makes people abandon a permission they already granted.
 *
 * ── Why it takes a surface ───────────────────────────────────────────────────
 * It appears on the dark setup window and on the light app window. It was
 * written for the dark one, then repainted for the light one, at which point it
 * was a white card sitting in the middle of a black screen. Both surfaces are
 * real, so both are a parameter.
 */

/** Fast enough to feel immediate when they come back from System Settings. */
const POLL_MS = 1500;

export function GrantAccess({
  compact = false,
  surface = 'light',
  onGranted,
}: {
  compact?: boolean;
  /** The surface underneath: 'light' is the app window, 'dark' is setup. */
  surface?: 'light' | 'dark';
  /**
   * Told on every check, not only on the change.
   *
   * Setup uses it to decide whether Continue is the main thing on the screen or
   * the quiet way past it, and that has to be right on first paint rather than
   * one poll later.
   */
  onGranted?: (granted: boolean) => void;
}) {
  const [bridge] = useState(() => desktopBridge());
  const [granted, setGranted] = useState<boolean | null>(null);
  const [asked, setAsked] = useState(false);

  const dark = surface === 'dark';

  useEffect(() => {
    if (!bridge) return;

    const check = () =>
      void bridge.accessibilityGranted().then((yes) => {
        setGranted(yes);
        onGranted?.(yes);
      });

    check();
    const timer = setInterval(check, POLL_MS);
    return () => clearInterval(timer);
    // `onGranted` is a fresh closure on every render of the parent and would
    // restart the poll on each one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge]);

  if (granted) {
    return (
      <div
        className={cn(
          'rounded-[12px] border p-4',
          compact && 'p-3',
          dark ? 'border-[#B8A6FF]/25 bg-[#B8A6FF]/[0.08]' : 'border-[#B8A6FF]/45 bg-[#F5F1FF]',
        )}
      >
        <p
          className={cn(
            'flex items-center gap-2 text-[0.875rem] font-medium',
            dark ? 'text-white' : 'text-[#16141C]',
          )}
        >
          <span
            aria-hidden="true"
            className={cn('size-1.5 rounded-full', dark ? 'bg-[#B8A6FF]' : 'bg-[#6A4BEA]')}
          />
          Reading your AIs
        </p>
        <p
          className={cn(
            'mt-1.5 max-w-[52ch] text-[0.8125rem] leading-relaxed',
            dark ? 'text-white/55' : 'text-[#57516A]',
          )}
        >
          ChatGPT, Claude, Gemini and the rest, in whichever browser you already use. Nothing
          to install and nothing to sign in to.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-[12px] border p-4',
        compact && 'p-3',
        dark ? 'border-white/[0.10] bg-white/[0.03]' : 'border-black/[0.11] bg-[#FAF9FD]',
      )}
    >
      <p
        className={cn(
          'flex items-center gap-2 text-[0.875rem] font-medium',
          dark ? 'text-white' : 'text-[#16141C]',
        )}
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-400/80" />
        Let Sidq read your AIs
      </p>
      <p
        className={cn(
          'mt-1.5 max-w-[54ch] text-[0.8125rem] leading-relaxed',
          dark ? 'text-white/55' : 'text-[#57516A]',
        )}
      >
        ChatGPT, Gemini, Claude.ai, Perplexity and Grok keep nothing readable on this Mac, so
        Sidq reads them from the window instead. One switch, and every one of them works at
        once. Without it, Sidq only sees the AIs that write to disk.
      </p>

      {/*
        * The limits, stated before the ask rather than after it.
        *
        * macOS is about to warn that this permission is powerful, and it is
        * right. Answering that with specifics is the only thing that earns it.
        */}
      <ul
        className={cn(
          'mt-3 space-y-1.5 text-[0.8125rem]',
          dark ? 'text-white/55' : 'text-[#57516A]',
        )}
      >
        <li>
          <span className={dark ? 'text-white/85' : 'text-[#16141C]/70'}>Only AIs.</span> Nine
          applications, and only tabs that are ChatGPT, Claude, Gemini, Perplexity, Grok,
          DeepSeek or Mistral
        </li>
        <li>
          <span className={dark ? 'text-white/85' : 'text-[#16141C]/70'}>Nothing else, ever.</span>{' '}
          Any other window is never looked at, which is enforced in code rather than promised
        </li>
        <li>
          <span className={dark ? 'text-white/85' : 'text-[#16141C]/70'}>Nothing leaves.</span> It
          is read into an index on this Mac and never uploaded
        </li>
      </ul>

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            void bridge?.requestAccessibility();
            setAsked(true);
          }}
          className={cn(
            'rounded-lg px-3.5 py-2 text-[0.8125rem] font-medium',
            'cursor-pointer transition-opacity duration-150 hover:opacity-90',
            dark ? 'bg-[#B8A6FF] text-[#141319]' : 'bg-[#16141C] text-white',
          )}
        >
          Turn it on
        </button>
        {/* People dismiss the prompt. Without this there is no way back to the
            switch short of being told where it lives. */}
        {asked && (
          <button
            onClick={() => void bridge?.openAccessibilitySettings()}
            className={cn(
              'text-[0.8125rem] underline-offset-4 transition-colors duration-150 hover:underline',
              dark ? 'text-white/45 hover:text-white/75' : 'text-[#7A7489] hover:text-[#16141C]/75',
            )}
          >
            Open System Settings
          </button>
        )}
        <span className={cn('text-[0.75rem]', dark ? 'text-white/35' : 'text-[#8E8899]')}>
          {granted === null ? 'Checking' : 'This turns green on its own.'}
        </span>
      </div>
    </div>
  );
}
