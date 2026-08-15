import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Users, ArrowRight } from 'lucide-react';
import {
  getCoachProfile,
  becomeCoach,
  listClients,
  getClientDays,
  inviteUrl,
  type CoachProfile,
} from '@/lib/coach-store';
import { summariseClient, orderForCoach, seatsUsed, type ClientSummary } from '@/lib/coaching';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import { cn } from '@/lib/cn';

/*
 * The coach's home.
 *
 * Sorted so the client who needs attention is first, because a coach with fifteen
 * clients should never have to scan for the one who has gone quiet. Everything on
 * this screen answers "who do I worry about today" and nothing else.
 */
export function CoachDashboard() {
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await getCoachProfile();
      setProfile(p);
      if (!p) {
        setLoading(false);
        return;
      }

      const links = await listClients();
      const summaries = await Promise.all(
        links.map(async (link) => {
          // Paused clients are never queried at all. Not fetching and discarding,
          // simply not fetching.
          const days =
            link.status === 'paused' || link.shareScope === 'paused'
              ? []
              : await getClientDays(link.clientId).catch(() => []);
          return summariseClient({
            clientId: link.clientId,
            displayName: link.displayName,
            status: link.status,
            shareScope: link.shareScope,
            days,
            streakCount: link.streakCount,
          });
        }),
      );
      setClients(orderForCoach(summaries));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your clients.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        <Loader statuses={['Loading your practice']} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="column grid min-h-[100dvh] place-items-center text-center">
        <div>
          <h1 className="font-display text-3xl">That did not load</h1>
          <p className="mx-auto mt-3 max-w-[34ch] text-sm leading-relaxed text-muted">{error}</p>
        </div>
      </div>
    );
  }

  if (!profile) return <CoachSetup onDone={load} />;

  const link = inviteUrl(profile.inviteCode);
  const used = seatsUsed(
    clients.map((c) => ({
      id: c.clientId,
      coachId: profile.id,
      clientId: c.clientId,
      status: c.status,
      shareScope: c.shareScope,
      invitedAt: '',
      acceptedAt: null,
    })),
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const attention = clients.filter((c) => c.needsAttention).length;

  return (
    <div className="column min-h-[100dvh] py-10">
      <header className="flex items-baseline justify-between gap-4">
        <span className="font-display text-[1.375rem] tracking-[-0.04em]">Sidq</span>
        <Link
          to="/coach/settings"
          className="min-h-11 text-sm leading-[2.75rem] text-muted transition-colors duration-(--duration-fast) hover:text-text"
        >
          Settings
        </Link>
      </header>

      <h1 className="mt-10 font-display text-[2.75rem] leading-[1.02]">
        {attention > 0 ? (
          <>
            {attention} {attention === 1 ? 'client needs' : 'clients need'} you
          </>
        ) : clients.length === 0 ? (
          'Nobody has joined yet'
        ) : (
          'Everyone is steady'
        )}
      </h1>

      <p className="mt-3 max-w-[42ch] text-[0.9375rem] leading-relaxed text-muted">
        {clients.length === 0
          ? 'Share your link below. Anyone who opens it is connected in about a minute, and you will see their first day as soon as they close it.'
          : 'Sorted by who to look at first. You see what gets finished, never what it was, unless they chose to share that.'}
      </p>

      {/* One link, always visible. This is the entire onboarding mechanism. */}
      <section className="glass mt-8 rounded-(--radius) p-5" aria-labelledby="invite">
        <div className="flex items-center justify-between gap-3">
          <h2 id="invite" className="text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
            Your client link
          </h2>
          <span className="tabular text-xs text-muted">
            {used} of {profile.seatLimit} seats
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-sm bg-white/60 px-3 py-2.5 font-mono text-[0.8125rem] text-text">
            {link}
          </code>
          <Button size="md" onClick={copy} className="shrink-0">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Paste it into your email signature or intake pack once. It never expires and works
          for every client.
        </p>
      </section>

      {clients.length > 0 && (
        <ul className="mt-8 grid gap-3">
          {clients.map((c) => (
            <li key={c.clientId}>
              <Link
                to={`/coach/client/${encodeURIComponent(c.clientId)}`}
                className={cn(
                  'sheen block rounded-(--radius) p-5 transition-transform duration-(--duration-fast)',
                  'ease-(--ease-out-expo) hover:-translate-y-px',
                  c.needsAttention ? 'glass border-accent' : 'glass-subtle',
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[1.0625rem] font-medium text-text">{c.displayName}</p>
                    <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">
                      {c.headline}
                    </p>
                  </div>
                  <TrendPip summary={c} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {clients.length === 0 && (
        <div className="mt-8 flex items-center gap-3 text-sm text-muted">
          <Users className="size-4" />
          No clients connected yet.
        </div>
      )}
    </div>
  );
}

function TrendPip({ summary }: { summary: ClientSummary }) {
  if (summary.status === 'paused') {
    return <span className="shrink-0 text-[0.6875rem] uppercase tracking-[0.14em] text-muted">Paused</span>;
  }
  if (summary.completionRate === null) {
    return <span className="shrink-0 text-[0.6875rem] uppercase tracking-[0.14em] text-muted">New</span>;
  }
  const label =
    summary.trend === 'improving' ? 'Up' : summary.trend === 'slipping' ? 'Down' : 'Steady';
  return (
    <span className="shrink-0 text-right">
      <span className="tabular block text-[1.25rem] leading-none text-text">
        {Math.round(summary.completionRate * 100)}%
      </span>
      <span
        className={cn(
          'mt-1 block text-[0.625rem] uppercase tracking-[0.14em]',
          summary.trend === 'slipping' ? 'text-accent' : 'text-muted',
        )}
      >
        {label}
      </span>
    </span>
  );
}

/** First run. One field, because anything more is a form nobody finishes. */
function CoachSetup({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await becomeCoach(name);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set that up.');
      setBusy(false);
    }
  };

  return (
    <div className="column flex min-h-[100dvh] flex-col justify-center py-16">
      <h1 className="font-display text-[2.75rem] leading-[1.02]">
        Set up your practice.
        <br />
        <span className="text-muted">Takes one field.</span>
      </h1>
      <p className="mt-4 max-w-[36ch] text-[0.9375rem] leading-relaxed text-muted">
        Your clients see this name when they open your link, so they know it is you.
      </p>

      <form onSubmit={submit} className="mt-10">
        <label htmlFor="practice" className="sr-only">
          Practice name
        </label>
        <input
          id="practice"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name, or your practice"
          className={cn(
            'glass-subtle w-full rounded-(--radius) px-5 py-4 text-[0.9375rem] text-text',
            'placeholder:text-muted/60 focus:border-accent focus:outline-none',
          )}
        />
        <Button type="submit" block size="lg" className="mt-3" disabled={busy}>
          {busy ? 'Setting up' : 'Start my 14 days'}
          <ArrowRight className="size-4" />
        </Button>
        {error && (
          <p role="alert" className="mt-4 text-sm text-muted">
            {error}
          </p>
        )}
      </form>

      <p className="mt-6 text-xs leading-relaxed text-muted">
        No card. Free for fourteen days, then $20 a month for up to fifteen clients.
      </p>
    </div>
  );
}
