import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell, Instruction, PrimaryAction, Key } from '@/components/onboarding/Shell';
import { PillPreview } from '@/components/landing/PillPreview';
import { Permissions, SystemDialogPreview, type PermissionState } from '@/components/onboarding/Permissions';
import { IntakeChips } from '@/components/onboarding/IntakeChips';
import { ConnectModels, ConnectModelsPreview } from '@/components/onboarding/ConnectModels';
import { PoweredByClaude } from '@/components/landing/PoweredByClaude';
import { useShortcutGate } from '@/lib/onboarding/use-shortcut-gate';
import { STEPS, stepIndex, nextStep, DISCOVERY, INTENTS, type StepId } from '@/lib/onboarding/steps';
import { desktopBridge } from '@/lib/onboarding/bridge';
import { getSupabase } from '@/lib/supabase';
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
  const [permissions, setPermissions] = useState<PermissionState>({
    accessibility: false,
    notifications: false,
    autostart: true,
  });
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [recheckFailed, setRecheckFailed] = useState(false);
  const [shortcutStuck, setShortcutStuck] = useState(false);
  const [focus, setFocus] = useState<string[]>([]);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [rhythm, setRhythm] = useState<string | null>(null);
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

  // Accessibility is granted in System Settings, not here, so the only way to know
  // is to keep asking. Polling stops the moment it flips.
  useEffect(() => {
    if (step !== 'permissions' || permissions.accessibility || !bridge) return;

    const id = window.setInterval(async () => {
      const granted = await bridge.hasAccessibility();
      if (granted) setPermissions((p) => ({ ...p, accessibility: true }));
    }, 1200);
    return () => window.clearInterval(id);
  }, [step, permissions.accessibility, bridge]);

  // Advance itself once the permission lands, rather than making someone who has
  // just been to System Settings come back and press another button.
  useEffect(() => {
    if (step === 'permissions' && permissions.accessibility) {
      const id = window.setTimeout(advance, 700);
      return () => window.clearTimeout(id);
    }
  }, [step, permissions.accessibility, advance]);

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

  /**
   * Ask macOS again, on demand.
   *
   * The background poll already runs, but someone who has just granted the
   * permission and is being told they have not needs a button that visibly does
   * something. Failure is reported rather than silently doing nothing.
   */
  const recheckAccessibility = useCallback(async () => {
    if (!bridge) return;
    setRechecking(true);
    setRecheckFailed(false);
    try {
      const granted = await bridge.hasAccessibility();
      if (granted) setPermissions((p) => ({ ...p, accessibility: true }));
      else setRecheckFailed(true);
    } finally {
      setRechecking(false);
    }
  }, [bridge]);

  const setPermission = (key: keyof PermissionState, value: boolean) => {
    setPermissions((p) => ({ ...p, [key]: value }));
    if (key === 'autostart') void bridge?.setAutostart(value);
    if (key === 'notifications' && value) void bridge?.requestNotifications();
  };


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
            <button
              onClick={advance}
              className="mt-5 w-full text-[0.8125rem] text-white/35 transition-colors duration-150 hover:text-white/70"
            >
              Skip, try it without an account ›
            </button>
          </Instruction>
        );

      case 'permissions':
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            <Permissions state={permissions} onToggle={setPermission} />
            <div className="mt-6">
              <PrimaryAction
                label={
                  permissions.accessibility ? 'Granted' : 'Allow accessibility access'
                }
                waiting={permissions.accessibility}
                onClick={() => void bridge?.openAccessibilitySettings()}
              />
            </div>

            {/*
             * Two ways past, both real buttons.
             *
             * The escape used to be faint grey text, which nobody reads as
             * clickable, so this screen was still a dead end in practice.
             *
             * The re-check exists because of ad-hoc signing: macOS identifies an
             * unsigned app by a hash that changes on every rebuild, so a
             * permission granted to yesterday's build does not apply to today's.
             * People correctly say "I already gave it access" and are correctly
             * ignored. A manual check turns a trap into one more click.
             */}
            {!permissions.accessibility && (
              <div className="mt-4 grid gap-2">
                <button
                  onClick={() => void recheckAccessibility()}
                  disabled={rechecking}
                  className={cn(
                    'min-h-[2.75rem] rounded-[12px] border border-white/12 px-4',
                    'text-[0.8125rem] text-white/70 transition-colors duration-150',
                    'hover:border-white/25 hover:text-white disabled:opacity-50',
                  )}
                >
                  {rechecking ? 'Checking…' : 'Already granted it? Check again'}
                </button>

                <button
                  onClick={advance}
                  className={cn(
                    'min-h-[2.75rem] rounded-[12px] px-4',
                    'text-[0.8125rem] text-white/45 transition-colors duration-150 hover:text-white',
                  )}
                >
                  Continue without it ›
                </button>

                <p className="mt-1 text-[0.75rem] leading-relaxed text-white/30">
                  Without it Sidq sees app names but not window titles, and ⌘⇧N will
                  not work from inside other apps. You can turn it on later in settings.
                </p>

                {recheckFailed && (
                  <p className="text-[0.75rem] leading-relaxed text-[#FFB4A2]">
                    macOS still reports it as off. This build is unsigned, so macOS
                    treats each rebuild as a new app: remove Sidq from Privacy &amp;
                    Security → Accessibility, then add it again.
                  </p>
                )}
              </div>
            )}
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
                What should Sidq do for you
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

            <IntakeChips
              focus={focus}
              blockers={blockers}
              rhythm={rhythm}
              onFocus={setFocus}
              onBlockers={setBlockers}
              onRhythm={setRhythm}
            />
            <div className="mt-7">
              <PrimaryAction
                label={focus.length === 0 ? 'Pick at least one' : 'Continue'}
                waiting={focus.length === 0}
                onClick={() => void saveIntake()}
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
      case 'permissions':
        return (
          <SystemDialogPreview
            granted={permissions.accessibility}
            onOpenSettings={() => void bridge?.openAccessibilitySettings()}
          />
        );

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
    if (!error) return;
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

