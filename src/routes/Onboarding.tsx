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
import type { Combo } from "@/lib/onboarding/use-shortcut-gate";
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
import { BeforeYouStart } from "@/components/onboarding/BeforeYouStart";

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
 * "⌘⇧K" into the shape the keypress gate wants.
 *
 * Rust owns which shortcut registered and reports it as the glyphs a person
 * reads, so this is the one place that turns them back into modifier flags and
 * a layout independent KeyboardEvent code.
 */
function comboFromLabel(label: string): Combo {
  const letter = label.replace(/[^A-Za-z]/g, "").toUpperCase() || "K";
  return {
    meta: label.includes("⌘"),
    shift: label.includes("⇧"),
    alt: label.includes("⌥"),
    ctrl: label.includes("⌃"),
    code: `Key${letter}`,
  };
}

export default function Onboarding() {
  const navigate = useNavigate();
  const bridge = useMemo(desktopBridge, []);

  const [step, setStep] = useState<StepId>("signin");

  /*
   * The trust screen, and it is deliberately not a step.
   *
   * Setup is seven steps and a test caps it there, because it was twelve and
   * every one of them cost people who never finished. This is not an eighth: it
   * comes before the flow starts, has no entry in the rail, and cannot be
   * navigated back to — a progress bar that reads "1 of 8" when the first
   * screen is a disclaimer is lying about how long setup is.
   *
   * Shown once per machine. Somebody reinstalling to fix something does not
   * need the privacy argument again, and a screen that reappears after you have
   * accepted it reads as a nag rather than a disclosure.
   */
  const [readTrust, setReadTrust] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sidq.readTrust") === "yes";
    } catch {
      // A machine that cannot remember shows it again, which is the safe way
      // round for a screen whose entire job is being seen.
      return false;
    }
  });
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [shortcutStuck, setShortcutStuck] = useState(false);
  /*
   * The modifiers actually bound, asked rather than written down. Which key
   * does what is a setting, and copy that names one by hand starts teaching
   * the wrong key the moment somebody changes it.
   */
  const [taps, setTaps] = useState<[string, string]>(["right ⌘", "left ⌃"]);
  const [discovery, setDiscovery] = useState<string | null>(null);
  /*
   * Whether to count how the app is used. Starts false and the box starts
   * empty, which is the whole basis of the claim the privacy policy makes.
   *
   * On this screen rather than its own, deliberately. Setup is where people
   * give up, and adding a step in order to measure where people give up would
   * cost more of them than the measurement is worth.
   */
  const [counting, setCounting] = useState(false);
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
  /*
   * Three states, not two: never asked, posted, refused. A boolean could not
   * tell "we sent one" from "macOS would not let us", so the screen claimed
   * success either way.
   */
  const [notified, setNotified] = useState<"sent" | "failed" | null>(null);

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

  /*
   * Count the step, every time one is reached.
   *
   * On `step` rather than inside `advance`, because `back` moves between steps
   * too and a funnel that only counts forwards reports a flow nobody walked.
   * Silent when counting is off: Rust checks consent before the row is written,
   * so there is nothing to check here.
   */
  useEffect(() => {
    void bridge?.countSetupStep(step);
  }, [step, bridge]);
  const advance = useCallback(() => {
    const next = nextStep(step);
    if (next) {
      setStep(next);
      return;
    }
    // End of the flow. On the desktop this closes this window and brings the
    // card up; in a browser tab there is no window to close, so it just routes.
    if (bridge) {
      // The far end of the funnel. Counted before `finish`, which closes this
      // window: after that call there is no guarantee this code runs again.
      void bridge.countReady();
      void bridge.finish();
    } else navigate("/today");
  }, [step, navigate, bridge]);

  const back = index > 0 ? () => setStep(STEPS[index - 1].id) : undefined;

  // Shortcut gates. Only armed on their own step, so the listeners are never
  // sitting on the window swallowing keys during the rest of the flow.
  /*
   * The shortcut that actually registered, which is not always the one asked
   * for. `undefined` while unknown, `null` when every candidate was taken.
   */
  const [pickerKey, setPickerKey] = useState<string | null | undefined>(
    undefined,
  );
  useEffect(() => {
    let alive = true;
    void bridge
      ?.pickerShortcut()
      .then((k) => alive && setPickerKey(k))
      .catch(() => alive && setPickerKey(null));
    return () => {
      alive = false;
    };
  }, [bridge]);

  /*
   * Teaching the key that works.
   *
   * The gate has to match whatever registered, or the screen asks for one
   * combination and listens for another — which is a step nobody can pass.
   */
  const pillCombo = useMemo(() => comboFromLabel(pickerKey ?? "⌘⇧K"), [
    pickerKey,
  ]);

  const pillGate = useShortcutGate({
    armed: step === "pill",
    combo: pillCombo,
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
  /*
   * Which step is showing, told to the app.
   *
   * The picker shortcut has to do two different things during setup: light this
   * window up on the step that teaches the key, and open the actual picker on
   * the step that asks you to use it. Rust cannot know which without being told,
   * and until it was, the handover step's headline instruction did nothing —
   * the key was swallowed and the event sent to a listener that was not armed.
   */
  useEffect(() => {
    void bridge?.setStep(step);
  }, [step, bridge]);

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
    void bridge?.tapKeys().then(setTaps);
  }, [bridge]);

  /*
   * ── Whether the double-tap gesture can work on this machine ───────────────
   *
   * It is a global event monitor in Rust, and macOS delivers nothing at all to
   * one of those without Accessibility. Not "sometimes", not "degraded" —
   * nothing. So without the permission the gesture is not a feature that might
   * be flaky, it is a keystroke that provably goes nowhere.
   *
   * Teaching it anyway is how somebody ends up believing the product is broken:
   * they follow the instruction, nothing happens, and the reasonable conclusion
   * is that Sidq does not work. The picker is right there and needs no
   * permission, so on a machine without the grant the picker is simply the
   * instruction and the gesture is never mentioned.
   *
   * `null` while the answer is unknown, and the block is hidden until it is
   * known — a panel that appears a beat after the screen does is worse than
   * one that was never there.
   */
  const [gestureWorks, setGestureWorks] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void bridge
      ?.accessibilityGranted()
      .then((ok) => alive && setGestureWorks(ok))
      .catch(() => alive && setGestureWorks(false));
    return () => {
      alive = false;
    };
  }, [bridge, step]);

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
    /*
     * Written whichever way it was answered, so that "no" is a recorded no
     * rather than an absent yes. It changes nothing today — absent already
     * means off — and it means a later default can never silently reinterpret
     * somebody who declined.
     */
    void bridge?.setCounting(counting);
    advance();
  }, [discovery, counting, bridge, advance]);

  if (!readTrust) {
    return (
      <Shell
        progress={0}
        phase="Get started"
        left={
          <BeforeYouStart
            onContinue={() => {
              try {
                localStorage.setItem("sidq.readTrust", "yes");
              } catch {
                /* not worth failing the flow over */
              }
              setReadTrust(true);
            }}
          />
        }
        right={renderRight()}
      />
    );
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
      case "discover":
        return (
          <Instruction title={current.title} subtitle={current.subtitle}>
            <Chips
              options={DISCOVERY}
              selected={discovery ? [discovery] : []}
              onToggle={setDiscovery}
            />
            {/*
              * Unticked, and it stays unticked unless somebody acts.
              *
              * The wording says what is counted rather than asking to "help
              * improve Sidq", which is what every one of these says and which
              * tells nobody anything. The honest version of the ask is that
              * without it there is no way to tell nobody downloading it from
              * everybody giving up on this exact screen.
              */}
            <label className="mt-7 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={counting}
                onChange={(e) => setCounting(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 cursor-pointer accent-lilac"
              />
              <span className="text-[0.8125rem] leading-relaxed text-white/55">
                Count how I use Sidq. Which screens I reach and which buttons I
                press, as numbers with no text in them. Never a conversation, a
                title or a filename. You can read the full list and switch it
                off inside Sidq at any time.
              </span>
            </label>

            <div className="mt-6">
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
            {/*
             * The fast route first.
             *
             * It was underneath, in a box, after four lines about the picker —
             * which is where a better way to do something goes to be skipped.
             * Two taps is how most people will use Sidq once they know it
             * exists, so it is the instruction and the picker is the fallback.
             */}
            {gestureWorks && (
              <div className="rounded-[12px] border border-lilac/35 bg-lilac/[0.09] p-4">
                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[1rem] text-white">
                  <span>Double-tap</span>
                  <Kbd>{taps[0]}</Kbd>
                </p>
                <p className="mt-2.5 max-w-[42ch] text-[0.9375rem] leading-relaxed text-white/65">
                  Grabs whatever you were just in and puts the file on your
                  clipboard. Press ⌘V in ChatGPT, Claude or anywhere that takes an
                  attachment and the whole conversation goes with it.
                </p>
                <p className="mt-2 max-w-[42ch] text-[0.875rem] leading-relaxed text-white/40">
                  Double-tap <span className="text-white/70">{taps[1]}</span> puts
                  the last one back, for when you have copied something since.
                </p>
              </div>
            )}

            {/*
              * The heading only says "or" when there is something to be an
              * alternative to. Without the gesture this is the instruction, and
              * calling the only route "a different one" reads as though a step
              * went missing.
              */}
            <p
              className={cn(
                "text-[0.8125rem] uppercase tracking-[0.14em] text-white/35",
                gestureWorks ? "mt-7" : "mt-0",
              )}
            >
              {gestureWorks ? "Or pick a different one" : "Pick a conversation"}
            </p>

            <ol className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.9375rem] text-white/75">
              <li>
                {/*
                 * The key that actually registered, not the one we hoped for.
                 * ⌘⇧K is only the first candidate — when it is taken, Rust
                 * falls through to ⌘⇧J, ⌘⌥K or ⌃⇧K, and this step used to
                 * teach the wrong key one screen after the previous step
                 * taught the right one.
                 */}
                <Kbd>{pickerKey ?? "⌘⇧K"}</Kbd>
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

            <div
              className={cn(
                "mt-6 max-w-[46ch] rounded-[12px] border p-4",
                handovers > 0
                  ? "border-lilac/45 bg-lilac/[0.08]"
                  : "border-white/[0.10] bg-white/[0.03]",
              )}
            >
              {handovers > 0 ? (
                <>
                  <p className="flex items-center gap-2 text-[0.875rem] font-medium text-white">
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full bg-lilac"
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

            <div className="mt-7 flex flex-wrap items-center gap-4">
              {handovers > 0 ? (
                <PrimaryAction label="Continue" onClick={advance} />
              ) : (
                <>
                  {/*
                   * A route that cannot fail.
                   *
                   * Everything above is a keyboard gesture that needs
                   * Accessibility, or a global shortcut another app may own.
                   * When either is missing this screen offered nothing but
                   * "Skip for now" — so the one step that makes somebody
                   * actually use the product was the easiest to walk past, and
                   * it read as though a step were broken. A button opens the
                   * picker whatever else is unavailable.
                   */}
                  <PrimaryAction
                    label="Open the picker"
                    onClick={() => void bridge?.openPicker()}
                  />
                  <button
                    onClick={advance}
                    className={cn(
                      "text-[0.8125rem] text-white/40 underline-offset-4",
                      "cursor-pointer transition-colors duration-150 hover:text-white/70 hover:underline",
                    )}
                  >
                    Skip for now
                  </button>
                </>
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
              {/*
               * Three states, read as three.
               *
               * Rust has reported whether the notification actually got out
               * since the comment on the button below was written, but every
               * line here tested `notified` for truthiness — and "failed" is
               * truthy. So the one case worth telling somebody about, the one
               * where nothing was posted, printed "Sent. Check the top-right of
               * your screen" and sent them looking for something that was never
               * there.
               */}
              <p className="text-[0.875rem] font-medium text-white">
                {notified === "sent" && "Sent. Check the top-right of your screen"}
                {notified === "failed" && "That one did not get through"}
                {notified === null && "Send one now"}
              </p>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-white/50">
                {notified === "sent" &&
                  "If nothing appeared, macOS is holding them back for Sidq and the button below opens the setting."}
                {notified === "failed" &&
                  "macOS would not post it, which almost always means notifications are turned off for Sidq. The button below opens the setting."}
                {notified === null &&
                  "macOS asks the first time an app posts one, so this is the ask and the test at the same time."}
              </p>

              <div className="mt-4 flex items-center gap-4">
                <button
                  onClick={() => {
                    /*
                     * Wait for the answer rather than assuming one.
                     *
                     * This set `notified` before the call and ignored the
                     * result, so the screen said "Sent. Check the top-right of
                     * your screen" whether or not anything had been posted —
                     * which is how a broken notification path stayed invisible.
                     * Rust now reports whether it actually got one out.
                     */
                    void bridge
                      ?.notifySample()
                      .then((ok) => setNotified(ok ? "sent" : "failed"))
                      .catch(() => setNotified("failed"));
                  }}
                  className={cn(
                    "rounded-lg bg-white px-3 py-1.5 text-[0.8125rem] font-medium text-[#0B0B10]",
                    "cursor-pointer transition-opacity duration-150 hover:opacity-90",
                  )}
                >
                  {notified === "failed" && "Try again"}
                  {notified === "sent" && "Send another"}
                  {notified === null && "Send a test notification"}
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
            {pickerKey === null ? (
              /*
               * Every candidate was taken.
               *
               * Waiting on a keypress that provably cannot arrive is the dead
               * end this screen used to be. Say so, and let the person past —
               * the picker still opens from the pill and the tray.
               */
              <>
                <p className="max-w-[42ch] text-[0.9375rem] leading-relaxed text-white/60">
                  Another app already owns every shortcut Sidq tried, so there is
                  no key to press here. Open the picker from the pill at the top
                  of your screen, or from the menu bar icon.
                </p>
                <div className="mt-7">
                  <PrimaryAction label="Continue" onClick={advance} />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  {pillCombo.meta && <Key lit={pillGate.held.meta}>⌘</Key>}
                  {pillCombo.ctrl && <Key lit={pillGate.held.ctrl}>⌃</Key>}
                  {pillCombo.alt && <Key lit={pillGate.held.alt}>⌥</Key>}
                  {pillCombo.shift && <Key lit={pillGate.held.shift}>⇧</Key>}
                  <Key lit={pillGate.held.key}>
                    {pillCombo.code.replace("Key", "")}
                  </Key>
                </div>
                <div className="mt-7">
                  <PrimaryAction
                    label={`Press ${pickerKey ?? "⌘⇧K"} to continue`}
                    waiting
                  />
                </div>
                {shortcutStuck && (
                  <ShortcutEscape onSkip={advance} reason="collision" />
                )}

                {/*
                 * Taught here rather than on a step of its own.
                 *
                 * It is the same window and the same keycaps, and setup is
                 * seven screens already — an eighth to say one sentence is
                 * worse than the sentence sitting where somebody is looking at
                 * the thing it describes.
                 */}
                <p className="mt-9 flex flex-wrap items-center gap-x-2 gap-y-2 text-[0.875rem] text-white/45">
                  <span>It sits at the top of the screen. Move it with</span>
                  <Kbd>&#8984;</Kbd>
                  <span className="text-white/30">+</span>
                  <Kbd>&larr;</Kbd>
                  <Kbd>&rarr;</Kbd>
                  <Kbd>&uarr;</Kbd>
                  <Kbd>&darr;</Kbd>
                  <span>while it is open.</span>
                </p>
              </>
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
              className="size-1.5 rounded-full bg-lilac"
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
                ? "bg-lilac text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,0.8)]"
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
