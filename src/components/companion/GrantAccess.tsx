import { useEffect, useState } from 'react';
import { desktopBridge } from '@/lib/onboarding/bridge';
import { cn } from '@/lib/cn';

/*
 * The one permission Sidq asks for.
 *
 * It is what makes the product work with nothing installed. Assistants that run
 * in a browser write nothing readable to disk, and the alternatives were both
 * worse: a store extension with a developer-mode install, or opening them
 * inside Sidq's own window, where passkeys and password managers do not work.
 *
 * ── Saying exactly what it does ──────────────────────────────────────────────
 * Accessibility is the scariest thing macOS can grant and the prompt says so.
 * The honest answer to that is not reassurance, it is specificity: the list of
 * applications, the fact that a tab has to be an assistant before a single
 * character is read, and that nothing leaves the machine. All three are
 * enforced in code and tested, so they are claims that can be checked rather
 * than promises.
 *
 * ── And it goes green on its own ─────────────────────────────────────────────
 * The permission is granted in another application, so the person comes back
 * with no idea whether it worked. Polling means nobody has to wonder, which is
 * the thing that makes people abandon a permission they already granted.
 */

/** Fast enough to feel immediate when they come back from System Settings. */
const POLL_MS = 1500;

export function GrantAccess({ compact = false }: { compact?: boolean }) {
  const [bridge] = useState(() => desktopBridge());
  const [granted, setGranted] = useState<boolean | null>(null);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    if (!bridge) return;

    const check = () => void bridge.accessibilityGranted().then(setGranted);
    check();
    const timer = setInterval(check, POLL_MS);
    return () => clearInterval(timer);
  }, [bridge]);

  if (granted) {
    return (
      <div className={cn('rounded-[12px] border border-[#B8A6FF]/25 bg-[#B8A6FF]/[0.06] p-4', compact && 'p-3')}>
        <p className="flex items-center gap-2 text-[0.875rem] font-medium text-white">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-[#B8A6FF]" />
          Reading your assistants
        </p>
        <p className="mt-1.5 max-w-[52ch] text-[0.8125rem] leading-relaxed text-white/45">
          ChatGPT, Claude, Gemini and the rest, in whichever browser you already use. Nothing
          to install and nothing to sign in to.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-[12px] border border-white/[0.09] bg-white/[0.02] p-4', compact && 'p-3')}>
      <p className="flex items-center gap-2 text-[0.875rem] font-medium text-white">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-400/70" />
        Let Sidq read your assistants
      </p>
      <p className="mt-1.5 max-w-[54ch] text-[0.8125rem] leading-relaxed text-white/45">
        Assistants that run in a browser keep nothing readable on this Mac, so Sidq reads them
        from the window instead. One switch, and every one of them works at once.
      </p>

      {/*
        * The limits, stated before the ask rather than after it.
        *
        * macOS is about to warn that this permission is powerful, and it is
        * right. Answering that with specifics is the only thing that earns it.
        */}
      <ul className="mt-3 space-y-1.5 text-[0.8125rem] text-white/45">
        <li>
          <span className="text-white/70">Only assistants.</span> Nine applications, and only
          tabs that are ChatGPT, Claude, Gemini, Perplexity, Grok, DeepSeek or Mistral
        </li>
        <li>
          <span className="text-white/70">Nothing else, ever.</span> Any other window is never
          looked at, which is enforced in code rather than promised
        </li>
        <li>
          <span className="text-white/70">Nothing leaves.</span> It is read into an index on
          this Mac and never uploaded
        </li>
      </ul>

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            void bridge?.requestAccessibility();
            setAsked(true);
          }}
          className={cn(
            'rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium',
            'bg-[#B8A6FF] text-[#141319] transition-opacity duration-150',
            'cursor-pointer hover:opacity-90',
          )}
        >
          Turn it on
        </button>
        {/* People dismiss the prompt. Without this there is no way back to the
            switch short of being told where it lives. */}
        {asked && (
          <button
            onClick={() => void bridge?.openAccessibilitySettings()}
            className="text-[0.8125rem] text-white/40 underline-offset-4 transition-colors duration-150 hover:text-white/75 hover:underline"
          >
            Open System Settings
          </button>
        )}
        <span className="text-[0.75rem] text-white/30">
          {granted === null ? 'Checking' : 'This turns green on its own.'}
        </span>
      </div>
    </div>
  );
}
