import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { isBackendConfigured } from '@/lib/env';
import { ProviderButton, type Provider } from '@/components/auth/ProviderButtons';
import { cn } from '@/lib/cn';

/*
 * Sign in, for the desktop app only.
 *
 * Reached from one place: the button in the installed app. It is not in the nav,
 * not in the footer, and not linked from any page, because it is not a
 * destination — it is the middle of a round trip that starts and ends in the app.
 *
 * Kept separate from /signin rather than adding a flag to it. That page belongs
 * to the web product and has its own concerns: skip-without-account, routing on
 * to intake, the marketing shell. Every one of those is wrong here, and a single
 * component trying to be both is how a subtle bug ends up in the auth path.
 */

const DESKTOP_CALLBACK = 'sidq://auth';

type Phase = 'idle' | 'sending' | 'sent' | 'returning' | 'error';

export function DesktopSignIn() {
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  /*
   * The moment a session exists, hand it back and stop.
   *
   * Tokens go in the fragment, never the query string: a fragment is not sent to
   * any server, so a live session cannot end up in an access log or a referrer
   * header on the way back to the app.
   */
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    let handed = false;
    const handOff = (session: { access_token: string; refresh_token: string } | null) => {
      if (!session || handed) return;
      handed = true;
      setPhase('returning');
      const fragment = new URLSearchParams({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      window.location.href = `${DESKTOP_CALLBACK}#${fragment.toString()}`;
    };

    void supabase.auth.getSession().then(({ data }) => handOff(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => handOff(session));
    return () => sub.subscription.unsubscribe();
  }, []);

  const returnTo = `${window.location.origin}/desktop-signin`;

  const oauth = async (provider: Provider) => {
    const supabase = getSupabase();
    if (!supabase) return setError('Accounts are not connected in this environment yet.');

    setPhase('sending');
    setError(null);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: returnTo },
    });
    if (authError) {
      setError(authError.message);
      setPhase('error');
    }
  };

  const magicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabase();
    if (!supabase) return setError('Accounts are not connected in this environment yet.');

    setPhase('sending');
    setError(null);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: returnTo },
    });
    if (authError) {
      setError(authError.message);
      setPhase('error');
      return;
    }
    setPhase('sent');
  };

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[#0B0B10] px-6 text-white">
      <div
        aria-hidden="true"
        className="bloom-breathe pointer-events-none fixed left-1/2 top-1/4 size-[32rem] -translate-x-1/2 rounded-full bg-[#6366F1] opacity-[0.13] blur-[110px]"
      />

      <main className="relative w-full max-w-[24rem]">
        <div className="font-display text-[1.5rem] leading-none tracking-[-0.05em]">Sidq</div>

        {phase === 'returning' ? (
          <>
            <h1 className="mt-8 font-display text-[1.75rem] leading-tight tracking-[-0.03em]">
              Signed in
            </h1>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-white/50">
              Returning you to the app. You can close this tab.
            </p>
          </>
        ) : phase === 'sent' ? (
          <>
            <h1 className="mt-8 font-display text-[1.75rem] leading-tight tracking-[-0.03em]">
              Check your email
            </h1>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-white/50">
              We sent a link to <span className="text-white">{email}</span>. Open it in this
              browser and the app will pick it up by itself.
            </p>
            <button
              onClick={() => setPhase('idle')}
              className="mt-6 text-[0.8125rem] text-white/45 transition-colors duration-150 hover:text-white"
            >
              Use a different address
            </button>
          </>
        ) : (
          <>
            <h1 className="mt-8 font-display text-[1.75rem] leading-tight tracking-[-0.03em]">
              Continue to Sidq
            </h1>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-white/50">
              Sign in here and you will land back in the app automatically.
            </p>

            <div className="mt-8 grid gap-2.5">
              <ProviderButton provider="google" onClick={oauth} busy={false} disabled={phase === 'sending'} />
              <ProviderButton provider="apple" onClick={oauth} busy={false} disabled={phase === 'sending'} />
              <ProviderButton provider="github" onClick={oauth} busy={false} disabled={phase === 'sending'} />
            </div>

            <div className="my-6 flex items-center gap-4">
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-[0.6875rem] uppercase tracking-[0.16em] text-white/35">or</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <form onSubmit={magicLink}>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={cn(
                  'w-full rounded-[12px] border border-white/12 bg-white/[0.04] px-4 py-3',
                  'text-[0.9375rem] text-white placeholder:text-white/30',
                  'outline-none transition-colors duration-150 focus:border-white/30',
                )}
              />
              <button
                type="submit"
                disabled={phase === 'sending'}
                className="btn-soft mt-2.5 min-h-[3rem] w-full rounded-[12px] text-[0.9375rem] font-medium disabled:opacity-60"
              >
                {phase === 'sending' ? 'Sending…' : 'Email me a link'}
              </button>
            </form>
          </>
        )}

        {error && (
          <p role="alert" className="mt-5 text-[0.8125rem] text-[#FFB4A2]">
            {error}
          </p>
        )}

        {!isBackendConfigured && (
          <p className="mt-6 text-[0.75rem] leading-relaxed text-white/30">
            No backend is connected in this environment, so sign-in is unavailable. The app
            works without an account.
          </p>
        )}
      </main>
    </div>
  );
}
