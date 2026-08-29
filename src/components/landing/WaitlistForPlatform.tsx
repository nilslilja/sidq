import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import type { Platform } from '@/lib/platform';
import { cn } from '@/lib/cn';

/*
 * For everyone who is not on a Mac.
 *
 * This replaces two download buttons that pointed at files nobody ever built,
 * with sizes nobody ever measured. A person on Windows clicked "Download for
 * Windows" and got a 404 — the worst possible first impression, because it
 * arrives after they have already decided they want the thing.
 *
 * Now they are told before they click, and asked whether they want to know when
 * it exists. The answer goes in a table, and that count is what decides whether
 * porting is worth several weeks.
 */

type State = 'asking' | 'saving' | 'done' | 'failed';

export function WaitlistForPlatform({ platform }: { platform: Platform }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('asking');

  // Mac visitors have a working button; there is nothing to wait for.
  if (platform.startsWith('macos')) return null;

  const name = platform === 'windows' ? 'Windows' : platform === 'linux' ? 'Linux' : 'your machine';

  /*
   * A phone is waiting for nothing. Sidq exists, on a machine they very likely
   * already own — it is simply not the one they are reading this on. So the
   * ask is different in kind: not "tell me when it is ready" but "send me the
   * link so I can do this at my desk", which is the whole conversion path for
   * anybody arriving from a post.
   */
  const onAPhone = platform === 'phone';

  if (state === 'done') {
    return (
      <p className="mt-6 border-t border-ink/10 pt-5 text-[0.875rem] leading-relaxed ink-muted">
        {onAPhone
          ? 'Got it. I send these myself, so it lands within a few hours rather than instantly.'
          : `Noted. You get one email, the day the ${name} build exists, and nothing else.`}
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const supabase = getSupabase();
        if (!supabase) {
          setState('failed');
          return;
        }

        setState('saving');

        /*
         * ── One call that records the address and sends the mail ─────────────
         *
         * It used to insert straight into the table from here, which is why
         * nothing was ever sent: there was nothing on the other side to send
         * it. Doing it here would have meant a public endpoint whose job is
         * "email whatever address I give you", which is a spam relay.
         *
         * So the function does both, with the service role, and mails only the
         * address it just recorded. Nothing here can be pointed at a stranger.
         *
         * The check constraint fallback that used to live here is gone with it.
         * The function decides what the column will accept, in the same place
         * that writes to it.
         */
        const wanted =
          platform === 'linux'
            ? 'linux'
            : platform === 'windows'
              ? 'windows'
              : platform === 'phone'
                ? 'phone'
                : 'unknown';

        void supabase.functions
          .invoke('send-link', { body: { email: email.trim().toLowerCase(), platform: wanted } })
          .then(({ error }) => {
            /*
             * Saved and sent are reported separately by the function, and this
             * only cares about the first. If the address is recorded, the
             * person has done their part and the mail is our problem: it gets
             * sent by hand off the back of the log.
             */
            setState(error ? 'failed' : 'done');
          });
      }}
      className="mt-6 border-t border-ink/10 pt-5"
    >
      <label htmlFor="waitlist-email" className="block text-[0.875rem] leading-relaxed">
        {onAPhone ? (
          <>
            You are on a phone, and Sidq is a Mac app. Leave your email and I will send you
            the link, so it is waiting when you are back at your Mac.
          </>
        ) : (
          <>
            Sidq is a Mac app today. The {name} build does not exist yet, and it will not be
            announced until it does.
          </>
        )}
      </label>
      <div className="mt-3 flex gap-2">
        <input
          id="waitlist-email"
          /*
           * ── Where the CTA actually lands ────────────────────────────────
           *
           * "Send me the link" pointed at the section heading, and measured on
           * a 812 point screen that put this field at y=810 — one point of it
           * visible, below the fold, after a button that promised to do the
           * thing. The margin scrolls it to somewhere with the sentence
           * explaining it still on screen above.
           */
          ref={(el) => {
            if (!el) return;
            // Arriving by the anchor means they pressed a button that said it
            // would take their email, so the keyboard opens ready for it.
            if (window.location.hash === '#waitlist-email') {
              requestAnimationFrame(() => el.focus({ preventScroll: true }));
            }
          }}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@work.com"
          autoComplete="email"
          className={cn(
            'min-h-11 min-w-0 flex-1 scroll-mt-32 rounded-full border border-ink/15 bg-transparent px-4',
            'text-[0.875rem] placeholder:text-ink/30',
            'focus:border-accent focus:outline-none',
          )}
        />
        <button
          type="submit"
          disabled={state === 'saving'}
          className={cn(
            'btn-soft min-h-11 shrink-0 rounded-full px-5 text-[0.875rem] font-medium',
            'disabled:opacity-50',
          )}
        >
          {state === 'saving' ? 'Saving…' : 'Tell me'}
        </button>
      </div>
      {state === 'failed' && (
        // Says what went wrong rather than "something went wrong", because the
        // person can act on one of these and not the other.
        <p className="mt-2.5 text-[0.8125rem] text-red-700">
          That did not save. Check the address, or try again in a moment.
        </p>
      )}
    </form>
  );
}
