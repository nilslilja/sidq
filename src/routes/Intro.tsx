import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { desktopBridge } from "@/lib/onboarding/bridge";
import { SidqMark } from "@/components/SidqMark";
import { HandwritingText } from "@/components/landing/HandwritingText";
import { cn } from "@/lib/cn";

/*
 * The first thing Sidq ever shows: a few seconds over the desktop, then setup.
 *
 * Only on the very first launch, and only ever alone. Rust opens this window
 * with nothing else on screen and opens setup when it closes, so it is never
 * drawn over the app, and the app never appears under it.
 *
 * It says what Sidq is the way the website does: the mark draws itself into
 * its point, the name is written by hand, and one line says what it does. The
 * sound is played by Rust (`start_intro`), because a webview will not start
 * audio without a click and this has to begin without one.
 *
 * Six seconds at most, and any key, click or the Skip button ends it at once.
 * Beats are shared with scripts/intro-sound.py.
 */

/** When the last thing on screen has had time to be read. */
export const INTRO_MS = 5800;
/** How long it takes to leave, on its own or when skipped. */
export const LEAVE_MS = 450;
/** Reduced motion: everything is simply there, for less time. */
const STILL_MS = 3200;

export function Intro() {
  const bridge = useMemo(() => desktopBridge(), []);
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);

  const finish = useCallback(
    (skipped: boolean) => {
      if (done.current) return;
      done.current = true;
      setLeaving(true);
      window.setTimeout(() => void bridge?.finishIntro(skipped), LEAVE_MS);
    },
    [bridge],
  );
  const skip = useCallback(() => finish(true), [finish]);

  useEffect(() => {
    void bridge?.startIntro();
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    const id = window.setTimeout(() => finish(false), (still ? STILL_MS : INTRO_MS) - LEAVE_MS);
    return () => window.clearTimeout(id);
  }, [bridge, finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skip]);

  return (
    <div
      data-transparent-window=""
      role="dialog"
      aria-label="Welcome to Sidq"
      onPointerDown={skip}
      className={cn("intro fixed inset-0 grid cursor-default select-none place-items-center", leaving && "intro-leaving")}
    >
      <div className="intro-scrim" aria-hidden="true" />

      <div className="relative flex flex-col items-center text-center">
        <SidqMark
          width={200}
          height={108}
          strokeWidth={18}
          strokeClassName="intro-draw"
          dotClassName="intro-dot"
          dotColor="#8b84ff"
          className="text-white"
        />
        <HandwritingText
          word="Sidq"
          delay={2.0}
          duration={0.9}
          strokeWidth={1.6}
          className="mt-8 text-white [font-size:5.5rem]"
        />
        <p className="intro-line intro-line-1">One memory for every AI you use.</p>
        <p className="intro-line intro-line-2">Tell one AI. The rest already know.</p>
      </div>

      <button
        type="button"
        onPointerDown={(e) => {
          e.stopPropagation();
          skip();
        }}
        className="intro-skip"
      >
        Skip
      </button>
    </div>
  );
}
