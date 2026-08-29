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
         * ── Written twice on purpose ─────────────────────────────────────────
         *
         * `waitlist.platform` has a check constraint listing the values that
         * existed when the table was made: windows, linux, unknown. Sending
         * 'phone' before that constraint is widened fails the insert, and the
         * only thing anybody would see is the form saying it did not work — on
         * mobile, which is the surface this whole change exists for.
         *
         * So the better value is tried first and the safe one is the fallback.
         * `23514` is a check violation and `42501` covers a policy refusing the
         * row; either means the column will not take 'phone' yet. Once the
         * migration in `0009_waitlist_phone.sql` is applied the first attempt
         * simply succeeds and this never runs.
         *
         * The alternative was shipping the code and the migration together and
         * remembering to apply one before the other. That is a coordination
         * step, and a coordination step that fails silently on the busiest page
         * is not worth the tidiness.
         */
        const record = (as: string) =>
          supabase.from('waitlist').insert({ email: email.trim().toLowerCase(), platform: as });

        const wanted =
          platform === 'linux'
            ? 'linux'
            : platform === 'windows'
              ? 'windows'
              : platform === 'phone'
                ? 'phone'
                : 'unknown';

        void record(wanted).then(async ({ error }) => {
          // A duplicate is somebody pressing twice, which is impatience rather
          // than a failure, so it counts as done.
          if (!error || error.code === '23505') {
            setState('done');
            return;
          }

          if (wanted === 'phone' && (error.code === '23514' || error.code === '42501')) {
            const { error: second } = await record('unknown');
            setState(!second || second.code === '23505' ? 'done' : 'failed');
            return;
          }

          setState('failed');
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
