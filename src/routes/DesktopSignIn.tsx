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
    <div className="grid min-h-[100dvh] place-items-center bg-paper px-6 text-ink">

      <main className="relative w-full max-w-[24rem]">
        <div className="font-display text-[1.25rem] font-semibold leading-none tracking-[-0.05em]">Sidq</div>

        {phase === 'returning' ? (
          <>
            <h1 className="mt-10 font-display text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.05em]">
              Signed in
            </h1>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink/60">
              Returning you to the app. You can close this tab.
            </p>
          </>
        ) : phase === 'sent' ? (
          <>
            <h1 className="mt-10 font-display text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.05em]">
              Check your email
            </h1>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink/60">
              We sent a link to <span className="text-ink">{email}</span>. Open it in this
              browser and the app will pick it up by itself.
            </p>
            <button
              onClick={() => setPhase('idle')}
              className="mt-6 cursor-pointer text-[0.8125rem] text-ink/50 underline-offset-4 transition-colors duration-150 hover:text-ink hover:underline"
            >
              Use a different address
            </button>
          </>
        ) : (
          <>
            <h1 className="mt-10 font-display text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.05em]">
              Continue to Sidq
            </h1>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink/60">
              Sign in here and you will land back in the app automatically.
            </p>

            <div className="mt-8 grid gap-2.5">
              <ProviderButton provider="google" onClick={oauth} busy={false} disabled={phase === 'sending'} />
              <ProviderButton provider="apple" onClick={oauth} busy={false} disabled={phase === 'sending'} />
              <ProviderButton provider="github" onClick={oauth} busy={false} disabled={phase === 'sending'} />
            </div>

            <div className="my-6 flex items-center gap-4">
              <span className="h-px flex-1 bg-ink/10" />
              <span className="text-[0.75rem] text-ink/40">or</span>
              <span className="h-px flex-1 bg-ink/10" />
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
                  'h-12 w-full rounded-[10px] border border-ink/12 bg-white px-4',
                  'text-[0.9375rem] text-ink placeholder:text-ink/35',
                  'outline-none transition-[border-color,box-shadow] duration-150 focus:border-[#2448E8]/50 focus:shadow-[0_0_0_4px_rgba(36,72,232,0.1)]',
                )}
              />
              <button
                type="submit"
                disabled={phase === 'sending'}
                className="mt-2.5 h-12 w-full cursor-pointer rounded-[10px] bg-ink text-[0.9375rem] font-medium text-paper transition-[background-color,scale] duration-150 hover:bg-ink/85 active:scale-[0.99] disabled:opacity-60"
              >
                {phase === 'sending' ? 'Sending…' : 'Email me a link'}
              </button>
            </form>
          </>
        )}

        {error && (
          <p role="alert" className="mt-5 text-[0.8125rem] text-[#B23B32]">
            {error}
          </p>
        )}

        {!isBackendConfigured && (
          <p className="mt-6 text-[0.75rem] leading-relaxed text-ink/40">
            No backend is connected in this environment, so sign-in is unavailable. The app
            keeps your history and your subscription across machines.
          </p>
        )}
      </main>
    </div>
  );
}
