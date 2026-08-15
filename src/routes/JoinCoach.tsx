import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, EyeOff } from 'lucide-react';
import { previewInvite, joinCoach } from '@/lib/coach-store';
import { getSupabase } from '@/lib/supabase';
import { SHARE_SCOPE_DETAIL } from '@/lib/coaching';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import { ProviderButton, type Provider } from '@/components/auth/ProviderButtons';

/*
 * The client side of the link.
 *
 * Deliberately shows exactly what a coach will and will not see BEFORE asking
 * anyone to sign in. A consent screen that appears after the account exists is not
 * consent, it is paperwork. The default is the private one.
 */
export function JoinCoach() {
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [practice, setPractice] = useState<string | null>(null);
  const [hasSpace, setHasSpace] = useState(true);
  const [valid, setValid] = useState<boolean | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const preview = await previewInvite(code);
      if (cancelled) return;
      if (!preview) {
        setValid(false);
        return;
      }
      setPractice(preview.practiceName);
      setHasSpace(preview.hasSpace);
      setValid(true);

      const supabase = getSupabase();
      const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      setSignedIn(Boolean(data.session));
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await joinCoach(code);
      navigate('/today', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect you.');
      setBusy(false);
    }
  };

  const signIn = async (provider: Provider) => {
    const supabase = getSupabase();
    if (!supabase) {
      setError('Accounts are not connected in this environment.');
      return;
    }
    setBusy(true);
    // Come back here after auth so the join completes in one motion.
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/join/${encodeURIComponent(code)}` },
    });
  };

  if (valid === null) {
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        <Loader statuses={['Checking that link']} />
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="column grid min-h-[100dvh] place-items-center text-center">
        <div>
          <h1 className="font-display text-[2.5rem]">That link is not valid</h1>
          <p className="mx-auto mt-3 max-w-[34ch] text-sm leading-relaxed text-muted">
            It may have been turned off. Ask your coach for a fresh one.
          </p>
          <Link to="/" className="mt-8 inline-block">
            <Button variant="outline">Go to Sidq</Button>
          </Link>
        </div>
      </div>
    );
  }

  const who = practice ?? 'Your coach';

  return (
    <div className="column flex min-h-[100dvh] flex-col justify-center py-16">
      <h1 className="font-display text-[2.75rem] leading-[1.02]">
        {who} invited you
        <br />
        <span className="text-muted">to plan your days here.</span>
      </h1>

      <p className="mt-5 max-w-[40ch] text-[1rem] leading-relaxed text-muted">
        Sidq builds you one honest day each morning. Three to six real moves, one marked as
        the thing that matters.
      </p>

      {/* Consent, stated before signup rather than buried after it. */}
      <section className="glass mt-9 rounded-(--radius) p-6" aria-labelledby="privacy">
        <h2 id="privacy" className="flex items-center gap-2 text-[0.9375rem] font-medium text-text">
          <ShieldCheck className="size-[18px] text-accent" />
          What {who} will see
        </h2>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
          {SHARE_SCOPE_DETAIL.signals}
        </p>

        <h3 className="mt-6 flex items-center gap-2 text-[0.9375rem] font-medium text-text">
          <EyeOff className="size-[18px] text-muted" />
          What they never see
        </h3>
        <ul className="mt-3 space-y-1.5 text-[0.9375rem] leading-relaxed text-muted">
          <li>Your reflections and end-of-day notes.</li>
          <li>Why any task mattered to you.</li>
          <li>Anything at all, the moment you pause sharing.</li>
        </ul>

        <p className="mt-5 text-xs leading-relaxed text-muted">
          You can change this or pause it whenever you like, and you always see exactly what
          they see. If you pause, they are told it is paused rather than being left guessing.
        </p>
      </section>

      {!hasSpace && (
        <p className="mt-6 text-sm text-muted">
          {who} has no free seats right now. Worth a message before you sign up.
        </p>
      )}

      <div className="mt-8">
        {signedIn ? (
          <Button block size="lg" onClick={connect} disabled={busy || !hasSpace}>
            {busy ? 'Connecting' : `Connect with ${who}`}
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <div className="grid gap-2.5">
            <ProviderButton provider="google" onClick={signIn} busy={busy} disabled={!hasSpace} />
            <ProviderButton provider="apple" onClick={signIn} busy={busy} disabled={!hasSpace} />
            <ProviderButton provider="github" onClick={signIn} busy={busy} disabled={!hasSpace} />
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-5 text-sm text-muted">
          {error}
        </p>
      )}

      <p className="mt-8 text-xs leading-relaxed text-muted">
        Sidq is free for you, always. Your coach pays for their side.
      </p>
    </div>
  );
}
