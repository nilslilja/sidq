import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell, Instruction, PrimaryAction, Key } from '@/components/onboarding/Shell';
import { PillPreview } from '@/components/landing/PillPreview';
import { ConnectModels, ConnectModelsPreview } from '@/components/onboarding/ConnectModels';
import { PoweredByClaude } from '@/components/landing/PoweredByClaude';
import { useShortcutGate } from '@/lib/onboarding/use-shortcut-gate';
import { STEPS, stepIndex, nextStep, DISCOVERY, INTENTS, type StepId } from '@/lib/onboarding/steps';
import { desktopBridge } from '@/lib/onboarding/bridge';
import { getSupabase , shareSessionWithDesktop } from '@/lib/supabase';
import { cn } from '@/lib/cn';

/*
 * First run.
 *
 * A ten step flow that cannot be completed without using the product. Three of the
 * steps advance only on a real keypress or a real OS permission, which is the whole
 * design: at the end of this, the shortcuts are in the person's hands rather than
 * in a help page they will never open.
 *
 * Runs in its own Tauri window, and also opens in a browser tab, where the
 * shortcut steps degrade to a skip. Being unable to develop the flow without
 * building the Rust shell every time would mean it never gets polished.
 */


export default function Onboarding() {
  const navigate = useNavigate();
  const bridge = useMemo(desktopBridge, []);

  const [step, setStep] = useState<StepId>('welcome');
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [shortcutStuck, setShortcutStuck] = useState(false);
  const [discovery, setDiscovery] = useState<string | null>(null);
  const [intents, setIntents] = useState<string[]>([]);
  // What Sidq can already see, shown on the sources step so the claim is
  // evidenced rather than asserted.
  const [claudeSessions, setClaudeSessions] = useState(0);
  const [browserOpened, setBrowserOpened] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    void bridge
      .recentWork(20)
      .then((sessions) => setClaudeSessions(sessions.length))
      .catch(() => undefined);
  }, [bridge]);

  const index = stepIndex(step);
  const current = STEPS[index];
  const advance = useCallback(() => {
    const next = nextStep(step);
    if (next) {
      setStep(next);
      return;
    }
    // End of the flow. On the desktop this closes this window and brings the
    // card up; in a browser tab there is no window to close, so it just routes.
    if (bridge) void bridge.finish();
    else navigate('/today');
  }, [step, navigate, bridge]);

  const back = index > 0 ? () => setStep(STEPS[index - 1].id) : undefined;

  // Shortcut gates. Only armed on their own step, so the listeners are never
  // sitting on the window swallowing keys during the rest of the flow.
  const pillGate = useShortcutGate({
    armed: step === 'pill',
    combo: { meta: true, shift: true, code: 'KeyK' },
    onComplete: advance,
  });

  /*
   * Never trap anyone on a shortcut step.
   *
   * Global shortcuts collide. If another app already owns ⌘⇧K, registration
   * silently loses and the keypress never reaches us, so a step that only
   * advances on that shortcut is a dead end with no visible cause. After a few
   * seconds of nothing happening, an escape appears.
   */
  useEffect(() => {
    if (step !== 'pill') {
      setShortcutStuck(false);
      return;
    }
    setShortcutStuck(false);
    const id = window.setTimeout(() => setShortcutStuck(true), 12_000);
    return () => window.clearTimeout(id);
  }, [step]);

  /*
   * The global shortcut actually firing.
   *
   * The keydown gates above only work in a browser tab. In the desktop app
   * these are global shortcuts, so the OS hands them to Rust and the focused
   * window never sees a keypress. Rust forwards them here while setup is open,
   * which is why this listener exists and why the step is genuinely proof the
   * shortcut works rather than proof a key was pressed.
   */
  useEffect(() => {
    if (!bridge) return;
    const wanted = step === 'pill' ? 'shortcut-pill' : null;
    if (!wanted) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void bridge.onShortcut(wanted, advance).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [step, bridge, advance]);

  /*
   * The browser coming back.
   *
   * Without this the sign-in step waits forever: the button opens a browser tab
   * and then nothing on this side is listening for the sidq:// callback. Armed
   * only on that step, so a stray deep link later in the flow cannot skip ahead.
   */
  useEffect(() => {
    if (step !== 'signin' || !bridge) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void bridge.onSignedIn((urls) => void adoptSession(urls).then(advance)).then((fn) => {
      // The step may have been left before listen() resolved.
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [step, bridge, advance]);



  /**
   * Save the answers and generate the real first day.
   *
   * Advances to the reveal immediately and generates behind it, so the wait
   * happens on a screen that explains itself rather than under a dead button.
   */
  /*
   * Keep the two setup answers, then move on.
   *
   * This used to call a model to generate a first day. The planner is gone, but
   * the answers are not pointless: they are the only two questions setup asks
   * for our benefit rather than the person's, and dropping them on the floor
   * would make asking them dishonest.
   *
   * Local storage only. Neither answer belongs on a server and neither is worth
   * failing setup over, so a browser that refuses to store them is ignored.
   */
  const saveIntake = useCallback(() => {
    try {
      if (discovery) localStorage.setItem('sidq.discovery', discovery);
      if (intents.length) localStorage.setItem('sidq.intents', JSON.stringify(intents));
    } catch {
      /* private mode; losing an analytics answer is not worth a dead end */
    }
    advance();
  }, [discovery, intents, advance]);




  return (
    <Shell
      progress={(index + 1) / STEPS.length}
      phase={current.phase}
      onBack={back}
      left={renderLeft()}
      right={renderRight()}
    />
  );

  function renderLeft() {
    switch (step) {
      case 'welcome':
        return (
          <Instruction
            title={
              <>
                Welcome to
                <br />
                Sidq
              </>
            }
            subtitle={current.subtitle}
            footer={
              <p className="text-[0.75rem] leading-relaxed text-white/30">
                By continuing you agree to the Terms and the Privacy Policy. Nothing about
                what is on your screen ever leaves this machine.
              </p>
            }
          >
            {/* The same attribution as the site, on the first screen anyone
                sees inside the app. */}
            <div className="mb-7">
              <PoweredByClaude />
            </div>
            <PrimaryAction label="Continue" onClick={advance} />
          </Instruction>
        );

      case 'discover':
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            <Chips options={DISCOVERY} selected={discovery ? [discovery] : []} onToggle={setDiscovery} />
            <div className="mt-7">
              <PrimaryAction label="Continue" onClick={advance} />
            </div>
            <p className="mt-4 text-[0.75rem] leading-relaxed text-white/30">
              Only the answer is stored, never anything about you. Skip it if you would rather not.
            </p>
          </Instruction>
        );

      case 'signin':
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            <PrimaryAction
              label={signingIn ? 'Waiting for the browser' : 'Sign in'}
              waiting={signingIn}
              onClick={() => {
                setSigningIn(true);
                setSignInError(null);
                // The rejection has to be caught. Swallowing it leaves this
                // step sitting on "Waiting for the browser" forever when no
                // web address is configured for the build.
                void bridge?.openSignIn().catch((err: unknown) => {
                  setSigningIn(false);
                  setSignInError(
                    err instanceof Error ? err.message : String(err ?? 'Could not open sign-in.'),
                  );
                });
              }}
            />

            {signInError && (
              <p role="alert" className="mt-4 text-[0.8125rem] leading-relaxed text-[#FFB4A2]">
                {signInError}
              </p>
            )}
            {/*
             * No skip. An account is required.
             *
             * This let someone finish setup with nothing signed in, which meant
             * no way to reach them, no subscription to attach, and a product
             * that quietly forgot them on the next machine.
             */}
          </Instruction>
        );

      case 'sources':
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            <ConnectModels
              found={claudeSessions}
              visited={browserOpened}
              onConnect={() => {
                setBrowserOpened(true);
                void bridge?.openConnectPage();
              }}
              onSkip={advance}
            />
          </Instruction>
        );

      /*
       * The only lesson in setup.
       *
       * Waiting on the real keypress rather than a Continue button, because a
       * person who has not pressed ⌘⇧K once has not seen the product. The
       * escape below appears after twelve seconds so a shortcut collision
       * cannot trap anybody here.
       */
      case 'pill':
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            <div className="flex items-center gap-2">
              <Key lit={pillGate.held.meta}>⌘</Key>
              <Key lit={pillGate.held.shift}>⇧</Key>
              <Key lit={pillGate.held.key}>K</Key>
            </div>
            <div className="mt-7">
              <PrimaryAction label="Press ⌘⇧K to continue" waiting />
            </div>
            {shortcutStuck && <ShortcutEscape onSkip={advance} reason="collision" />}
          </Instruction>
        );

      case 'intake':
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            <div className="mb-7">
              <p className="text-[0.625rem] uppercase tracking-[0.2em] text-white/35">
                Where your conversations happen
              </p>
              <div className="mt-3">
                <Chips
                  options={INTENTS}
                  selected={intents}
                  onToggle={(id) =>
                    setIntents((prev) =>
                      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                    )
                  }
                />
              </div>
            </div>

            {/*
             * The focus, blocker and rhythm chips are gone with the planner
             * they fed. They asked what someone struggles with in a day, which
             * this product no longer has an opinion about.
             */}
            <div className="mt-7">
              <PrimaryAction
                label={intents.length === 0 ? 'Pick at least one' : 'Continue'}
                waiting={intents.length === 0}
                onClick={saveIntake}
              />
            </div>
          </Instruction>
        );

      default:
        return null;
    }
  }

  function renderRight() {
    switch (step) {
      // The genuine macOS pane, not a drawn imitation of one. Building a replica
      // of a system security dialog is impersonation, whatever the intent.
      case 'sources':
        return <ConnectModelsPreview found={claudeSessions} />;

      /*
       * Every other step shows the pill.
       *
       * It is the product, so there is nothing else worth showing beside a
       * setup screen. What used to sit here was the prototype card with a
       * running timer, which taught a first-time user the wrong thing about
       * what they had just installed.
       */
      default:
        return (
          <PillPreview
            rows={[
              { title: 'Pricing page copy', meta: '5h session · Sidq' },
              { title: 'Onboarding email sequence', meta: '95 exchanges · Verdict' },
              { title: 'Refund policy wording', meta: '40m · Sidq' },
            ]}
            className="w-full max-w-[26rem]"
          />
        );
    }
  }
}

/**
 * Take the session the browser handed back.
 *
 * The tokens arrive in the URL fragment, which is where the browser put them so
 * they never travelled to a server. Without this step the app would advance past
 * sign-in while still being signed out, which is the worst of both.
 *
 * Never throws: a malformed callback leaves the person signed out and moving
 * forward, which is recoverable, rather than stuck on a dead screen.
 */
async function adoptSession(urls: string[]): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  for (const url of urls) {
    const fragment = url.split('#')[1];
    if (!fragment) continue;

    const params = new URLSearchParams(fragment);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) continue;

    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (!error) {
      // Rust needs it too, to confirm the plan against billing rather than
      // taking this page's word for which tier the account is on.
      await shareSessionWithDesktop();
      return;
    }
  }
}

/**
 * The way past a shortcut that will not fire.
 *
 * Says which of the two reasons applies, because "skip" alone leaves someone
 * thinking the feature is broken when in fact another app owns the keys.
 */
/** Flat chip row, for the two single-question steps. */
function Chips({
  options,
  selected,
  onToggle,
}: {
  options: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = selected.includes(option.id);
        return (
          <button
            key={option.id}
            onClick={() => onToggle(option.id)}
            aria-pressed={on}
            className={cn(
              'min-h-10 rounded-full px-3.5 text-[0.8125rem] transition-all duration-150',
              on
                ? 'bg-[#B8A6FF] text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,0.8)]'
                : 'bg-white/[0.06] text-white/65 hover:bg-white/[0.11] hover:text-white',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ShortcutEscape({
  onSkip,
  reason,
}: {
  onSkip: () => void;
  reason: 'collision' | 'browser';
}) {
  return (
    <div className="mt-5">
      <p className="text-[0.75rem] leading-relaxed text-white/35">
        {reason === 'collision'
          ? 'Nothing happening? Another app probably owns this shortcut. You can change it later in settings.'
          : 'Global shortcuts only work in the desktop app.'}
      </p>
      <button
        onClick={onSkip}
        className="mt-2 min-h-[2.5rem] text-[0.8125rem] text-white/60 transition-colors duration-150 hover:text-white"
      >
        Skip this step ›
      </button>
    </div>
  );
}

