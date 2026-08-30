import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shell,
  Instruction,
  PrimaryAction,
  Key,
} from "@/components/onboarding/Shell";
import { PillPreview } from "@/components/landing/PillPreview";
import {
  ConnectModels,
  ConnectModelsPreview,
} from "@/components/onboarding/ConnectModels";
import { HowItGoes } from "@/components/onboarding/HowItGoes";
import { PoweredByClaude } from "@/components/landing/PoweredByClaude";
import { useShortcutGate } from "@/lib/onboarding/use-shortcut-gate";
import { GrantAccess } from "@/components/companion/GrantAccess";
import { sourceLabel } from "@/lib/companion/sources";
import type { WorkSession } from "@/lib/companion/work-history";
import {
  STEPS,
  stepIndex,
  nextStep,
  DISCOVERY,
  type StepId,
} from "@/lib/onboarding/steps";

/** The assistants that live in a browser, offered at the end of setup. */
const BROWSER_ASSISTANTS: { id: string; label: string }[] = [
  { id: "chatgpt", label: "ChatGPT" },
  { id: "claude.ai", label: "Claude" },
  { id: "gemini", label: "Gemini" },
];
import { desktopBridge } from "@/lib/onboarding/bridge";
import { HowReadingWorks } from "@/components/onboarding/HowReadingWorks";
import { adoptSession, rememberDisplayName } from "@/lib/supabase";
import { cn } from "@/lib/cn";

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

  const [step, setStep] = useState<StepId>("signin");
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [shortcutStuck, setShortcutStuck] = useState(false);
  const [discovery, setDiscovery] = useState<string | null>(null);
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
    if (!bridge || step !== "handover") return;

    const look = () =>
      void bridge.recentHandovers().then((rows) => setHandovers(rows.length));
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
    else navigate("/today");
  }, [step, navigate, bridge]);

  const back = index > 0 ? () => setStep(STEPS[index - 1].id) : undefined;

  // Shortcut gates. Only armed on their own step, so the listeners are never
  // sitting on the window swallowing keys during the rest of the flow.
  const pillGate = useShortcutGate({
    armed: step === "pill",
    combo: { meta: true, shift: true, code: "KeyK" },
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
    if (step !== "pill") {
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
    const wanted = step === "pill" ? "shortcut-pill" : null;
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
    if (step !== "signin" || !bridge) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void bridge
      .onSignedIn(
        (urls) =>
          void adoptSession(urls).then(() => {
            // The account already knows their name; setup no longer asks for it.
            rememberDisplayName();
            advance();
          }),
      )
      .then((fn) => {
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
   * Keep the one answer setup asks for our benefit rather than the person's.
   *
   * It used to be saved by the step *after* the question, so anybody who
   * answered "how did you find Sidq?" and then closed the window had their
   * answer dropped on the floor — which made asking it dishonest. It is saved
   * by the button under the question now.
   *
   * Local storage only. It does not belong on a server and it is not worth
   * failing setup over, so a browser that refuses to store it is ignored.
   */
  const saveDiscovery = useCallback(() => {
    try {
      if (discovery) localStorage.setItem("sidq.discovery", discovery);
    } catch {
      /* private mode; losing an analytics answer is not worth a dead end */
    }
    advance();
  }, [discovery, advance]);

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
      case "discover":
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            <Chips
              options={DISCOVERY}
              selected={discovery ? [discovery] : []}
              onToggle={setDiscovery}
            />
            <div className="mt-7">
              <PrimaryAction label="Start using Sidq" onClick={saveDiscovery} />
            </div>
            <p className="mt-4 text-[0.75rem] leading-relaxed text-white/30">
              Only the answer is stored, never anything about you. Skip it if
              you would rather not.
            </p>
          </Instruction>
        );

      /*
       * The welcome screen used to come first and did nothing but say hello:
       * a title, the pitch, and a Continue that revealed this one. Its pitch is
       * this screen's title now, and its attribution and terms line sit around
       * the button they were always about.
       */
      case "signin":
        return (
          <Instruction
            title={current.title}
            subtitle={current.subtitle}
            footer={
              <p className="text-[0.75rem] leading-relaxed text-white/30">
                By continuing you agree to the Terms and the Privacy Policy.
                Nothing about what is on your screen ever leaves this machine.
              </p>
            }
          >
            <div className="mb-7">
              <PoweredByClaude className="items-start" />
            </div>
            <PrimaryAction
              label={signingIn ? "Waiting for the browser" : "Sign in"}
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
                    err instanceof Error
                      ? err.message
                      : String(err ?? "Could not open sign-in."),
                  );
                });
              }}
            />

            {signInError && (
              <p
                role="alert"
                className="mt-4 text-[0.8125rem] leading-relaxed text-[#FFB4A2]"
              >
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

      /*
       * The permission and the picture of what it buys, on one screen.
       *
       * "How Sidq reads your AIs" was the step after this one, explaining what
       * this one had just asked for — the explanation arriving after the
       * decision it was meant to inform. See HowReadingWorks for why it is a
       * picture rather than the two hundred and fifty words it used to be.
       */
      case "sources":
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            <ConnectModels found={claudeSessions} onContinue={advance} />
            <div className="mt-8">
              <HowReadingWorks read={claudeSessions} />
            </div>
          </Instruction>
        );

      case "handover":
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            {/*
             * A sequence, drawn as a sequence.
             *
             * This was forty-seven words describing three actions, on a screen
             * that already plays the whole loop beside it. Three beats with the
             * keys in them is the same instruction and can be followed without
             * being read.
             */}
            <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.9375rem] text-white/75">
              <li>
                <Kbd>&#8984;&#8679;K</Kbd>
              </li>
              <li aria-hidden="true" className="text-white/25">
                &rarr;
              </li>
              <li>pick a conversation</li>
              <li aria-hidden="true" className="text-white/25">
                &rarr;
              </li>
              <li>
                <Kbd>&#8629;</Kbd>
              </li>
            </ol>

            <p className="mt-5 max-w-[42ch] text-[0.9375rem] leading-relaxed text-white/55">
              The whole conversation lands in Downloads, written so the next AI
              carries on rather than summarising it back at you.
            </p>

            {/*
             * The faster route, taught next to the slower one.
             *
             * Two taps skips every step above: no window, no list, no Downloads
             * folder. It is also invisible — there is no chord to stumble on and
             * nothing on screen to click — so if it is not said here the only
             * other place it exists is the tray menu.
             */}
            <div className="mt-7 rounded-[12px] border border-[#B8A6FF]/30 bg-[#B8A6FF]/[0.07] p-4">
              <p className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[0.9375rem] text-white/85">
                <span>Or, without opening anything:</span>
                <Kbd>right ⌘</Kbd>
                <span className="text-white/45">twice</span>
              </p>
              <p className="mt-2 max-w-[40ch] text-[0.875rem] leading-relaxed text-white/55">
                Grabs whatever you were just in and puts it on your clipboard.
                Paste it straight into the next AI.
              </p>
            </div>

            <div
              className={cn(
                "mt-6 max-w-[46ch] rounded-[12px] border p-4",
                handovers > 0
                  ? "border-[#B8A6FF]/45 bg-[#B8A6FF]/[0.08]"
                  : "border-white/[0.10] bg-white/[0.03]",
              )}
            >
              {handovers > 0 ? (
                <>
                  <p className="flex items-center gap-2 text-[0.875rem] font-medium text-white">
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full bg-[#B8A6FF]"
                    />
                    That is one, in your Downloads folder
                  </p>
                  <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-white/50">
                    Every one you make from now on lands there too, so nothing
                    is lost to a misclick the way a clipboard is.
                  </p>
                </>
              ) : (
                <p className="text-[0.875rem] text-white/60">
                  Waiting for your first one&hellip;
                </p>
              )}
            </div>

            <div className="mt-7">
              {handovers > 0 ? (
                <PrimaryAction label="Continue" onClick={advance} />
              ) : (
                <button
                  onClick={advance}
                  className={cn(
                    "text-[0.8125rem] text-white/40 underline-offset-4",
                    "cursor-pointer transition-colors duration-150 hover:text-white/70 hover:underline",
                  )}
                >
                  Skip for now
                </button>
              )}
            </div>
          </Instruction>
        );

      case "notifications":
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            {/*
             * Fifty-five words explaining what a notification looks like,
             * replaced by a notification. This screen is asking for permission
             * to post one; showing the thing being permitted is a shorter and
             * more honest answer than describing it.
             */}
            <NotificationPreview />

            <p className="mt-5 max-w-[42ch] text-[0.9375rem] leading-relaxed text-white/55">
              Sidq reads while you are in another app, so it says so. Once per
              conversation, when it first appears.
            </p>

            <div className="mt-6 max-w-[46ch] rounded-[12px] border border-white/[0.10] bg-white/[0.03] p-4">
              <p className="text-[0.875rem] font-medium text-white">
                {notified
                  ? "Sent. Check the top-right of your screen"
                  : "Send one now"}
              </p>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-white/50">
                {notified
                  ? "If nothing appeared, macOS is holding them back for Sidq and the button below opens the setting."
                  : "macOS asks the first time an app posts one, so this is the ask and the test at the same time."}
              </p>

              <div className="mt-4 flex items-center gap-4">
                <button
                  onClick={() => {
                    setNotified(true);
                    void bridge?.notifySample();
                  }}
                  className={cn(
                    "rounded-lg bg-white px-3 py-1.5 text-[0.8125rem] font-medium text-[#0B0B10]",
                    "cursor-pointer transition-opacity duration-150 hover:opacity-90",
                  )}
                >
                  {notified ? "Send another" : "Send a test notification"}
                </button>

                {notified && (
                  <button
                    onClick={() => void bridge?.openNotificationSettings()}
                    className={cn(
                      "text-[0.8125rem] text-white/45 underline-offset-4",
                      "cursor-pointer transition-colors duration-150 hover:text-white/75 hover:underline",
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

      /*
       * The only lesson in setup.
       *
       * Waiting on the real keypress rather than a Continue button, because a
       * person who has not pressed ⌘⇧K once has not seen the product. The
       * escape below appears after twelve seconds so a shortcut collision
       * cannot trap anybody here.
       */
      case "pill":
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
            {shortcutStuck && (
              <ShortcutEscape onSkip={advance} reason="collision" />
            )}
          </Instruction>
        );

      case "browse":
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
            {/*
             * The buttons are the instruction. A paragraph above them saying
             * "open one below" is a caption on a door.
             */}
            <p className="max-w-[42ch] text-[0.9375rem] leading-relaxed text-white/55">
              Open one and use it exactly as you do now. Sidq reads the window;
              it never asks you to sign in here.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {BROWSER_ASSISTANTS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => void bridge?.openAssistantInBrowser(a.id)}
                  className={cn(
                    "rounded-full px-4 py-2 text-[0.875rem] font-medium",
                    "bg-white/[0.07] text-white/80 ring-1 ring-inset ring-white/10",
                    "cursor-pointer transition-colors duration-150",
                    "hover:bg-white/[0.12] hover:text-white",
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

      default:
        return null;
    }
  }

  function renderRight() {
    switch (step) {
      // The genuine macOS pane, not a drawn imitation of one. Building a replica
      // of a system security dialog is impersonation, whatever the intent.
      case "sources":
        return <ConnectModelsPreview found={claudeSessions} />;

      /*
       * The whole loop, played beside the first handover rather than recapped
       * after it.
       *
       * It was its own step at the end: a diagram of five things somebody had
       * just done one at a time. Here it runs while they do the one that joins
       * them up, which is the moment it actually explains something.
       */
      case "handover":
        return <HowItGoes />;

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
              { title: "Pricing page copy", meta: "5h session · Sidq" },
              {
                title: "Onboarding email sequence",
                meta: "95 exchanges · Verdict",
              },
              { title: "Refund policy wording", meta: "40m · Sidq" },
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
/**
 * What Sidq's notification looks like, drawn.
 *
 * The step it sits on is asking permission to post one of these, and it used to
 * spend fifty-five words describing the circumstances in which it would. A
 * picture of the thing settles the same question in about a second.
 *
 * Deliberately not a pixel replica of the macOS banner: the corner radius and
 * the type are ours. Drawing an exact copy of a system surface teaches somebody
 * that a window looking exactly like the OS might have been drawn by an app,
 * which is the lesson this product least wants to teach.
 */
/** One key, drawn, so a shortcut can be shown rather than spelled out mid-sentence. */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        "inline-flex min-w-[2.25rem] items-center justify-center rounded-[6px] px-2 py-1",
        "border border-white/[0.16] bg-white/[0.08] font-mono text-[0.8125rem] text-white/90",
      )}
    >
      {children}
    </kbd>
  );
}

function NotificationPreview() {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex max-w-[26rem] items-start gap-3 rounded-[14px] p-3.5",
        "border border-white/[0.12] bg-white/[0.07]",
      )}
    >
      <img
        src="/icons/icon.svg"
        alt=""
        width={34}
        height={34}
        className="mt-0.5 size-[2.125rem] shrink-0 rounded-[8px]"
      />
      <div className="min-w-0">
        <p className="text-[0.8125rem] font-semibold text-white">Sidq</p>
        <p className="mt-0.5 text-[0.8125rem] leading-snug text-white/70">
          New chat from ChatGPT saved
        </p>
      </div>
      <span className="ml-auto shrink-0 text-[0.6875rem] text-white/35">
        now
      </span>
    </div>
  );
}

function BrowserReads({
  bridge,
}: {
  bridge: ReturnType<typeof desktopBridge>;
}) {
  const [read, setRead] = useState<string[]>([]);

  useEffect(() => {
    if (!bridge) return;

    const look = () =>
      void bridge.recentWork(200).then((rows) => {
        const sources = (rows as WorkSession[])
          .map((r) => r.source ?? "")
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
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-[#B8A6FF]"
            />
            Read from your browser: {read.join(", ")}
          </p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-white/50">
            Searchable now, and ready to hand to another AI. It keeps up as you
            talk.
          </p>
        </>
      ) : (
        <>
          <p className="text-[0.875rem] font-medium text-white">
            Nothing read from a browser yet
          </p>
          {/*
           * Both of the honest reasons, because the fix is different for each
           * and neither is visible from here.
           */}
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-white/50">
            Open a conversation you have already had rather than a new chat — an
            empty one has nothing in it to read. Sidq checks every 90 seconds,
            so give it a moment after you do.
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
              "min-h-10 rounded-full px-3.5 text-[0.8125rem] transition-all duration-150",
              on
                ? "bg-[#B8A6FF] text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,0.8)]"
                : "bg-white/[0.06] text-white/65 hover:bg-white/[0.11] hover:text-white",
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
  reason: "collision" | "browser";
}) {
  return (
    <div className="mt-5">
      <p className="text-[0.75rem] leading-relaxed text-white/35">
        {reason === "collision"
          ? "Nothing happening? Another app probably owns this shortcut. You can change it later in settings."
          : "Global shortcuts only work in the desktop app."}
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
