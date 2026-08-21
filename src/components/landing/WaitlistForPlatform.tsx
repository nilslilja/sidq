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

  // Mac visitors have a button; there is nothing to wait for.
  if (platform.startsWith('macos')) return null;

  const name = platform === 'windows' ? 'Windows' : platform === 'linux' ? 'Linux' : 'your machine';

  if (state === 'done') {
    return (
      <p className="mt-6 border-t border-ink/10 pt-5 text-[0.875rem] leading-relaxed ink-muted">
        Noted. You get one email, the day the {name} build exists, and nothing else.
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
        void supabase
          .from('waitlist')
          .insert({ email: email.trim().toLowerCase(), platform: platform === 'linux' ? 'linux' : platform === 'windows' ? 'windows' : 'unknown' })
          .then(({ error }) => {
            /*
             * A duplicate is a success from where the person is standing.
             *
             * They asked to be told, they are on the list, and the fact that
             * they were already on it is our bookkeeping, not their problem.
             */
            setState(!error || error.code === '23505' ? 'done' : 'failed');
          });
      }}
      className="mt-6 border-t border-ink/10 pt-5"
    >
      <label htmlFor="waitlist-email" className="block text-[0.875rem] leading-relaxed">
        Sidq is a Mac app today. The {name} build does not exist yet, and it will not be
        announced until it does.
      </label>
      <div className="mt-3 flex gap-2">
        <input
          id="waitlist-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@work.com"
          autoComplete="email"
          className={cn(
            'min-h-11 min-w-0 flex-1 rounded-full border border-ink/15 bg-transparent px-4',
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
