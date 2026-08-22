import { useEffect, useState } from 'react';
import { desktopBridge } from '@/lib/onboarding/bridge';
import { cn } from '@/lib/cn';

/*
 * Getting the extension installed, without a document.
 *
 * The instructions for this lived in a markdown file the founder was expected
 * to relay. That is not a product. Anything a person has to be told out of band
 * is a step most of them will not complete, and this one sits between them and
 * half of what Sidq does.
 *
 * ── Why the status matters more than the steps ───────────────────────────────
 * The steps are easy. What makes people abandon an install is finishing it and
 * not knowing whether it worked, then going back to check, then giving up. So
 * the app watches for the extension itself and turns green on its own the
 * moment it speaks. Nobody has to wonder and nobody has to come back.
 *
 * ── Why it is not a blocker ──────────────────────────────────────────────────
 * Everything on this Mac is already being read without it. The extension only
 * adds assistants that run in a browser, and the screen says so, because
 * somebody who thinks the product is broken until they finish an install will
 * leave before they see it work.
 */

/** How often to look. Fast enough to feel live, slow enough to be free. */
const POLL_MS = 2500;

/** Under this, the extension is talking to us now rather than once, weeks ago. */
const FRESH_SECONDS = 60 * 60 * 24 * 7;

type Status = { connected: boolean; secondsAgo: number | null };

export function ConnectExtension({ compact = false }: { compact?: boolean }) {
  const [bridge] = useState(() => desktopBridge());
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    if (!bridge) return;

    const check = () => void bridge.extensionStatus().then(setStatus);
    check();
    const timer = setInterval(check, POLL_MS);
    return () => clearInterval(timer);
  }, [bridge]);

  const live =
    status?.connected && (status.secondsAgo === null || status.secondsAgo < FRESH_SECONDS);

  if (live) {
    return (
      <div
        className={cn(
          'rounded-[12px] border border-[#B8A6FF]/25 bg-[#B8A6FF]/[0.06] p-4',
          compact && 'p-3',
        )}
      >
        <p className="flex items-center gap-2 text-[0.875rem] font-medium text-white">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-[#B8A6FF]" />
          Extension connected
        </p>
        <p className="mt-1.5 max-w-[52ch] text-[0.8125rem] leading-relaxed text-white/45">
          Anything you do in ChatGPT, Claude, Gemini and the rest is read as it happens. There
          is nothing else to set up.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-[12px] border border-white/[0.09] bg-white/[0.02] p-4', compact && 'p-3')}>
      <p className="flex items-center gap-2 text-[0.875rem] font-medium text-white">
        {/* Amber, not red. Nothing is broken; something is simply not added yet. */}
        <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-400/70" />
        Add the browser extension
      </p>
      <p className="mt-1.5 max-w-[54ch] text-[0.8125rem] leading-relaxed text-white/45">
        Optional. Everything on this Mac is already being read. This adds the assistants that
        run in a browser, so what you do in ChatGPT and the rest is read too.
      </p>

      <ol className="mt-3 space-y-1.5 text-[0.8125rem] text-white/55">
        <li>
          <span className="text-white/30">1.</span> Download it, then unzip it
        </li>
        <li>
          <span className="text-white/30">2.</span> Open Chrome and go to{' '}
          <code className="text-white/70">chrome://extensions</code>
        </li>
        <li>
          <span className="text-white/30">3.</span> Turn on{' '}
          <span className="text-white/70">Developer mode</span>, top right
        </li>
        <li>
          <span className="text-white/30">4.</span> Click{' '}
          <span className="text-white/70">Load unpacked</span> and pick the folder
        </li>
      </ol>

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void bridge?.downloadExtension()}
          className={cn(
            'rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium',
            'bg-[#B8A6FF] text-[#141319] transition-opacity duration-150',
            'cursor-pointer hover:opacity-90',
          )}
        >
          Download the extension
        </button>
        <span className="text-[0.75rem] text-white/30">
          {status === null ? 'Checking' : 'Watching for it. This turns green on its own.'}
        </span>
      </div>

      <p className="mt-3 text-[0.75rem] leading-relaxed text-white/25">
        Developer mode is only needed while the Chrome Web Store review is running. Once it is
        approved this becomes a single click, and your install carries over.
      </p>
    </div>
  );
}
