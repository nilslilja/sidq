import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell, Instruction, PrimaryAction, Key } from '@/components/onboarding/Shell';
import { PillPreview } from '@/components/landing/PillPreview';
import { ConnectModels, ConnectModelsPreview } from '@/components/onboarding/ConnectModels';
import { PoweredByClaude } from '@/components/landing/PoweredByClaude';
import { useShortcutGate } from '@/lib/onboarding/use-shortcut-gate';
import { GrantAccess } from '@/components/companion/GrantAccess';
import { sourceLabel } from '@/lib/companion/sources';
import type { WorkSession } from '@/lib/companion/work-history';
import { STEPS, stepIndex, nextStep, DISCOVERY, INTENTS, type StepId } from '@/lib/onboarding/steps';

/** The assistants that live in a browser, offered at the end of setup. */
const BROWSER_ASSISTANTS: { id: string; label: string }[] = [
  { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'claude.ai', label: 'Claude' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'perplexity', label: 'Perplexity' },
];
import { desktopBridge } from '@/lib/onboarding/bridge';
import { adoptSession } from '@/lib/supabase';
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
  const [name, setName] = useState('');
  /*
   * Handovers made, polled while the handover step is up. The step advances
   * when this goes above zero, so it is gated on the thing actually happening
   * rather than on a button that says it did.
   */
  const [handovers, setHandovers] = useState(0);
  // What Sidq can already see, shown on the sources step so the claim is
  // evidenced rather than asserted.
  const [claudeSessions, setClaudeSessions] = useState(0);
  /*
   * Whether a sample has been sent. Not whether it was allowed — nothing can
   * tell us that — only that the ask has happened, so the copy can stop
   * offering and start explaining what to do if nothing showed up.
   */
  const [notified, setNotified] = useState(false);

  /*
   * Count handovers while that step is up.
   *
   * Polled rather than announced: the handover happens in the pill, not in this
   * window, and a poll that runs only while one step is on screen cannot fail
   * silently the way an event can.
   */
  useEffect(() => {
    if (!bridge || step !== 'handover') return;

    const look = () => void bridge.recentHandovers().then((rows) => setHandovers(rows.length));
    look();
    const timer = setInterval(look, 1500);
    return () => clearInterval(timer);
  }, [bridge, step]);

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
      if (name.trim()) localStorage.setItem('sidq.name', name.trim());
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
                sees inside the app. Left, because everything around it is:
                centred, it sat a few pixels off the heading's edge and read as
                a misalignment rather than a choice. */}
            <div className="mb-7">
              <PoweredByClaude className="items-start" />
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
            <ConnectModels found={claudeSessions} onContinue={advance} />
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
      case 'name':
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') advance();
              }}
              placeholder="Your first name"
              spellCheck={false}
              className={cn(
                'w-full max-w-[22rem] rounded-[12px] border border-white/[0.12] bg-white/[0.04]',
                'px-4 py-3 text-[1rem] text-white placeholder:text-white/30',
                'outline-none transition-colors duration-150 focus:border-[#B8A6FF]/60',
              )}
            />
            <div className="mt-7">
              <PrimaryAction
                label={name.trim() ? 'Continue' : 'Skip'}
                onClick={advance}
              />
            </div>
          </Instruction>
        );

      case 'handover':
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            <p className="max-w-[46ch] text-[0.9375rem] leading-relaxed text-white/55">
              {/*
                * A plain inline kbd, not the <Key> component. That one is built
                * for the shortcut rail — it is a full-width block — and inside
                * a paragraph it stacked three purple bars down the page.
                */}
              Press{' '}
              <kbd className="rounded-[5px] border border-white/[0.16] bg-white/[0.08] px-1.5 py-0.5 font-mono text-[0.8125rem] text-white/85">
                &#8984;&#8679;K
              </kbd>
              , choose any conversation and press Enter. Sidq writes the whole thing to your
              Downloads as a Markdown file, with an instruction at both ends telling the next AI
              to read it and carry on rather than summarise it back at you. Attach that file
              anywhere.
            </p>

            <div
              className={cn(
                'mt-6 max-w-[46ch] rounded-[12px] border p-4',
                handovers > 0
                  ? 'border-[#B8A6FF]/45 bg-[#B8A6FF]/[0.08]'
                  : 'border-white/[0.10] bg-white/[0.03]',
              )}
            >
              {handovers > 0 ? (
                <>
                  <p className="flex items-center gap-2 text-[0.875rem] font-medium text-white">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-[#B8A6FF]" />
                    That is one, in your Downloads folder
                  </p>
                  <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-white/50">
                    Every one you make from now on lands there too, so nothing is lost to a
                    misclick the way a clipboard is.
                  </p>
                </>
              ) : (
                <p className="text-[0.875rem] text-white/60">Waiting for your first one&hellip;</p>
              )}
            </div>

            <div className="mt-7">
              {handovers > 0 ? (
                <PrimaryAction label="Continue" onClick={advance} />
              ) : (
                <button
                  onClick={advance}
                  className={cn(
                    'text-[0.8125rem] text-white/40 underline-offset-4',
                    'cursor-pointer transition-colors duration-150 hover:text-white/70 hover:underline',
                  )}
                >
                  Skip for now
                </button>
              )}
            </div>
          </Instruction>
        );

      case 'notifications':
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            <p className="max-w-[46ch] text-[0.9375rem] leading-relaxed text-white/55">
              Reading an AI that lives in a browser means that browser has to be in front, so
              the moment Sidq picks a conversation up you are, by definition, looking at
              something else. It plays a short tone and posts one notification the first time
              it reads a conversation &mdash; not as it grows, once, when it appears.
            </p>

            <div className="mt-6 max-w-[46ch] rounded-[12px] border border-white/[0.10] bg-white/[0.03] p-4">
              <p className="text-[0.875rem] font-medium text-white">
                {notified ? 'Sent. Check the top-right of your screen' : 'Send one now'}
              </p>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-white/50">
                {notified
                  ? 'If nothing appeared, macOS is holding them back for Sidq and the button below opens the setting.'
                  : 'macOS asks the first time an app posts one, so this is the ask and the test at the same time.'}
              </p>

              <div className="mt-4 flex items-center gap-4">
                <button
                  onClick={() => {
                    setNotified(true);
                    void bridge?.notifySample();
                  }}
                  className={cn(
                    'rounded-lg bg-white px-3 py-1.5 text-[0.8125rem] font-medium text-[#0B0B10]',
                    'cursor-pointer transition-opacity duration-150 hover:opacity-90',
                  )}
                >
                  {notified ? 'Send another' : 'Send a test notification'}
                </button>

                {notified && (
                  <button
                    onClick={() => void bridge?.openNotificationSettings()}
                    className={cn(
                      'text-[0.8125rem] text-white/45 underline-offset-4',
                      'cursor-pointer transition-colors duration-150 hover:text-white/75 hover:underline',
                    )}
                  >
                    Open Notification settings
                  </button>
                )}
              </div>
            </div>

            {/*
              * Never gated on the notification having been allowed.
              *
              * There is no honest way to check. The plugin's permission call is
              * a stub on desktop that always answers granted, so a gate here
              * would either trap somebody who declined or wave through somebody
              * who has them switched off. Sound and notifications are a
              * courtesy on top of work that happens either way.
              */}
            <div className="mt-7">
              <PrimaryAction label="Continue" onClick={advance} />
            </div>
          </Instruction>
        );

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

      case 'browse':
        // Same six the Sources panel offers, named here rather than fetched:
        // this screen must render instantly on a machine where the app has
        // only just started, and a spinner in the last step of setup is worse
        // than a list that cannot go out of date without a rebuild anyway.
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            {/*
              * This credited the extension, which stopped being how it works.
              * The permission granted two steps ago is what reads these, and
              * saying otherwise sends somebody looking for an install that is
              * no longer part of the product.
              */}
            <p className="max-w-[46ch] text-[0.9375rem] leading-relaxed text-white/55">
              Everything on this Mac is already being read. For the AIs that live in a
              browser, open one below and use it exactly as you do now — Sidq reads the
              window with the permission you just gave it, so you are never asked to sign
              in to anything here.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {BROWSER_ASSISTANTS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => void bridge?.openAssistantInBrowser(a.id)}
                  className={cn(
                    'rounded-full px-4 py-2 text-[0.875rem] font-medium',
                    'bg-white/[0.07] text-white/80 ring-1 ring-inset ring-white/10',
                    'cursor-pointer transition-colors duration-150',
                    'hover:bg-white/[0.12] hover:text-white',
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>

            {/* The steps live here rather than in a page somebody has to be
                sent to, and the status goes green on its own. */}
            <div className="mt-6 w-full max-w-[36rem] text-left">
              <GrantAccess compact surface="dark" />
            </div>

            <BrowserReads bridge={bridge} />

            <div className="mt-8">
              <PrimaryAction label="Done" onClick={advance} />
            </div>
          </Instruction>
        );

      case 'reading':
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            <div className="space-y-3">
              {/*
                * Two blocks, because there are exactly two cases and the whole
                * confusion is that people assume there is one. The first is
                * already done and needs saying so; the second is the one with a
                * rule attached.
                */}
              <div className="rounded-[12px] border border-[#B8A6FF]/35 bg-[#B8A6FF]/[0.07] p-4">
                <p className="flex items-center gap-2 text-[0.875rem] font-medium text-white">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-[#B8A6FF]" />
                  Already yours
                </p>
                <p className="mt-1.5 max-w-[46ch] text-[0.8125rem] leading-relaxed text-white/55">
                  Claude Code, Cowork, Cursor and the other editors write their conversations
                  straight to this Mac.{' '}
                  {claudeSessions > 0 ? (
                    <>
                      Sidq has read{' '}
                      <span className="text-white">all {claudeSessions} of them</span> already.
                    </>
                  ) : (
                    <>Sidq reads all of them with nothing to set up.</>
                  )}
                </p>
              </div>

              <div className="rounded-[12px] border border-white/[0.10] bg-white/[0.03] p-4">
                <p className="text-[0.875rem] font-medium text-white">
                  As you open them
                </p>
                <p className="mt-1.5 max-w-[46ch] text-[0.8125rem] leading-relaxed text-white/55">
                  ChatGPT, Gemini, Claude.ai, Perplexity and Grok live in a browser, and a
                  browser keeps nothing readable on your Mac. So Sidq reads the conversation
                  you have open. Look at one for about fifteen seconds and it is yours from
                  then on &mdash; searchable, and ready to hand to another AI. You never open
                  it twice.
                </p>
              </div>
            </div>

            {/*
              * The consequence, said plainly rather than left to be worked out.
              * This is the sentence somebody needs a week later when they wonder
              * why an old chat is not in the picker.
              */}
            <p className="mt-5 max-w-[46ch] text-[0.875rem] leading-relaxed text-white/70">
              So the browser conversations you had <em className="not-italic text-white">before</em>{' '}
              today are not in Sidq yet. They arrive as you go back to them, and a week of
              ordinary use covers most of it.
            </p>

            <div className="mt-7">
              <PrimaryAction label="Got it" onClick={advance} />
            </div>
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
 * The way past a shortcut that will not fire.
 *
 * Says which of the two reasons applies, because "skip" alone leaves someone
 * thinking the feature is broken when in fact another app owns the keys.
 */

/**
 * What has actually been read out of a browser, live.
 *
 * ── The complaint this exists for ────────────────────────────────────────────
 * "When I press the sources I just get there, nothing happens." Which was
 * true, and the step gave no way to tell the difference between the three
 * reasons for it: the permission is off, the sweep has not come round yet, or
 * the tab is a brand new empty chat with nothing in it to read.
 *
 * Pressing a chip opened a browser and the setup screen sat unchanged behind
 * it, so a working product and a broken one looked identical.
 *
 * ── Why it says ninety seconds out loud ──────────────────────────────────────
 * Because that is the sweep, and a person who has just been told something is
 * being read will look for it within about five. Naming the wait is the
 * difference between waiting and giving up.
 */
function BrowserReads({ bridge }: { bridge: ReturnType<typeof desktopBridge> }) {
  const [read, setRead] = useState<string[]>([]);

  useEffect(() => {
    if (!bridge) return;

    const look = () =>
      void bridge.recentWork(200).then((rows) => {
        const sources = (rows as WorkSession[])
          .map((r) => r.source ?? '')
          .filter((id) => BROWSER_ASSISTANTS.some((a) => a.id === id));
        setRead([...new Set(sources)].map((id) => sourceLabel(id)));
      });

    look();
    const timer = setInterval(look, 4000);
    return () => clearInterval(timer);
  }, [bridge]);

  return (
    <div className="mt-6 max-w-[46ch] rounded-[12px] border border-white/[0.10] bg-white/[0.03] p-4">
      {read.length > 0 ? (
        <>
          <p className="flex items-center gap-2 text-[0.875rem] font-medium text-white">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[#B8A6FF]" />
            Read from your browser: {read.join(', ')}
          </p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-white/50">
            Searchable now, and ready to hand to another AI. It keeps up as you talk.
          </p>
        </>
      ) : (
        <>
          <p className="text-[0.875rem] font-medium text-white">Nothing read from a browser yet</p>
          {/*
            * Both of the honest reasons, because the fix is different for each
            * and neither is visible from here.
            */}
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-white/50">
            Open a conversation you have already had rather than a new chat — an empty one
            has nothing in it to read. Sidq checks every 90 seconds, so give it a moment
            after you do.
          </p>
        </>
      )}
    </div>
  );
}

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

