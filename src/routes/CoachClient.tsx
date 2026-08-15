import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Sparkles, ShieldCheck } from 'lucide-react';
import { fetchCoachBrief, getClientDays, listClients, type CoachBriefResult } from '@/lib/coach-store';
import { summariseClient, SHARE_SCOPE_LABELS, type ClientSummary } from '@/lib/coaching';
import { calibrationInsights } from '@/lib/calibration';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

/*
 * One client, three minutes before a session.
 *
 * The brief is the reason a coach pays. Everything below it is the evidence the
 * brief was drawn from, so a coach can check the claim rather than trust it.
 */
export function CoachClient() {
  const { clientId: raw } = useParams<{ clientId: string }>();
  const clientId = decodeURIComponent(raw ?? '');

  const [summary, setSummary] = useState<ClientSummary | null>(null);
  const [brief, setBrief] = useState<CoachBriefResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [briefLoading, setBriefLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const links = await listClients();
      const link = links.find((l) => l.clientId === clientId);
      if (!link) {
        setError('That client is not connected to you.');
        return;
      }
      const days =
        link.status === 'paused' || link.shareScope === 'paused'
          ? []
          : await getClientDays(clientId).catch(() => []);
      setSummary(
        summariseClient({
          clientId,
          displayName: link.displayName,
          status: link.status,
          shareScope: link.shareScope,
          days,
          streakCount: link.streakCount,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this client.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const buildBrief = async () => {
    setBriefLoading(true);
    try {
      setBrief(await fetchCoachBrief(clientId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the brief.');
    } finally {
      setBriefLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        <Loader statuses={['Opening the file']} />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="column grid min-h-[100dvh] place-items-center text-center">
        <div>
          <h1 className="font-display text-3xl">Not available</h1>
          <p className="mx-auto mt-3 max-w-[34ch] text-sm leading-relaxed text-muted">
            {error ?? 'Unknown client.'}
          </p>
          <Link to="/coach" className="mt-8 inline-block">
            <Button variant="outline">Back to clients</Button>
          </Link>
        </div>
      </div>
    );
  }

  const insights = summary.calibration ? calibrationInsights(summary.calibration) : [];
  const paused = summary.status === 'paused' || summary.shareScope === 'paused';

  return (
    <div className="column min-h-[100dvh] py-10">
      <Link
        to="/coach"
        className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-muted transition-colors duration-(--duration-fast) hover:text-text"
      >
        <ArrowLeft className="size-4" />
        All clients
      </Link>

      <h1 className="mt-8 font-display text-[2.5rem] leading-[1.02]">{summary.displayName}</h1>
      <p className="mt-3 max-w-[42ch] text-[0.9375rem] leading-relaxed text-muted">
        {summary.headline}
      </p>

      {/* The client decides what a coach can see, and the coach is told so plainly. */}
      <p className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-line bg-white/50 px-3 py-1.5 text-xs text-muted">
        <ShieldCheck className="size-3.5" />
        Sharing: {SHARE_SCOPE_LABELS[summary.shareScope].toLowerCase()}
      </p>

      {!paused && (
        <section className="mt-10" aria-labelledby="brief">
          <h2 id="brief" className="text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
            Session brief
          </h2>

          {brief ? (
            <BriefCard result={brief} />
          ) : (
            <div className="glass mt-4 rounded-(--radius) p-6">
              <p className="text-[0.9375rem] leading-relaxed text-text">
                Build a brief from the last three weeks of what actually happened.
              </p>
              <Button className="mt-5" onClick={buildBrief} disabled={briefLoading}>
                <Sparkles className="size-4" />
                {briefLoading ? 'Reading the record' : 'Build the brief'}
              </Button>
            </div>
          )}
        </section>
      )}

      {insights.length > 0 && (
        <section className="mt-12" aria-labelledby="measured">
          <h2 id="measured" className="text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
            What the data shows
          </h2>
          <ul className="mt-4 grid gap-3">
            {insights.map((i) => (
              <li key={i.kind} className="glass-subtle rounded-(--radius) p-5">
                <h3 className="text-[1rem] font-medium text-text">{i.headline}</h3>
                <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">{i.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {paused && (
        <div className="glass-subtle mt-10 rounded-(--radius) p-6">
          <p className="text-[0.9375rem] leading-relaxed text-text">
            This client has sharing paused.
          </p>
          <p className="mt-2 text-[0.875rem] leading-relaxed text-muted">
            You can see that it is paused rather than being left to wonder whether they
            disappeared. Whether to raise it is a judgement call, and it is yours.
          </p>
        </div>
      )}
    </div>
  );
}

function BriefCard({ result }: { result: CoachBriefResult }) {
  const { brief, degraded } = result;
  return (
    <div className="glass mt-4 rounded-(--radius) p-6">
      <p className="text-[1.125rem] leading-snug text-text">{brief.headline}</p>

      {brief.whats_changed.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
            What changed
          </h3>
          <ul className="mt-2.5 space-y-2">
            {brief.whats_changed.map((s) => (
              <li key={s} className="text-[0.9375rem] leading-relaxed text-text">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief.worth_asking.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[0.6875rem] uppercase tracking-[0.16em] text-accent">
            Worth asking
          </h3>
          <ul className="mt-2.5 space-y-2">
            {brief.worth_asking.map((s) => (
              <li key={s} className="text-[0.9375rem] leading-relaxed text-text">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief.going_well.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
            Going well
          </h3>
          <ul className="mt-2.5 space-y-2">
            {brief.going_well.map((s) => (
              <li key={s} className="text-[0.9375rem] leading-relaxed text-muted">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p
        className={cn(
          'mt-6 border-t border-line pt-4 text-xs leading-relaxed text-muted',
          degraded && 'text-accent',
        )}
      >
        {degraded
          ? 'The full brief did not meet our safety checks, so this is the plain version. Nothing here is a clinical judgement.'
          : `${brief.data_note} Confidence: ${brief.confidence}.`}
      </p>
    </div>
  );
}
