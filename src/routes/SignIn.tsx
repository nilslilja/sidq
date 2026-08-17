import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Mail } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { ProviderButton, type Provider } from '@/components/auth/ProviderButtons';
import { Button } from '@/components/ui/button';
import { isBackendConfigured } from '@/lib/env';
import { cn } from '@/lib/cn';

/*
 * The desktop hand-off.
 *
 * The app opens this page in the real browser, because Google and Apple both
 * refuse to authenticate inside an embedded webview, and the browser already has
 * the session and the password manager. When sign-in succeeds we bounce the
 * session back to the app over its own URL scheme.
 *
 * Exactly one target is allowed, compared literally. Honouring an arbitrary
 * `redirect` value here would be an open redirect that forwards a live session
 * token to whatever address an attacker put in a link.
 */
const DESKTOP_CALLBACK = 'sidq://auth';

/*
 * Sign in. Sits in front of intake, so the account exists before the first plan
 * does and every plan is attached to a real person from the start.
 *
 * No password field anywhere. OAuth or a magic link means there is no credential
 * to store, no reset flow to build, and no password to leak.
 */
export function SignIn() {
  const [searchParams] = useSearchParams();
  const forDesktop = searchParams.get('redirect') === DESKTOP_CALLBACK;
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<Provider | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEmail, setShowEmail] = useState(false);

  /*
   * Once a session exists and the desktop app is waiting, hand it over.
   *
   * The tokens go in the URL fragment rather than the query string: a fragment is
   * never sent to a server, so the session cannot end up in an access log or a
   * referrer header on the way.
   */
  useEffect(() => {
    if (!forDesktop) return;
    const supabase = getSupabase();
    if (!supabase) return;

    let handled = false;
    const handOff = (session: { access_token: string; refresh_token: string } | null) => {
      if (!session || handled) return;
      handled = true;
      const fragment = new URLSearchParams({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      window.location.href = `${DESKTOP_CALLBACK}#${fragment.toString()}`;
    };

    // Already signed in from a previous visit, or arriving back from OAuth.
    void supabase.auth.getSession().then(({ data }) => handOff(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => handOff(session));

    return () => sub.subscription.unsubscribe();
  }, [forDesktop]);

  /*
   * Where the magic link lands.
   *
   * This pointed at /intake, a route deleted with the planner. So the link
   * worked, Supabase authenticated, and the browser landed on a dead path that
   * bounced to the homepage — which looks exactly like a sign-in that failed.
   *
   * /upgrade is the one place a signed-in person on the web actually needs, and
   * it now reads the session on mount, so arriving there proves it worked.
   */
  const returnTo = forDesktop
    ? `${window.location.origin}/signin?redirect=${encodeURIComponent(DESKTOP_CALLBACK)}`
    : `${window.location.origin}/upgrade`;


  /*
   * Hands off to the provider and never returns: the browser navigates away.
   * Only an outright failure comes back here, which is why busy is cleared in
   * the error branch alone.
   */
  const oauth = async (provider: Provider) => {
    const supabase = getSupabase();
    if (!supabase) {
      setError('Accounts are not connected in this environment yet.');
      return;
    }
    setBusy(provider);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: returnTo },
    });
    if (authError) {
      setError(authError.message);
      setBusy(null);
    }
  };

  const magicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabase();
    if (!supabase) {
      setError('Accounts are not connected in this environment yet.');
      return;
    }
    setBusy('email');
    setError(null);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: returnTo },
    });
    setBusy(null);
    if (authError) {
      setError(authError.message);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <Shell>
        <h1 className="font-display text-[2.5rem]">Check your email</h1>
        <p className="mt-4 max-w-[34ch] text-[0.9375rem] leading-relaxed text-muted">
          We sent a link to <span className="text-text">{email}</span>. Open it on this device
          and you are in.
        </p>
        <button
          onClick={() => setSent(false)}
          className="mt-8 text-sm text-accent transition-opacity duration-(--duration-fast) hover:opacity-70"
        >
          Use a different address
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="font-display text-[2.75rem] leading-[1.02]">
        Keep your
        <br />
        history.
      </h1>
      <p className="mt-4 max-w-[34ch] text-[0.9375rem] leading-relaxed text-muted">
        It keeps your history and your subscription across machines. Your conversations
        are never part of it.
      </p>

      {/*
       * Providers first, email as the fallback.
       *
       * These were removed once, because every one of them failed: Supabase
       * returned "provider is not enabled" and somebody was left pressing a
       * button that looked fine. They are back now that the providers are
       * actually configured, which is the right order — a control that cannot
       * work should not be on screen, and one that can should be the fastest
       * way in.
       *
       * The same three, in the same order, as /desktop-signin. Two sign-in
       * pages offering different methods is how one of them ends up broken
       * without anybody noticing.
       */}
      <div className="mt-10 grid gap-2.5">
        <ProviderButton provider="google" onClick={oauth} busy={busy === 'google'} disabled={!!busy} />
        <ProviderButton provider="apple" onClick={oauth} busy={busy === 'apple'} disabled={!!busy} />
        <ProviderButton provider="github" onClick={oauth} busy={busy === 'github'} disabled={!!busy} />
      </div>

      <div className="my-6 flex items-center gap-4">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs uppercase tracking-[0.16em] text-muted">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      {/*
       * Email only, deliberately.
       *
       * Google, Apple and GitHub buttons sat here and every one of them did
       * nothing: the providers are not enabled in the Supabase project, so the
       * redirect failed silently and the person was left pressing a button that
       * looked fine. A control that does nothing is worse than no control.
       *
       * Magic link needs no provider configuration at all — Supabase sends it
       * out of the box — so it is the one method that is true right now. The
       * others come back when they are actually wired, not before.
       */}
      <div className="mt-10">
        {showEmail ? (
        <form onSubmit={magicLink}>
          <label htmlFor="email" className="sr-only">
            Email address
          </label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={cn(
              'glass-subtle w-full rounded-(--radius) px-5 py-4',
              'text-[0.9375rem] text-text placeholder:text-muted/60',
              'transition-colors duration-(--duration-fast) focus:border-accent focus:outline-none',
            )}
          />
          <Button type="submit" block size="lg" className="mt-2.5" disabled={busy === 'email'}>
            {busy === 'email' ? 'Sending' : 'Email me a link'}
            <ArrowRight className="size-4" />
          </Button>
        </form>
      ) : (
        <button
          onClick={() => setShowEmail(true)}
          className={cn(
            'glass sheen flex min-h-[3.25rem] w-full items-center justify-center gap-3',
            'rounded-(--radius) px-5 text-[0.9375rem] font-medium text-text',
            'transition-transform duration-(--duration-fast) ease-(--ease-out-expo) hover:-translate-y-px',
          )}
        >
          <Mail className="size-[18px]" />
          Continue with email
        </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-5 text-sm text-muted">
          {error}
        </p>
      )}

      {/*
       * No "look around without an account" any more.
       *
       * It set a guest flag nothing reads and then navigated to /intake, a
       * route that no longer exists, so it silently bounced to the homepage.
       * There is also nothing left to look around: the product is the Mac app,
       * and it already works without an account. Signing in is for billing.
       */}
      {!isBackendConfigured && (
        <div className="mt-8 rounded-(--radius) border border-line bg-accent-soft/60 p-4">
          <p className="text-[0.8125rem] leading-relaxed text-muted">
            Accounts are not connected in this build yet. Sidq itself does not need one:
            it reads your conversations from this Mac either way.
          </p>
        </div>
      )}

      <p className="mt-8 text-xs leading-relaxed text-muted">
        By continuing you agree to the Terms and Privacy Policy.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="column flex min-h-[100dvh] flex-col justify-center py-16">
      <Link
        to="/"
        className="mb-10 inline-flex w-fit min-h-11 items-center gap-2 text-sm text-muted transition-colors duration-(--duration-fast) hover:text-text"
      >
        <ArrowLeft className="size-4" />
        Back
      </Link>
      {children}
    </div>
  );
}
