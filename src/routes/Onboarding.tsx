import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shell, Instruction, PrimaryAction, Key } from "@/components/onboarding/Shell";
import {
  SamePageFilm,
  ReadingFilm,
  DoubleTapFilm,
  BriefedFilm,
  type FoundSource,
} from "@/components/onboarding/Films";
import { ConnectModels } from "@/components/onboarding/ConnectModels";
import { LetAiAsk } from "@/components/onboarding/LetAiAsk";
import { HandwritingText } from "@/components/landing/HandwritingText";
import { PillPreview } from "@/components/landing/PillPreview";
import { SidqDot } from "@/components/SidqDot";
import type { WorkSession } from "@/lib/companion/work-history";
import { desktopBridge } from "@/lib/onboarding/bridge";
import { adoptSession, rememberDisplayName } from "@/lib/supabase";
import { cn } from "@/lib/cn";
import {
  STEPS,
  stepIndex,
  nextStep,
  DISCOVERY,
  type StepId,
} from "@/lib/onboarding/steps";

/*
 * First run. See `steps.ts` for why it is four screens.
 *
 * Every screen is one instruction and one action on the left and a film of
 * that instruction on the right. Two of the four move on by themselves: sign-in
 * advances when the browser comes back, and the try-it screen advances the
 * moment a real grab or handover happens. Somebody who does what the screen
 * says never has to find a Next button.
 */

/** How long the "that's it" moment stays before the next screen arrives. */
const LANDED_HOLD_MS = 2400;

/** How often the try-it screen looks for a handover made in the picker. */
const HANDOVER_POLL_MS = 1500;

/** The assistants the reading film ticks off, in the order people use them. */
const FILM_SOURCES: Omit<FoundSource, "count">[] = [
  { id: "claude-code", label: "Claude Code", logo: "/claude-logo.svg" },
  { id: "chatgpt", label: "ChatGPT", logo: "/openai-logo.svg" },
  { id: "cursor", label: "Cursor" },
  { id: "gemini", label: "Gemini", logo: "/gemini-logo.svg" },
  { id: "codex", label: "Codex", logo: "/openai-logo.svg" },
  { id: "grok", label: "Grok", logo: "/grok-logo.svg" },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const bridge = useMemo(desktopBridge, []);

  const [step, setStep] = useState<StepId>("signin");
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [taps, setTaps] = useState<[string, string]>(["right ⌘", "left ⌃"]);
  const [pickerKey, setPickerKey] = useState<string | null>("⌘⇧K");
  const [gestureWorks, setGestureWorks] = useState<boolean | null>(null);
  const [found, setFound] = useState<WorkSession[]>([]);
  const [total, setTotal] = useState(0);
  const [landed, setLanded] = useState<"grab" | "handover" | null>(null);
  const [discovery, setDiscovery] = useState<string | null>(null);
  const [counting, setCounting] = useState(false);

  const index = stepIndex(step);

  const advance = useCallback(() => {
    const next = nextStep(step);
    if (next) {
      setStep(next);
      return;
    }
    if (bridge) {
      void bridge.countReady();
      void bridge.finish();
    } else navigate("/today");
  }, [step, navigate, bridge]);

  const back = index > 0 ? () => setStep(STEPS[index - 1].id) : undefined;

  // Rust reads the step on screen: "handover" is the one where ⌘⇧K has to open
  // the real picker rather than be swallowed. Counted by the same name.
  useEffect(() => {
    void bridge?.setStep(step);
    void bridge?.countSetupStep(step);
  }, [step, bridge]);

  useEffect(() => {
    let alive = true;
    void bridge
      ?.pickerShortcut()
      .then((k) => alive && setPickerKey(k))
      .catch(() => alive && setPickerKey(null));
    void bridge?.tapKeys().then((t) => alive && setTaps(t));
    return () => {
      alive = false;
    };
  }, [bridge]);

  /*
   * The double tap reads the frontmost window, which needs Accessibility. Asked
   * on every screen change, since it is granted on the screen before this one
   * and in another application.
   */
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

  /*
   * ── Reading, only once somebody is standing on the screen that says so ──
   *
   * Not on sign-in. `recent_work` reads transcripts, and the screen that shows
   * what was found is the consent for reading them; asking before it is up is
   * the bug a user once caught. Pinned by Onboarding.test.tsx.
   */
  useEffect(() => {
    if (!bridge || step !== "sources") return;
    void bridge
      .recentWork(50)
      .then((rows) => setFound(rows as WorkSession[]))
      .catch(() => undefined);
    void bridge
      .indexStats()
      .then(([conversations]) => setTotal(conversations))
      .catch(() => undefined);
  }, [bridge, step]);

  const filmSources = useMemo<FoundSource[]>(() => {
    const counts = new Map<string, number>();
    for (const s of found) {
      const key = s.source ?? "claude-code";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return FILM_SOURCES.map((s) => ({ ...s, count: counts.get(s.id) ?? 0 }));
  }, [found]);

  useEffect(() => {
    if (step !== "signin" || !bridge) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void bridge
      .onSignedIn(
        (urls) =>
          void adoptSession(urls).then(() => {
            rememberDisplayName();
            advance();
          }),
      )
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [step, bridge, advance]);

  /*
   * ── Try it: advance on the real thing ──────────────────────────────────
   *
   * Either route counts. A double tap arrives as `sidq:grabbed`; a handover
   * made in the picker shows up in the handover log, which is polled because
   * the picker is another window. The first one to happen wins, the screen
   * says so, and the next screen follows on its own.
   */
  useEffect(() => {
    if (!bridge || step !== "handover" || landed) return;

    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void bridge
      .onGrabbed(() => setLanded("grab"))
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });

    /*
     * Against a baseline, not against zero. Somebody reinstalling already has
     * handovers in the log, and "one exists" would land them on "That's it"
     * before they had done anything.
     */
    let before: number | null = null;
    const look = () =>
      void bridge.recentHandovers().then((rows) => {
        if (before === null) before = rows.length;
        else if (rows.length > before) setLanded((was) => was ?? "handover");
      });
    look();
    const timer = window.setInterval(look, HANDOVER_POLL_MS);

    return () => {
      cancelled = true;
      unlisten?.();
      window.clearInterval(timer);
    };
  }, [bridge, step, landed]);

  useEffect(() => {
    if (!landed || step !== "handover") return;
    const id = window.setTimeout(advance, LANDED_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [landed, step, advance]);

  const finish = useCallback(() => {
    try {
      if (discovery) localStorage.setItem("sidq.discovery", discovery);
    } catch {
      /* private mode; the answer is ours, not theirs, so losing it is fine */
    }
    void bridge?.setCounting(counting);
    advance();
  }, [discovery, counting, bridge, advance]);

  return <Shell step={step} onBack={back} left={renderLeft()} right={renderRight()} />;

  function renderLeft() {
    switch (step) {
      case "signin":
        return (
          <Instruction
            title={
              <>
                Your AIs, finally on the same{" "}
                <HandwritingText className="-mb-[0.1em] text-[#2448E8] [font-size:1.12em]" delay={0.5} />
              </>
            }
            subtitle="Tell one AI. The rest already know. Sign in once; it opens your browser and comes straight back."
            footer={<Promises />}
          >
            <PrimaryAction
              label={signingIn ? "Waiting for the browser" : "Sign in"}
              waiting={signingIn}
              onClick={() => {
                // In a browser tab there is nothing to sign in to, and the flow
                // has to stay walkable at localhost:5173/welcome.
                if (!bridge) {
                  advance();
                  return;
                }
                setSigningIn(true);
                setSignInError(null);
                void bridge.openSignIn().catch((err: unknown) => {
                  setSigningIn(false);
                  setSignInError(
                    err instanceof Error ? err.message : String(err ?? "Could not open sign-in."),
                  );
                });
              }}
            />
            {signInError && (
              <p role="alert" className="mt-4 text-[0.8125rem] leading-relaxed text-[#B23B32]">
                {signInError}
              </p>
            )}
          </Instruction>
        );

      case "sources":
        return (
          <Instruction
            title={found.length > 0 ? "Sidq already found your AIs" : "Connect your AIs"}
            subtitle="The ones on this Mac are read with nothing to set up. The ones in a browser need one switch."
          >
            <ConnectModels found={Math.max(total, found.length)} onContinue={advance} />
            <LetAiAsk bridge={bridge} />
          </Instruction>
        );

      case "handover":
        return landed ? (
          <Landed kind={landed} onContinue={advance} />
        ) : (
          <Instruction
            title={
              gestureWorks ? (
                <>Double-tap {taps[0]}</>
              ) : (
                <>Press {pickerKey ?? "⌘⇧K"}</>
              )
            }
            subtitle={
              gestureWorks
                ? "In any AI you have open. Then open a new chat in another one: the whole conversation is already there."
                : "From inside anything. Pick a conversation, press Enter, and it is ready to paste into any AI."
            }
          >
            <div className="flex items-center gap-2">
              {gestureWorks ? (
                <>
                  <Key>{taps[0]}</Key>
                  <Key>{taps[0]}</Key>
                </>
              ) : (
                (pickerKey ?? "⌘⇧K").split("").map((k, i) => <Key key={i}>{k}</Key>)
              )}
            </div>
            <div className="mt-8">
              <PrimaryAction label="Waiting for your first one" waiting />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.8125rem]">
              {gestureWorks && pickerKey && (
                <button
                  onClick={() => void bridge?.openPicker()}
                  className="cursor-pointer text-ink/55 underline-offset-4 transition-colors duration-150 hover:text-ink hover:underline"
                >
                  Or press {pickerKey} and pick one
                </button>
              )}
              <button
                onClick={advance}
                className="cursor-pointer text-ink/40 underline-offset-4 transition-colors duration-150 hover:text-ink hover:underline"
              >
                Skip for now
              </button>
            </div>
          </Instruction>
        );

      case "discover":
        return (
          <Instruction
            title="You're set. The rest runs itself."
            footer={
              <PrimaryAction label="Start using Sidq" onClick={finish} />
            }
          >
            <ul className="border-y border-ink/10">
              <Runs keys={gestureWorks === false ? "needs reading on" : "automatic"}>
                Every new chat starts with your project, unsent.
              </Runs>
              <Runs keys={`${taps[0]} ×2`}>Grab a chat. The next new chat gets it.</Runs>
              <Runs keys={pickerKey ?? undefined}>Carry any conversation anywhere.</Runs>
            </ul>

            <p className="mt-7 text-[0.8125rem] text-ink/50">How did you find Sidq? Optional.</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {DISCOVERY.map((option) => {
                const on = discovery === option.id;
                return (
                  <button
                    key={option.id}
                    onClick={() => setDiscovery(on ? null : option.id)}
                    aria-pressed={on}
                    className={cn(
                      "h-7 cursor-pointer rounded-[8px] px-2.5 text-[0.75rem] transition-[background-color,color,transform,translate,scale] duration-150 active:scale-[0.97]",
                      on ? "bg-ink text-paper" : "bg-ink/[0.05] text-ink/65 hover:bg-ink/[0.09] hover:text-ink",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            {/*
             * Off unless ticked. The default is the basis of the privacy page:
             * a fresh install that counted anything would make it false on
             * first launch.
             */}
            <label className="mt-5 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={counting}
                onChange={(e) => setCounting(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[#2448E8]"
              />
              <span className="text-[0.8125rem] leading-relaxed text-ink/55">
                Count how I use Sidq. Numbers only, never a conversation, title
                or filename. Switch it off any time.
              </span>
            </label>
          </Instruction>
        );
    }
  }

  function renderRight() {
    switch (step) {
      case "signin":
        return <SamePageFilm />;
      case "sources":
        return <ReadingFilm sources={filmSources} />;
      case "handover":
        return gestureWorks === false ? (
          <PillPreview
            rows={[
              { title: "Stripe webhook retries", meta: "2h session · shop" },
              { title: "Thesis outline, urban heat islands", meta: "40 messages · thesis" },
              { title: "Launch email in our voice", meta: "30m · sidq" },
            ]}
            className="w-full max-w-[26rem]"
          />
        ) : (
          <DoubleTapFilm tapKey={taps[0]} />
        );
      case "discover":
        return <BriefedFilm />;
    }
  }
}

/**
 * What happens to your conversations, under the button rather than a page
 * before it. The page it replaces said the same three things and cost a click
 * before anything had happened.
 */
function Promises() {
  return (
    <ul className="space-y-2 border-t border-ink/10 pt-5 text-[0.8125rem] leading-relaxed text-ink/55">
      <li>
        <span className="text-ink">Read where they already are.</span> Your AIs
        write conversations to this Mac; Sidq reads those files into an index here.
      </li>
      <li>
        <span className="text-ink">Nothing is uploaded.</span> A handover is a file
        on your disk, and your conversations never leave this Mac.
      </li>
      <li className="text-ink/40">
        By continuing you agree to the Terms and the Privacy Policy.
      </li>
    </ul>
  );
}

/** One thing that now runs without being asked, with the key for it if any. */
function Runs({ keys, children }: { keys?: string; children: React.ReactNode }) {
  return (
    <li className="flex items-baseline gap-4 border-b border-ink/10 py-2.5 last:border-b-0">
      <span className="flex-1 text-[0.875rem] leading-snug text-ink/75">{children}</span>
      {keys && (
        <span className="shrink-0 pt-0.5 font-mono text-[0.75rem] text-[#2448E8]">{keys}</span>
      )}
    </li>
  );
}

/**
 * The moment it worked.
 *
 * The one place in setup that celebrates, because it is the one place where the
 * person did the real thing: a ring off the dot, a check that lands, and a line
 * saying where the conversation is now. The next screen follows by itself.
 */
function Landed({
  kind,
  onContinue,
}: {
  kind: "grab" | "handover";
  onContinue: () => void;
}) {
  return (
    <div role="status">
      <div className="landed relative grid size-16 place-items-center">
        <span aria-hidden="true" className="landed-ring absolute inset-0 rounded-full bg-[#2448E8]" />
        <span aria-hidden="true" className="landed-disc absolute inset-0 rounded-full bg-[#2448E8]" />
        <svg aria-hidden="true" viewBox="0 0 24 24" className="relative size-7 text-white">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            className="landed-check"
          />
        </svg>
        <span className="absolute -right-1 -top-1">
          <SidqDot mood="hop" splash={1} />
        </span>
      </div>
      <h1 className="mt-7 font-display text-[clamp(2.25rem,3.6vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.05em] text-ink">
        That&rsquo;s it.
      </h1>
      <p className="mt-4 max-w-[40ch] text-[1.0625rem] leading-relaxed text-ink/60">
        {kind === "grab"
          ? "Now open a new chat in any AI. The conversation lands there by itself, not sent. Or press ⌘V anywhere."
          : "It is on your clipboard and in your Downloads folder. Open any AI and press ⌘V."}
      </p>
      <div className="mt-9">
        <PrimaryAction label="Continue" onClick={onContinue} />
      </div>
    </div>
  );
}
