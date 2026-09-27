import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { PillPreview, type PillRow, type PillSaved } from "./PillPreview";
import { SidqDot } from "@/components/SidqDot";
import { cn } from "@/lib/cn";

/*
 * The whole product on a desktop, drawn rather than filmed.
 *
 * ── Why not a screen recording ───────────────────────────────────────────────
 * A recording puts somebody's wallpaper, windows and conversation titles on the
 * front page, for a product whose whole claim is that your conversations stay
 * yours, and it goes stale the moment the interface moves. This is built from
 * the components the app ships: the picker is `PillPreview` and the dot is
 * `SidqDot`, so it cannot drift from the product and it is sharp on any screen.
 *
 * ── Why it is one clock, not a list of beats ─────────────────────────────────
 * The previous version stepped through beats with timers and let CSS
 * transitions animate between them. Every beat changed the camera's zoom and
 * its pivot at once, so the frame jumped when the pivot moved and stuttered
 * while the browser re-rasterised a changing scale. It read as choppy because
 * it was.
 *
 * Now a single clock runs from 0 to the end of the loop on the display's own
 * frame callback, and everything that moves (camera, pointer, the picker
 * opening out of the dot, the second window arriving) is a pure function of
 * that clock. Nothing is triggered, so nothing can land late; the camera is a
 * translate and a scale about a fixed origin, so nothing jumps. React renders
 * only when something discrete changes: a caption, a highlighted row, the next
 * word of the reply.
 *
 * ── The curve ────────────────────────────────────────────────────────────────
 * Moves use a critically damped spring's response rather than an ease-in-out:
 * they leave at speed and settle without overshoot, the way Apple animates
 * anything that is not thrown. The one thing that is dropped into place, the
 * attached file, gets a little bounce, because it was.
 */

/* ── Timeline, in milliseconds ─────────────────────────────────────────────── */

const T = {
  keysIn: 900,
  keysDown: 1150,
  pickerOpen: 1300,
  pointToRow: 2300,
  rowReached: 3050,
  press: 3650,
  saved: 3800,
  pickerClose: 5300,
  claudeIn: 5450,
  pointToClip: 6300,
  clipClick: 7000,
  attached: 7100,
  pointToSend: 7700,
  send: 8250,
  reply: 8450,
  fadeOut: 15600,
  loop: 16200,
} as const;

/** How fast the reply streams, in words a second: about what a fast model does. */
const WORDS_PER_SECOND = 32;

const STAGE_W = 1040;
const STAGE_H = 650;

/* ── Content ──────────────────────────────────────────────────────────────── */

const ROWS: PillRow[] = [
  { title: "Why checkout silently loses payments", meta: "ChatGPT · yesterday · checkout" },
  { title: "Rewriting the onboarding emails", meta: "Claude · 2 days ago · marketing" },
  { title: "The Postgres index that never gets used", meta: "Codex · last week · api" },
];

const SAVED: PillSaved = {
  file: "checkout-payments-chatgpt.md",
  words: 18742,
  turns: 214,
  hours: 6,
};

export type ReplyLine = { text: string; code?: boolean };

const REPLY: ReplyLine[] = [
  { text: "Picking up from the idempotency work rather than starting over." },
  {
    text: "You were losing about 8% of payments because Stripe retries the webhook and the handler was not idempotent, so the second delivery overwrote the first with a stale status.",
  },
  { text: "The guard is small. Refuse any event you have already seen:" },
  { text: "const seen = await db.events.find(evt.id);", code: true },
  { text: "if (seen) return ok(); // a retry, not a new payment", code: true },
  { text: "await db.events.insert({ id: evt.id, status: evt.type });", code: true },
  {
    text: "That closes the leak going forward. The backfill only wants the events from before the fix shipped, not the whole table.",
  },
  { text: "Want the backfill query next, or the retry counts first?" },
];

const CAPTIONS: { at: number; text: string }[] = [
  { at: 0, text: "Sidq sits above every app, out of the way." },
  { at: T.pickerOpen, text: "One shortcut, from wherever you are." },
  { at: T.pointToRow + 300, text: "Every conversation, with every AI you use." },
  { at: T.press, text: "Pick one. The whole conversation is written to a file." },
  { at: T.claudeIn, text: "Open any other AI. A different company is fine." },
  { at: T.clipClick, text: "Attach it. Word for word, not a summary." },
  { at: T.reply, text: "It picks up mid-thought, knowing what was decided and why." },
];

/* ── Curves ───────────────────────────────────────────────────────────────── */

/** Progress through [from, to], clamped to 0..1. */
function span(t: number, from: number, to: number): number {
  if (t <= from) return 0;
  if (t >= to) return 1;
  return (t - from) / (to - from);
}

/**
 * A critically damped spring's step response, normalised to land exactly on 1.
 * Damping ratio 1: fast away, no overshoot, a long soft settle.
 */
function settle(p: number): number {
  const k = 7;
  const f = (x: number) => 1 - (1 + k * x) * Math.exp(-k * x);
  return f(p) / f(1);
}

/** An underdamped spring (damping ratio about 0.7), for something dropped in. */
function drop(p: number): number {
  if (p >= 1) return 1;
  const zeta = 0.7;
  const w = 11;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * p) * (Math.cos(wd * p) + ((zeta * w) / wd) * Math.sin(wd * p));
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/*
 * Where the camera looks, in stage pixels, and how close. Keyed on time; the
 * camera eases between consecutive shots with `settle`. The wide shot is the
 * whole desktop; the close ones centre the picker, then the reply.
 */
type Shot = { at: number; until: number; x: number; y: number; s: number };
const SHOTS: Shot[] = [
  { at: 0, until: 0, x: STAGE_W / 2, y: STAGE_H / 2, s: 1 },
  { at: T.pickerOpen, until: T.pickerOpen + 900, x: 520, y: 170, s: 1.16 },
  { at: T.pickerClose, until: T.pickerClose + 900, x: STAGE_W / 2, y: STAGE_H / 2, s: 1 },
  { at: T.reply, until: T.reply + 1200, x: 600, y: 360, s: 1.1 },
];

function camera(t: number, boost: number) {
  let from = SHOTS[0];
  let to = SHOTS[0];
  for (let i = 1; i < SHOTS.length; i += 1) {
    if (t >= SHOTS[i].at) {
      from = SHOTS[i - 1];
      to = SHOTS[i];
    }
  }
  const p = to === from ? 1 : settle(span(t, to.at, to.until));
  const s = lerp(from.s, to.s, p) * boost;
  const cx = lerp(from.x, to.x, p);
  const cy = lerp(from.y, to.y, p);
  // Centre the shot, but never past the edge of the desktop.
  const x = Math.min(0, Math.max(STAGE_W - STAGE_W * s, STAGE_W / 2 - cx * s));
  const y = Math.min(0, Math.max(STAGE_H - STAGE_H * s, STAGE_H / 2 - cy * s));
  return { x, y, s };
}

/*
 * The pointer's stops. Between two stops it travels on a shallow arc, because a
 * hand on a trackpad never moves in a ruled line.
 */
type Stop = { at: number; until: number; x: number; y: number };
const POINTER: Stop[] = [
  { at: 0, until: 0, x: 640, y: 470 },
  { at: T.pointToRow, until: T.rowReached, x: 446, y: 100 },
  { at: T.pickerClose + 200, until: T.pickerClose + 900, x: 560, y: 380 },
  // Measured off the rendered windows: the paperclip, then send.
  { at: T.pointToClip, until: T.clipClick - 40, x: 214, y: 555 },
  { at: T.pointToSend, until: T.send - 60, x: 822, y: 555 },
];

function pointer(t: number) {
  let from = POINTER[0];
  let to = POINTER[0];
  for (let i = 1; i < POINTER.length; i += 1) {
    if (t >= POINTER[i].at) {
      from = POINTER[i - 1];
      to = POINTER[i];
    }
  }
  const p = to === from ? 1 : settle(span(t, to.at, to.until));
  const arc = Math.sin(Math.PI * p) * Math.min(40, Math.hypot(to.x - from.x, to.y - from.y) * 0.08);
  return { x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p) - arc };
}

/* ── The clock ────────────────────────────────────────────────────────────── */

/**
 * Milliseconds into the loop, advanced on the display's frame callback while
 * the film is on screen, and parked while it is not. Under reduced motion it
 * holds the last frame, which is the whole story in one picture.
 */
function useFilmClock(running: boolean, still: boolean): MotionValue<number> {
  const clock = useMotionValue(still ? T.fadeOut - 1 : 0);

  useEffect(() => {
    /*
     * Development only: `?film=4000` freezes the film at 4 seconds, so any frame
     * can be looked at on its own. Stripped from the production build.
     */
    if (import.meta.env.DEV) {
      const frozen = new URLSearchParams(window.location.search).get("film");
      if (frozen !== null) {
        clock.set(Number(frozen));
        return;
      }
    }
    if (still) {
      clock.set(T.fadeOut - 1);
      return;
    }
    if (!running) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // A dropped frame or a background tab should not skip a scene.
      const dt = Math.min(64, now - last);
      last = now;
      clock.set((clock.get() + dt) % T.loop);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clock, running, still]);

  return clock;
}

/** What the discrete parts of the frame are showing at time `t`. */
function snapshot(t: number) {
  const words = t < T.reply ? 0 : Math.floor(((t - T.reply) / 1000) * WORDS_PER_SECOND);
  let caption = 0;
  for (let i = 0; i < CAPTIONS.length; i += 1) if (t >= CAPTIONS[i].at) caption = i;
  return {
    caption,
    keysDown: t >= T.keysDown && t < T.keysDown + 260,
    splash: t >= T.keysDown ? 1 : 0,
    hover: t >= T.rowReached && t < T.pickerClose ? 0 : null,
    press: t >= T.press && t < T.press + 160,
    // The pointer's own press: on the row, the paperclip and send.
    click:
      (t >= T.press && t < T.press + 160) ||
      (t >= T.clipClick && t < T.clipClick + 140) ||
      (t >= T.send && t < T.send + 140),
    claude: t >= T.claudeIn + 300,
    saved: t >= T.saved,
    attached: t >= T.attached,
    sent: t >= T.send,
    words,
  };
}

type Snapshot = ReturnType<typeof snapshot>;

function same(a: Snapshot, b: Snapshot): boolean {
  return (
    a.caption === b.caption &&
    a.keysDown === b.keysDown &&
    a.splash === b.splash &&
    a.hover === b.hover &&
    a.press === b.press &&
    a.click === b.click &&
    a.claude === b.claude &&
    a.saved === b.saved &&
    a.attached === b.attached &&
    a.sent === b.sent &&
    a.words === b.words
  );
}

/* ── Streaming ────────────────────────────────────────────────────────────── */

export function sliceIntoLines(lines: ReplyLine[], shown: number) {
  let left = shown;
  return lines.map((line) => {
    const words = line.text.split(" ");
    const take = Math.max(0, Math.min(words.length, left));
    left -= words.length;
    return {
      text: words.slice(0, take).join(" "),
      done: take === words.length,
      code: line.code === true,
    };
  });
}

type Streamed = ReturnType<typeof sliceIntoLines>;

/* ── The film ─────────────────────────────────────────────────────────────── */

export function HandoverFilm({ className }: { className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  const [visible, setVisible] = useState(false);
  const reduce = useReducedMotion() === true;

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setFit(el.clientWidth / STAGE_W);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.2,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const clock = useFilmClock(visible, reduce);

  /*
   * On a phone the desktop is a third of its size and nothing in it can be
   * read, so the camera works twice as close and follows the action instead of
   * showing the room.
   */
  const boost = fit < 0.6 ? 2 : 1;

  const camX = useTransform(clock, (t) => camera(t, boost).x);
  const camY = useTransform(clock, (t) => camera(t, boost).y);
  const camS = useTransform(clock, (t) => camera(t, boost).s);
  const ptrX = useTransform(clock, (t) => pointer(t).x);
  const ptrY = useTransform(clock, (t) => pointer(t).y);

  // The picker grows out of the dot and goes back into it: same anchor both ways.
  const pickerOpen = useTransform(clock, (t) =>
    t < T.pickerClose
      ? settle(span(t, T.pickerOpen, T.pickerOpen + 520))
      : 1 - settle(span(t, T.pickerClose, T.pickerClose + 380)),
  );
  const pickerScale = useTransform(pickerOpen, (p) => lerp(0.18, 1, p));
  const pickerOpacity = useTransform(pickerOpen, (p) => Math.min(1, p * 2.2));
  const pickerBlur = useTransform(pickerOpen, (p) => `blur(${((1 - p) * 8).toFixed(2)}px)`);
  // The bar becomes the picker, as the real window does: the dot gives way to it.
  const dotOpacity = useTransform(pickerOpen, (p) => 1 - Math.min(1, p * 3));

  const claudeIn = useTransform(clock, (t) => settle(span(t, T.claudeIn, T.claudeIn + 800)));
  const claudeX = useTransform(claudeIn, (p) => lerp(90, 0, p));
  const claudeOpacity = useTransform(claudeIn, (p) => Math.min(1, p * 1.8));

  const keysOpacity = useTransform(clock, (t) =>
    t < T.keysIn || t > T.keysDown + 900
      ? 0
      : Math.min(settle(span(t, T.keysIn, T.keysIn + 250)), 1 - span(t, T.keysDown + 600, T.keysDown + 900)),
  );
  const keysY = useTransform(keysOpacity, (o) => lerp(10, 0, o));

  const chip = useTransform(clock, (t) => drop(span(t, T.attached, T.attached + 700)));
  const chipScale = useTransform(chip, (p) => lerp(0.6, 1, p));
  const chipOpacity = useTransform(chip, (p) => Math.min(1, p * 3));

  const frameOpacity = useTransform(clock, (t) =>
    t < 400 ? span(t, 0, 400) : 1 - span(t, T.fadeOut, T.loop - 80),
  );
  const progress = useTransform(clock, (t) => t / T.loop);

  const [shot, setShot] = useState<Snapshot>(() => snapshot(clock.get()));
  useMotionValueEvent(clock, "change", (t) => {
    const next = snapshot(t);
    setShot((was) => (same(was, next) ? was : next));
  });

  const streamed = useMemo(() => sliceIntoLines(REPLY, shot.words), [shot.words]);

  return (
    <div ref={wrap} className={cn("w-full", className)}>
      <div style={{ height: STAGE_H * fit }} className="relative w-full">
        <div
          style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${fit})`, transformOrigin: "top left" }}
          className="absolute left-0 top-0 overflow-hidden rounded-[18px] shadow-[0_0_0_1px_rgba(18,18,26,0.08),0_40px_90px_-40px_rgba(18,18,26,0.45)]"
          aria-hidden="true"
        >
          <motion.div
            className="absolute left-0 top-0 will-change-transform"
            style={{ width: STAGE_W, height: STAGE_H, x: camX, y: camY, scale: camS, originX: 0, originY: 0 }}
          >
            <motion.div className="absolute inset-0" style={{ opacity: frameOpacity }}>
              <Wallpaper />
              <MenuBar />

              <ChatGPTWindow dimmed={shot.claude} />

              <motion.div
                className="absolute left-[150px] top-[118px] z-20 w-[740px]"
                style={{ x: claudeX, opacity: claudeOpacity }}
              >
                <ClaudeWindow attached={shot.attached} sent={shot.sent} streamed={streamed} chipScale={chipScale} chipOpacity={chipOpacity} />
              </motion.div>

              {/* The dot, where the real one floats: centred, under the menu bar. */}
              <motion.div
                className="absolute left-1/2 top-[34px] z-40 grid size-6 -translate-x-1/2 place-items-center"
                style={{ opacity: dotOpacity }}
              >
                <SidqDot mood={shot.splash && !shot.saved ? "hop" : "idle"} splash={shot.splash} />
              </motion.div>

              <motion.div
                className="absolute left-1/2 top-[32px] z-30 w-[440px] -translate-x-1/2"
                style={{
                  scale: pickerScale,
                  opacity: pickerOpacity,
                  filter: pickerBlur,
                  originX: 0.5,
                  originY: 0,
                }}
              >
                <PillPreview
                  rows={ROWS}
                  selected={shot.hover}
                  pressed={shot.press}
                  saved={shot.saved ? SAVED : undefined}
                  footer={shot.saved ? "Ready to attach" : "The conversation itself, not a summary"}
                />
              </motion.div>

              <motion.div
                className="absolute bottom-[34px] left-1/2 z-50 flex -translate-x-1/2 gap-1.5 rounded-[14px] bg-white/80 p-1.5 shadow-[0_0_0_1px_rgba(18,18,26,0.08),0_18px_40px_-18px_rgba(18,18,26,0.45)] backdrop-blur-xl"
                style={{ opacity: keysOpacity, y: keysY }}
              >
                {["⌘", "⇧", "K"].map((k) => (
                  <span
                    key={k}
                    className={cn(
                      "grid h-10 min-w-10 place-items-center rounded-[9px] px-2 font-sans text-[1rem] font-medium transition-[background-color,color,translate] duration-100",
                      shot.keysDown ? "translate-y-px bg-[#2448E8] text-white" : "bg-[#F4F3EF] text-ink",
                    )}
                  >
                    {k}
                  </span>
                ))}
              </motion.div>

              <motion.div className="absolute left-0 top-0 z-[60]" style={{ x: ptrX, y: ptrY }}>
                <Pointer pressed={shot.click} />
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      <p
        key={shot.caption}
        className="film-caption mx-auto mt-6 flex min-h-[3.25rem] max-w-[44ch] items-start justify-center text-center text-[0.9375rem] leading-relaxed text-ink/60"
      >
        {CAPTIONS[shot.caption].text}
      </p>
      <div className="mx-auto mt-1 h-px w-24 overflow-hidden bg-ink/10" aria-hidden="true">
        <motion.div className="h-full origin-left bg-ink/45" style={{ scaleX: progress }} />
      </div>
    </div>
  );
}

/* ── The desktop ──────────────────────────────────────────────────────────── */

/** The site's paper, lit from the top left like a desk by a window. */
function Wallpaper() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          "radial-gradient(70% 60% at 18% 8%, rgba(255,255,255,0.9), rgba(255,255,255,0) 60%), linear-gradient(180deg, #EEECE6 0%, #E3E0D8 100%)",
      }}
    />
  );
}

function MenuBar() {
  return (
    <div className="absolute inset-x-0 top-0 z-10 flex h-[26px] items-center gap-5 bg-white/55 px-4 text-[0.75rem] text-ink/80 backdrop-blur-xl">
      <svg viewBox="0 0 14 17" className="h-[13px] fill-ink/85" aria-hidden="true">
        <path d="M11.6 9c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.7-1.3-.1-2.5.8-3.1.8-.7 0-1.6-.8-2.7-.7C3.2 4.2 1.9 5 1.2 6.3c-1.5 2.6-.4 6.4 1.1 8.5.7 1 1.5 2.2 2.6 2.1 1-.1 1.4-.7 2.7-.7s1.6.7 2.7.6c1.1 0 1.8-1 2.5-2 .8-1.2 1.1-2.3 1.1-2.4 0 0-2.3-.9-2.3-3.4ZM9.5 2.9C10.1 2.2 10.5 1.2 10.4.2c-.9 0-1.9.6-2.5 1.3-.5.6-1 1.6-.9 2.5 1 .1 1.9-.5 2.5-1.1Z" />
      </svg>
      <span className="font-semibold text-ink">Safari</span>
      {["File", "Edit", "View", "History", "Window"].map((m) => (
        <span key={m}>{m}</span>
      ))}
      <span className="ml-auto tabular-nums">Tue 9:41</span>
    </div>
  );
}

function TrafficLights({ dim = false }: { dim?: boolean }) {
  return (
    <span className="flex gap-2" aria-hidden="true">
      {(dim ? ["#D9D7D1", "#D9D7D1", "#D9D7D1"] : ["#FF5F57", "#FEBC2E", "#28C840"]).map((c, i) => (
        <span key={i} className="size-3 rounded-full transition-colors duration-500" style={{ background: c }} />
      ))}
    </span>
  );
}

function Browser({
  url,
  dim = false,
  children,
}: {
  url: string;
  dim?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[12px] bg-white shadow-[0_0_0_1px_rgba(18,18,26,0.1),0_30px_70px_-30px_rgba(18,18,26,0.5)]">
      <div className="flex h-10 items-center gap-4 border-b border-ink/[0.07] bg-[#F6F5F2] px-4">
        <TrafficLights dim={dim} />
        <span className="mx-auto flex h-6 w-[46%] items-center justify-center rounded-[7px] bg-ink/[0.05] text-[0.6875rem] text-ink/55">
          {url}
        </span>
        <span className="w-[52px]" />
      </div>
      {children}
    </div>
  );
}

function ChatGPTWindow({ dimmed }: { dimmed: boolean }) {
  return (
    <div
      className={cn(
        "absolute left-[60px] top-[70px] z-10 w-[640px] transition-[opacity,filter] duration-700",
        dimmed ? "opacity-80" : "opacity-100",
      )}
    >
      <Browser url="chatgpt.com" dim={dimmed}>
        <div className="h-[380px] space-y-3 overflow-hidden px-10 pt-6 text-[0.8125rem] leading-relaxed text-ink [mask-image:linear-gradient(to_bottom,black_75%,transparent)]">
          <p className="flex items-center gap-2 text-[0.75rem] font-medium text-ink/55">
            <img src="/openai-logo.svg" alt="" width={14} height={14} className="size-3.5" />
            Why checkout silently loses payments
          </p>
          <Turn you>Payments show as succeeded in Stripe but never reach our orders table. Maybe 1 in 12.</Turn>
          <Turn>That pattern usually means the webhook handler is not idempotent. Stripe retries a delivery if you answer slowly, and a second, stale delivery can overwrite the first.</Turn>
          <Turn you>Yes, we answer after writing to the database. So key on the event id?</Turn>
          <Turn>Key on the event id and store it before anything else. Then backfill what was lost before the fix.</Turn>
        </div>
      </Browser>
    </div>
  );
}

function Turn({ you = false, children }: { you?: boolean; children: React.ReactNode }) {
  return you ? (
    <p className="ml-auto w-fit max-w-[78%] rounded-[16px] bg-[#F1F0EC] px-3.5 py-2">{children}</p>
  ) : (
    <p className="max-w-[92%] text-ink/85">{children}</p>
  );
}

function ClaudeWindow({
  attached,
  sent,
  streamed,
  chipScale,
  chipOpacity,
}: {
  attached: boolean;
  sent: boolean;
  streamed: Streamed;
  chipScale: MotionValue<number>;
  chipOpacity: MotionValue<number>;
}) {
  return (
    <Browser url="claude.ai/new">
      <div className="relative h-[450px] bg-[#FAF9F5]">
        <div className="h-[350px] overflow-hidden px-12 pt-7 [mask-image:linear-gradient(to_bottom,black_88%,transparent)]">
          {!sent ? (
            <p className="pt-20 text-center font-display text-[1.5rem] font-semibold tracking-[-0.03em] text-ink/80">
              <img src="/claude-logo.svg" alt="" width={22} height={22} className="mr-2 inline size-[22px] -translate-y-0.5" />
              How can I help you today?
            </p>
          ) : (
            <div>
              <div className="flex justify-end">
                <FileChip />
              </div>
              <div className="mt-4 space-y-2.5 text-[0.8125rem] leading-[1.55] text-ink">
                {streamed.map((line, i) =>
                  line.text ? (
                    line.code ? (
                      <pre
                        key={i}
                        className={cn(
                          "overflow-hidden whitespace-pre bg-[#F1F0EC] px-3 font-mono text-[0.71875rem] leading-[1.7] text-ink",
                          streamed[i - 1]?.code ? "-mt-2.5 pt-0" : "rounded-t-[8px] pt-2",
                          streamed[i + 1]?.code && streamed[i + 1]?.text ? "pb-0" : "rounded-b-[8px] pb-2",
                        )}
                      >
                        <Code source={line.text} />
                        {!line.done && <span className="film-caret" />}
                      </pre>
                    ) : (
                      <p key={i}>
                        {line.text}
                        {!line.done && <span className="film-caret" />}
                      </p>
                    )
                  ) : null,
                )}
              </div>
            </div>
          )}
        </div>

        <div className="absolute inset-x-10 bottom-6 rounded-[16px] bg-white p-3 shadow-[0_0_0_1px_rgba(18,18,26,0.1),0_4px_14px_-6px_rgba(18,18,26,0.15)]">
          {attached && !sent && (
            <motion.div style={{ scale: chipScale, opacity: chipOpacity, originX: 0, originY: 1 }} className="mb-2 w-fit">
              <FileChip />
            </motion.div>
          )}
          <div className="flex items-center gap-3">
            <span className="grid size-7 place-items-center rounded-full text-ink/50 ring-1 ring-inset ring-ink/12">
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M21 11.5 12.9 19.6a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L10.5 17a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4" />
              </svg>
            </span>
            <span className="flex-1 text-[0.8125rem] text-ink/40">
              {attached && !sent ? "Carry on from here" : "Reply to Claude…"}
            </span>
            <span
              className={cn(
                "grid size-7 place-items-center rounded-[9px] text-[0.8125rem] text-white transition-colors duration-200",
                attached && !sent ? "bg-[#C96442]" : "bg-[#C96442]/40",
              )}
            >
              ↑
            </span>
          </div>
        </div>
      </div>
    </Browser>
  );
}

function FileChip() {
  return (
    <span className="inline-flex items-center gap-2.5 rounded-[10px] bg-white px-2.5 py-2 shadow-[0_0_0_1px_rgba(18,18,26,0.1)]">
      <span className="grid h-8 w-7 place-items-center rounded-[5px] bg-[#2448E8] text-[0.5625rem] font-semibold text-white">MD</span>
      <span className="text-left">
        <span className="block text-[0.71875rem] font-medium leading-tight text-ink">{SAVED.file}</span>
        <span className="block text-[0.65625rem] leading-tight text-ink/50">
          {SAVED.words.toLocaleString("en-US")} words · the whole conversation
        </span>
      </span>
    </span>
  );
}

/*
 * Just enough highlighting to read as code: keywords in the site's blue,
 * comments quiet. A real editor's palette in a real editor's weight.
 */
const KEYWORD = /\b(const|await|if|return)\b/g;

function Code({ source }: { source: string }) {
  const [code, comment] = source.split(/(?=\/\/)/);
  const parts = code.split(KEYWORD);
  return (
    <>
      {parts.map((part, i) =>
        ["const", "await", "if", "return"].includes(part) ? (
          <span key={i} className="text-[#2448E8]">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
      {comment && <span className="text-ink/40">{comment}</span>}
    </>
  );
}

/** The macOS arrow, drawn: white with a dark edge, and a shadow under it. */
function Pointer({ pressed }: { pressed: boolean }) {
  return (
    <svg
      viewBox="0 0 16 24"
      className={cn(
        "h-[22px] drop-shadow-[0_2px_3px_rgba(0,0,0,0.3)] transition-[scale] duration-100",
        pressed ? "scale-90" : "scale-100",
      )}
      aria-hidden="true"
    >
      <path d="M1 1v17.5l4.4-4.1 2.9 6.8 3-1.3-2.9-6.6h6.1Z" fill="#fff" stroke="#12121A" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}
