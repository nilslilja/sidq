import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell, Instruction, PrimaryAction, Key } from '@/components/onboarding/Shell';
import { CardPreview } from '@/components/onboarding/CardPreview';
import { Permissions, SystemDialogPreview, type PermissionState } from '@/components/onboarding/Permissions';
import { IntakeChips } from '@/components/onboarding/IntakeChips';
import { ConnectSources } from '@/components/onboarding/ConnectSources';
import { loadImported } from '@/lib/companion/import-history';
import type { WorkSession } from '@/lib/companion/work-history';
import { UpgradeStep } from '@/components/onboarding/UpgradeStep';
import { PoweredByClaude } from '@/components/landing/PoweredByClaude';
import { useShortcutGate } from '@/lib/onboarding/use-shortcut-gate';
import { STEPS, stepIndex, nextStep, DISCOVERY, INTENTS, type StepId } from '@/lib/onboarding/steps';
import { desktopBridge } from '@/lib/onboarding/bridge';
import { getSupabase } from '@/lib/supabase';
import { buildFirstPlan } from '@/lib/onboarding/first-plan';
import type { Day } from '@/types/domain';
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

/*
 * Turning the chips into a plan takes a model call, so the reveal step has
 * three states rather than one. Nothing here is faked: if generation fails the
 * step says so and offers to retry, because a made-up plan on the screen that
 * introduces the product would poison everything after it.
 */
type PlanState =
  | { status: 'idle' }
  | { status: 'building' }
  | { status: 'ready'; day: Day; isDemo: boolean }
  | { status: 'failed'; message: string };

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
  const [plan, setPlan] = useState<PlanState>({ status: 'idle' });
  // What Sidq can already see, shown on the sources step so the claim is
  // evidenced rather than asserted.
  const [claudeSessions, setClaudeSessions] = useState(0);
  const [imported, setImported] = useState<WorkSession[]>(() => loadImported());

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
  const captureGate = useShortcutGate({
    armed: step === 'capture',
    combo: { meta: true, shift: true, code: 'KeyN' },
    onComplete: advance,
  });
  const hideGate = useShortcutGate({
    armed: step === 'hide',
    combo: { meta: true, shift: true, code: 'KeyS' },
    onComplete: advance,
  });

  /*
   * Never trap anyone on a shortcut step.
   *
   * Global shortcuts collide. If another app already owns ⌘⇧N, registration
   * silently loses and the keypress never reaches us, so a step that only
   * advances on that shortcut is a dead end with no visible cause. After a few
   * seconds of nothing happening, an escape appears.
   */
  useEffect(() => {
    if (step !== 'capture' && step !== 'hide') {
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
    const wanted = step === 'capture' ? 'shortcut-capture' : step === 'hide' ? 'shortcut-hide' : null;
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
  const generateFirstPlan = useCallback(async () => {
    setPlan({ status: 'building' });
    // Advance rather than jumping to the reveal. Intake now sits before the
    // shortcut demos, so generation runs while the person learns ⌘⇧N and ⌘⇧S,
    // and the plan is already waiting by the time they reach it. The model call
    // costs a few seconds and nobody spends them staring at a spinner.
    advance();
    try {
      const { day, isDemo } = await buildFirstPlan({ focus, blockers, rhythm, discovery, intents });
      setPlan({ status: 'ready', day, isDemo });
    } catch (err) {
      setPlan({
        status: 'failed',
        message: err instanceof Error ? err.message : 'Could not build your day.',
      });
    }
  }, [focus, blockers, rhythm, discovery, intents, advance]);

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

  // The upgrade step is the one screen that drops the two-pane layout, the same
  // way the products this is modelled on do. A paywall beside a feature preview
  // reads as another lesson rather than as a decision.
  if (step === 'upgrade') {
    // advance() from the last step is what closes the window and shows the card,
    // so "Start with free" goes through it rather than routing on its own.
    return <UpgradeStep onSkip={advance} />;
  }

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

      case 'ready':
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            <PrimaryAction label="Continue" onClick={advance} />
          </Instruction>
        );

      case 'capture':
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            <div className="flex items-center gap-2">
              <Key lit={captureGate.held.meta}>⌘</Key>
              <Key lit={captureGate.held.shift}>⇧</Key>
              <Key lit={captureGate.held.key}>N</Key>
            </div>
            <div className="mt-7">
              <PrimaryAction label="Use the shortcut to continue" waiting />
            </div>
            {(!bridge || shortcutStuck) && (
              <ShortcutEscape
                onSkip={advance}
                reason={bridge ? 'collision' : 'browser'}
              />
            )}
          </Instruction>
        );

      case 'hide':
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            <div className="flex items-center gap-2">
              <Key lit={hideGate.held.meta}>⌘</Key>
              <Key lit={hideGate.held.shift}>⇧</Key>
              <Key lit={hideGate.held.key}>S</Key>
            </div>
            <div className="mt-7">
              <PrimaryAction label="Use the shortcut to continue" waiting />
            </div>
            {shortcutStuck || !bridge ? (
              <ShortcutEscape onSkip={advance} reason={bridge ? 'collision' : 'browser'} />
            ) : (
              <button
                onClick={advance}
                className="mt-5 w-full text-[0.8125rem] text-white/35 transition-colors duration-150 hover:text-white/70"
              >
                Skip ›
              </button>
            )}
          </Instruction>
        );

      case 'move':
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            {/* No ⌘ here any more. The arrows work on their own once the card
                has focus, which is what the code actually does. */}
            <div className="grid w-fit grid-cols-3 gap-1.5">
              <span />
              <Key>↑</Key>
              <span />
              <Key>←</Key>
              <Key>↓</Key>
              <Key>→</Key>
            </div>
            <p className="mt-4 text-[0.75rem] leading-relaxed text-white/35">
              Hold shift while pressing an arrow for fine adjustment.
            </p>
            <div className="mt-7">
              <PrimaryAction label="Continue" onClick={advance} />
            </div>
          </Instruction>
        );

      case 'sources':
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            <ConnectSources
              status={{ claudeSessions, importedSessions: imported.length }}
              onImported={setImported}
            />
            <div className="mt-6">
              <PrimaryAction label="Continue" onClick={advance} />
            </div>
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
                onClick={() => void generateFirstPlan()}
              />
            </div>
          </Instruction>
        );

      case 'subscribed':
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            <PrimaryAction label="Open Sidq" onClick={advance} />
          </Instruction>
        );

      case 'plan': {
        if (plan.status === 'building') {
          return (
            <Instruction
              title="Building your day"
              subtitle="Reading what you picked and sizing it to a real morning."
            >
              <PrimaryAction label="One moment" waiting />
            </Instruction>
          );
        }

        if (plan.status === 'failed') {
          // Never a fabricated plan as a fallback. The first day someone sees is
          // the whole promise of the product; inventing it here would be lying
          // at the exact moment trust is being established.
          return (
            <Instruction
              title="That did not work"
              subtitle={plan.message}
            >
              <PrimaryAction label="Try again" onClick={() => void generateFirstPlan()} />
              <button
                onClick={advance}
                className="mt-5 w-full text-[0.8125rem] text-white/35 transition-colors duration-150 hover:text-white/70"
              >
                Skip, I will build it later ›
              </button>
            </Instruction>
          );
        }

        return (
          <Instruction
            title={current.title}
            subtitle={
              plan.status === 'ready' && plan.isDemo
                ? 'Built locally, because no account is connected yet.'
                : current.subtitle
            }
          >
            <PrimaryAction label="Continue" onClick={advance} />
          </Instruction>
        );
      }

      default:
        return null;
    }
  }

  function renderRight() {
    switch (step) {
      case 'permissions':
      case 'ready':
        return (
          <SystemDialogPreview
            granted={step === 'ready' || permissions.accessibility}
            onOpenSettings={() => void bridge?.openAccessibilitySettings()}
          />
        );

      case 'capture':
        return (
          <CardPreview
            task="Write the pricing page copy"
            status="Cursor"
            clock="12:04"
            capturing
          />
        );

      case 'hide':
        return (
          <CardPreview
            task="Write the pricing page copy"
            status="Cursor"
            clock="12:41"
            dimmed={hideGate.held.meta}
          />
        );

      case 'move':
        return (
          <div className="relative grid place-items-center">
            <Arrows />
            <CardPreview task="Write the pricing page copy" status="Cursor" clock="18:22" />
          </div>
        );

      case 'discover':
        return (
          <CardPreview
            task="Pick up where you stopped"
            status="Sidq reads where you stopped"
            tone="calm"
            clock="0:00"
          />
        );

      case 'sources':
        return (
          <CardPreview
            task="Pick up where you stopped"
            status={
              claudeSessions + imported.length > 0
                ? `${claudeSessions + imported.length} conversations Sidq can see`
                : 'Nothing connected yet'
            }
            tone={claudeSessions + imported.length > 0 ? 'calm' : 'quiet'}
            clock="0:00"
          />
        );

      case 'intake':
        return (
          <CardPreview
            task="Building your day"
            status="One moment"
            tone="calm"
            clock="0:00"
          />
        );

      case 'plan':
        if (plan.status !== 'ready') {
          return (
            <CardPreview
              task="Building your day"
              status="One moment"
              tone="calm"
              clock="0:00"
            />
          );
        }
        return (
          <CardPreview
            task={plan.day.topPriority || plan.day.tasks[0]?.title || 'Your day'}
            status="Top priority today"
            tone="calm"
            clock="0:00"
            // The real generated tasks, not a sample.
            plan={plan.day.tasks.map((t) => ({ title: t.title, minutes: t.estMinutes }))}
          />
        );

      default:
        return (
          <CardPreview
            task="Write the pricing page copy"
            status="Cursor"
            clock="24:18"
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
                ? 'bg-[#6366F1] text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,0.8)]'
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

function Arrows() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-[-4rem]">
      {(
        [
          ['left-0 top-1/2 -translate-y-1/2', '←'],
          ['right-0 top-1/2 -translate-y-1/2', '→'],
          ['left-1/2 top-0 -translate-x-1/2', '↑'],
          ['bottom-0 left-1/2 -translate-x-1/2', '↓'],
        ] as const
      ).map(([position, glyph]) => (
        <span
          key={glyph}
          className={cn('absolute text-[1.25rem] text-white/20', position)}
        >
          {glyph}
        </span>
      ))}
    </div>
  );
}
