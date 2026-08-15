import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { listMyCoaches, setShareScope, leaveCoach, type MyCoach } from '@/lib/coach-store';
import { SHARE_SCOPE_LABELS, SHARE_SCOPE_DETAIL, type ShareScope } from '@/lib/coaching';
import { Loader } from '@/components/ui/loader';
import { cn } from '@/lib/cn';

/*
 * The client's control over their own data.
 *
 * Reachable at any time, never buried, and it takes one tap to cut a coach off
 * entirely. The whole privacy claim rests on this being real and easy: a promise
 * that is three menus deep is not a promise.
 */

const ORDER: ShareScope[] = ['signals', 'signals-and-titles', 'paused'];

export function Sharing() {
  const [coaches, setCoaches] = useState<MyCoach[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCoaches(await listMyCoaches());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your sharing settings.');
      setCoaches([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const choose = async (linkId: string, scope: ShareScope) => {
    setSaving(linkId);
    // Optimistic: this control must feel instant or it does not feel like control.
    setCoaches((cur) => cur?.map((c) => (c.linkId === linkId ? { ...c, shareScope: scope } : c)) ?? null);
    try {
      await setShareScope(linkId, scope);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save.');
      await load();
    } finally {
      setSaving(null);
    }
  };

  const disconnect = async (linkId: string) => {
    setSaving(linkId);
    try {
      await leaveCoach(linkId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect.');
    } finally {
      setSaving(null);
    }
  };

  if (coaches === null) {
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        <Loader statuses={['Loading your settings']} />
      </div>
    );
  }

  return (
    <div className="column min-h-[100dvh] py-10">
      <Link
        to="/today"
        className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-muted transition-colors duration-(--duration-fast) hover:text-text"
      >
        <ArrowLeft className="size-4" />
        Today
      </Link>

      <h1 className="mt-8 font-display text-[2.5rem] leading-[1.02]">Who can see your days</h1>

      {coaches.length === 0 ? (
        <p className="mt-4 max-w-[40ch] text-[0.9375rem] leading-relaxed text-muted">
          Nobody. Your days are yours alone. If a coach sends you their link, you will be shown
          exactly what they would see before anything is shared.
        </p>
      ) : (
        <p className="mt-4 max-w-[42ch] text-[0.9375rem] leading-relaxed text-muted">
          You choose what leaves your account, and you can change it any time. They see exactly
          this and nothing more.
        </p>
      )}

      <div className="mt-10 grid gap-6">
        {coaches.map((coach) => (
          <section key={coach.linkId} className="glass rounded-(--radius) p-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[1.0625rem] font-medium text-text">
                {coach.practiceName ?? 'Your coach'}
              </h2>
              <button
                onClick={() => disconnect(coach.linkId)}
                disabled={saving === coach.linkId}
                className="min-h-11 text-xs text-muted underline-offset-4 transition-colors duration-(--duration-fast) hover:text-text hover:underline"
              >
                Disconnect
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              {ORDER.map((scope) => {
                const selected = coach.shareScope === scope;
                return (
                  <button
                    key={scope}
                    onClick={() => choose(coach.linkId, scope)}
                    disabled={saving === coach.linkId}
                    aria-pressed={selected}
                    className={cn(
                      'rounded-(--radius) border p-4 text-left transition-colors duration-(--duration-fast)',
                      selected
                        ? 'border-accent bg-accent-soft/70'
                        : 'border-line bg-white/40 hover:border-line-strong',
                    )}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-[0.9375rem] font-medium text-text">
                        {SHARE_SCOPE_LABELS[scope]}
                      </span>
                      {selected && <Check className="size-4 shrink-0 text-accent" />}
                    </span>
                    <span className="mt-1.5 block text-[0.875rem] leading-relaxed text-muted">
                      {SHARE_SCOPE_DETAIL[scope]}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-6 text-sm text-muted">
          {error}
        </p>
      )}

      <p className="mt-10 text-xs leading-relaxed text-muted">
        Your reflections and the reason behind each task are never shared with anyone, under
        any of these settings.
      </p>
    </div>
  );
}
