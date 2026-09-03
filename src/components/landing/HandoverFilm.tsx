import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PillPreview } from "./PillPreview";
import { MacDock } from "./MacDock";
import { cn } from "@/lib/cn";

/*
 * The whole product, in twenty two seconds, drawn rather than filmed.
 *
 * ── Why not a screen recording ───────────────────────────────────────────────
 *
 * A recording taken off a real machine puts somebody's wallpaper, their dock,
 * their open windows and the names of their actual conversations on the front
 * page. That is a privacy problem for a product whose entire claim is that your
 * conversations stay yours, and it is also unfixable: the file goes stale the
 * moment the interface moves and nobody re-records it.
 *
 * This is built from the same components the app ships, so it cannot drift, it
 * stays sharp on every display, and there is nothing in it that belongs to
 * anybody. The picker is `PillPreview`, which is the real thing.
 *
 * ── Why the handover text is generated, not written ──────────────────────────
 *
 * The output shown in the last scene is not marketing copy that resembles a
 * handover. It is the literal output of `compiler.rs`, produced by
 * `demo_sample::print_a_handover_for_the_website` and pasted here. Anybody who
 * installs Sidq and makes a handover gets a document in exactly this shape.
 * Writing a prettier version would be the one lie the page cannot afford.
 *
 * ── Why it zooms ─────────────────────────────────────────────────────────────
 *
 * The interesting parts are small: a bar 112 points wide, a row in a list, a
 * paperclip. Shown at desktop scale they are specks, and shown at full size
 * they lose the context that makes them mean anything. Moving between the two
 * is the only way to say "this lives on your desktop" and "this is what it
 * does" in the same shot.
 *
 * Zoom is one transform on one wrapper, so the whole thing stays on the
 * compositor. Everything inside is laid out once and never reflows.
 */

/*
 * One beat of the film.
 *
 * `at` is where the cursor goes, in percentages of the stage. The camera is
 * derived from it rather than authored separately: the shot is always centred
 * on the pointer, so wherever the cursor moves the frame follows and the viewer
 * never has to hunt for what changed. Authoring the two independently is what
 * made the first version feel like a slideshow with a mouse drawn on it.
 */
interface Beat {
  /** Milliseconds this beat holds before the next. */
  hold: number;
  /** Zoom for this beat. */
  scale: number;
  /** Where the pointer is, and therefore what the camera centres on. */
  at: { x: number; y: number };
  caption: string;
}

/*
 * The script.
 *
 * ── One length for every beat ────────────────────────────────────────────────
 *
 * The first version gave each beat whatever felt right — half a second here,
 * two and a bit there — and the result read as broken rather than as paced.
 * A viewer works out the rhythm of a loop in the first two beats and then
 * predicts it; when the third arrives early they read it as a stutter, not as
 * emphasis. So every beat is the same length. It is slower than the fastest
 * version and far calmer, and calm is what makes it look deliberate.
 *
 * The last beat is the exception, and it is not pacing: there is a reply to
 * read, and the loop restarting before somebody finishes reading it wastes the
 * only beat that closes the argument.
 *
 * ── Why it is this slow ──────────────────────────────────────────────────────
 *
 * Nearly three seconds a beat, with the camera taking two of them to move. That
 * is much slower than feels right while building it, and it is the difference
 * between a demo that looks eager and one that looks certain. Fast cuts read as
 * a product trying to hold your attention; a slow move reads as one that
 * assumes it already has it. The move is also almost always still going when
 * the beat ends, which is deliberate — there is never a moment of dead air
 * where the frame has arrived and nothing is happening yet.
 *
 * ── The pill opens on its own beat ───────────────────────────────────────────
 *
 * The camera used to push into the pill on the same beat the picker replaced
 * it, so it zoomed toward a bar that had already become a panel — which is what
 * made the move feel like it had missed. Beat 1 is the closed bar and nothing
 * else; the panel arrives on beat 2, after the camera has settled.
 */
const BEAT = 1500;

/*
 * ── The cursor and the selection are the same fact ───────────────────────────
 *
 * These y values are measured, not guessed: the three rows sit at 21.1%, 28.4%
 * and 35.7% of the stage, and the collapsed bar at 9.2%.
 *
 * That measurement is the fix for the worst thing in the earlier cut. The
 * cursor was placed by eye and the highlighted row was set by a separate rule,
 * so the pointer hovered near the middle row while the top row lit up, and then
 * the highlight moved again after the click. It read as a demo that had lost
 * track of itself, because it had: nothing tied the two together.
 *
 * Now one row is chosen — the checkout conversation, because that is the one
 * the reply at the end is about — and the cursor sits exactly on it from the
 * moment the list opens until the file is written. It never switches rows,
 * because a person picking a conversation does not either.
 */
const ROW_Y = [21.1, 28.4, 35.7];
const PICKED = 0;

/*
 * ── Quick, but not hurried ───────────────────────────────────────────────────
 *
 * Beats were 2900ms with a 2000ms camera move, which was calm and far too slow:
 * every step had a stretch of dead air after the move landed. 1500ms with a
 * 900ms move keeps the same easing — the part that makes it feel operated
 * rather than animated — while cutting the waiting.
 *
 * The two beats that hold longer earn it. The list needs long enough to read
 * three titles, and the reply needs long enough to read a reply.
 */
const BEATS: Beat[] = [
  { hold: BEAT, scale: 1, at: { x: 50, y: 55 }, caption: "It sits above everything, out of the way." },
  { hold: BEAT, scale: 1.7, at: { x: 50, y: 9.2 }, caption: "One shortcut, from wherever you are." },
  { hold: 2200, scale: 1.32, at: { x: 50, y: 28.4 }, caption: "Everything you have said, to every assistant." },
  { hold: BEAT, scale: 1.42, at: { x: 42, y: ROW_Y[PICKED] }, caption: "Pick the one you want to carry." },
  { hold: BEAT, scale: 1.42, at: { x: 42, y: ROW_Y[PICKED] }, caption: "It writes the whole conversation to a file." },
  { hold: BEAT, scale: 1, at: { x: 50, y: 55 }, caption: "Open anything else. A different company's model is fine." },
  { hold: BEAT, scale: 1.7, at: { x: 13, y: 87 }, caption: "Attach it." },
  { hold: 5200, scale: 1.06, at: { x: 50, y: 46 }, caption: "It picks up mid-thought, knowing what was decided and why." },
];

/*
 * Nothing here belongs to anybody.
 *
 * Three invented conversations, in the shape of work anybody visiting the page
 * will recognise. The titles are deliberately ordinary problems rather than
 * anything clever: the demo has to be legible to somebody who has never seen
 * the product, and a title they have to decode spends the attention the rest of
 * the shot needs.
 */
const ROWS = [
  { title: "Why checkout silently loses payments", meta: "ChatGPT · yesterday · checkout" },
  { title: "Rewriting the onboarding emails", meta: "Claude · 2 days ago · marketing" },
  { title: "The Postgres index that never gets used", meta: "Codex · last week · api" },
];

/*
 * ── What the last shot shows, and why it changed ─────────────────────────────
 *
 * It used to print the handover file itself, in monospace. That was accurate
 * and it was the wrong thing to show: a wall of grey fixed-width text reads as
 * source code, and the point being made is not "Sidq produces a file" — anybody
 * can produce a file. The point is that the assistant on the other side picks
 * the work up without being briefed.
 *
 * So the shot is the reply. The file is a chip above it, the way an attachment
 * actually appears, and underneath is the answer that came back. Every specific
 * in it — the eight per cent, the retries, the idempotency key, the em dash
 * rule — is something the handover carried and nothing the assistant could have
 * known otherwise, which is the entire argument made in six lines.
 */
const ATTACHMENT = "Continue-this-conversation.md";

const REPLY = [
  "Picking up from the idempotency work rather than starting over.",
  "You were losing roughly 8% of payments because Stripe retries the webhook and the handler was not idempotent, so a second delivery overwrote the first with a stale status. Keying on the event id fixes new traffic but not the events already dropped.",
  "Two things left from where you stopped:",
  "1. Add the idempotency key on the event id, and make the write a no-op when the id has been seen.",
  "2. Backfill the failed events. You will want the ones from before the fix went out, not all of them.",
  "I can start on the backfill query if you want to see the shape of it first.",
];

/*
 * ── One design size, scaled ──────────────────────────────────────────────────
 *
 * The scene is laid out once at 1040 by 650 and the whole thing is scaled to
 * whatever width it is handed. Everything inside can then be sized in absolute
 * units and it stays in proportion at every screen, which is what fixes the
 * phone: the film was 335 wide there with fifteen pixel type inside it, so the
 * picker was half the width of the Mac it was supposed to be sitting on.
 *
 * A percentage layout cannot do this. Percentages keep boxes proportional and
 * leave type at whatever the root says, so the smaller the frame the more the
 * text dominates it — and the frame is a scale model of a desktop, where type
 * being the wrong size relative to the window is the one thing that reads as
 * fake.
 */
const STAGE_W = 1040;
const STAGE_H = 650;

/*
 * ── Streaming the reply ──────────────────────────────────────────────────────
 *
 * The reply used to appear as a finished block behind a clip-path wipe, top to
 * bottom. That reads as a document being uncovered, not as an answer being
 * written, and it was the reason the last shot felt slow and unlike anything a
 * model actually does.
 *
 * This emits it in chunks, left to right, the way a model streams tokens. Words
 * rather than characters, because that is closer to what a token is and because
 * per-character typing at a readable speed takes far too long for a loop.
 *
 * The cadence is deliberately uneven. A fixed interval reads as a teleprinter;
 * real output arrives in bursts with small stalls, so the delay per word is
 * modulated by a cheap deterministic wobble. Deterministic and not random so
 * every viewer sees the same take, and so it cannot desynchronise from the
 * beat that owns it.
 */
const WORDS_PER_TICK = 2;
const TICK_MS = 34;

function useStreamedReply(active: boolean, lines: string[]) {
  const [shown, setShown] = useState(0);
  const total = useMemo(
    () => lines.reduce((n, l) => n + l.split(" ").length, 0),
    [lines],
  );

  useEffect(() => {
    if (!active) {
      setShown(0);
      return;
    }
    let n = 0;
    const id = window.setInterval(() => {
      // The wobble: some ticks emit one word, some three. Averages to two.
      const step = WORDS_PER_TICK + ((n * 7) % 3) - 1;
      n = Math.min(total, n + Math.max(1, step));
      setShown(n);
      if (n >= total) window.clearInterval(id);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [active, total]);

  return useMemo(() => sliceIntoLines(lines, shown), [lines, shown]);
}

/*
 * Turn "n words have been emitted" back into per-line text.
 *
 * Exported so it can be tested. The stream is a single running count across the
 * whole reply, because that is how a model emits — it does not know about the
 * paragraph breaks, it just keeps going. Rendering needs the opposite view, so
 * this walks the lines spending the budget as it goes: a line that fits
 * entirely is complete, the one the budget runs out inside is the one carrying
 * the caret, and every line after it is empty.
 */
export function sliceIntoLines(lines: string[], shown: number) {
  let left = shown;
  return lines.map((line) => {
    const words = line.split(" ");
    const take = Math.max(0, Math.min(words.length, left));
    left -= words.length;
    return { text: words.slice(0, take).join(" "), done: take === words.length };
  });
}

export function HandoverFilm({ className }: { className?: string }) {
  const [beat, setBeat] = useState(0);
  const [playing, setPlaying] = useState(true);
  const wrap = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);

  // Layout effect, so the first paint is already at the right size rather than
  // flashing full size and snapping down.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setFit(el.clientWidth / STAGE_W);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /*
   * Only runs while it is on screen.
   *
   * A timer driving transforms in a section three viewports down is work
   * nobody asked for, on a page whose whole pitch includes being fast.
   */
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setPlaying(entry.isIntersecting),
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(
      () => setBeat((b) => (b + 1) % BEATS.length),
      BEATS[beat].hold,
    );
    return () => window.clearTimeout(id);
  }, [beat, playing]);

  const scene = BEATS[beat];
  const showPicker = beat >= 2 && beat <= 4;
  const showChat = beat >= 5;
  /*
   * Always the row the cursor is on. See ROW_Y: the pointer and the highlight
   * are one decision, not two that have to be kept in sync by hand.
   */
  const selected = PICKED;

  return (
    <div ref={wrap} className={cn("w-full", className)}>
      {/* Reserves exactly the scaled height, so nothing below it shifts. */}
      <div style={{ height: STAGE_H * fit }} className="relative w-full">
      <div
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `scale(${fit})`,
          transformOrigin: "top left",
        }}
        className={cn(
          "relative overflow-hidden rounded-[18px]",
          // Sidq's own dawn rather than a licensed desktop photograph.
          "bg-[linear-gradient(165deg,#2A2A5C_0%,#4C4A8A_28%,#8E7BB0_52%,#D8A08C_74%,#F0C9A0_100%)]",
          "shadow-[0_40px_100px_-30px_rgba(30,27,75,0.55)]",
        )}
      >
        {/*
         * The camera. One transform on one element: the scene inside is laid
         * out once and only ever moved, so no beat costs a reflow.
         */}
        <div
          className="film-camera absolute inset-0"
          style={{
            // Origin is the cursor, so the camera is always centred on
            // whatever is being pointed at.
            transform: `scale(${scene.scale})`,
            transformOrigin: `${scene.at.x}% ${scene.at.y}%`,
          }}
        >
          <MenuBar />

          {/*
           * The shelf, so the shot is a Mac rather than a rectangle with a
           * gradient. Sidq sits among the applications somebody already has,
           * which is the only thing in the frame that gives it scale.
           */}
          <div className="absolute inset-x-0 bottom-[2.5%] z-10 flex justify-center">
            <MacDock />
          </div>
          <Pill expanded={showPicker} />

          {showPicker && (
            <div className="absolute inset-x-[22%] top-[11%] z-30">
              <PillPreview
                rows={ROWS}
                selected={selected}
                footer="Whole conversation, not a summary"
              />
            </div>
          )}

          {showChat && <ChatWindow revealed={beat >= 7} />}
          <Cursor at={scene.at} />
        </div>
      </div>
      </div>

      {/*
       * The caption is outside the camera, so it never scales with the shot.
       * Fixed height, because a line that changes length must not shunt the
       * section below it up and down every few seconds.
       */}
      <p
        key={beat}
        className="film-caption mx-auto mt-6 flex min-h-[3.25rem] max-w-[44ch] items-start justify-center text-center text-[0.9375rem] leading-relaxed ink-muted"
      >
        {scene.caption}
      </p>

      <ol className="mt-1 flex items-center justify-center gap-1.5" aria-hidden="true">
        {BEATS.map((_, i) => (
          <li
            key={i}
            className={cn(
              "h-1 rounded-full transition-all duration-500",
              i === beat ? "w-5 bg-ink/45" : "w-1 bg-ink/15",
            )}
          />
        ))}
      </ol>
    </div>
  );
}

/** The menu bar, so the pill is somewhere rather than floating in a void. */
function MenuBar() {
  return (
    <div className="absolute inset-x-0 top-0 z-20 flex h-[5.5%] items-center gap-[1.6%] bg-black/35 px-[2%]">
      <span aria-hidden="true" className="h-[42%] w-[1.1%] rounded-[1px] bg-white/70" />
      {["File", "Edit", "View", "Window"].map((m) => (
        <span key={m} className="text-[0.5rem] text-white/55">
          {m}
        </span>
      ))}
    </div>
  );
}

/*
 * The collapsed bar, at the size and position Rust actually places it.
 *
 * 112 by 24 points, a centimetre below the top of the screen, centred. Those
 * are BAR and FLOAT_GAP in pill_window.rs, and if they change here without
 * changing there the page is showing something that does not exist.
 */
function Pill({ expanded }: { expanded: boolean }) {
  return (
    <div
      className={cn(
        "absolute left-1/2 top-[7.5%] z-30 -translate-x-1/2",
        "flex h-[3.4%] w-[11%] items-center justify-center gap-[4%] rounded-full",
        "bg-[rgba(12,12,17,0.66)] ring-1 ring-inset ring-white/15",
        "shadow-[0_0_20px_-4px_rgba(184,166,255,0.28),0_8px_24px_-8px_rgba(0,0,0,0.6)]",
        "transition-opacity duration-300",
        expanded ? "opacity-0" : "opacity-100",
      )}
    >
      <svg viewBox="72 116 386 208" className="h-[46%]" fill="none" stroke="white" strokeWidth="24" strokeLinecap="round">
        <path d="M96 232 C120 168 142 296 168 208 C190 136 210 300 236 236" />
        <path d="M236 236 C258 196 286 256 324 256 L416 256" />
        <circle cx="416" cy="256" r="30" fill="white" stroke="none" />
      </svg>
      <span className="text-[0.4rem] tabular-nums text-white/70">128</span>
    </div>
  );
}

/*
 * A generic assistant window. Deliberately nobody's: no logo, no product name,
 * the empty state every chat box on the internet has.
 */
function ChatWindow({ revealed }: { revealed: boolean }) {
  const streamed = useStreamedReply(revealed, REPLY);

  return (
    <div className="absolute inset-x-[8%] bottom-[6%] top-[12%] z-10 overflow-hidden rounded-[10px] bg-[#141319] ring-1 ring-white/10 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)]">
      <div className="flex h-[7%] items-center gap-[0.6%] bg-white/[0.04] px-[1.4%]">
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
          <span key={c} className="h-[26%] w-[0.9%] rounded-full" style={{ background: c }} />
        ))}
      </div>

      <div className="h-[76%] overflow-hidden px-[6%] pt-[3%]">
        {revealed ? (
          <div>
            {/* The attachment, as a chip on the person's own turn. */}
            <div className="flex justify-end">
              <span className="inline-flex items-center gap-[0.6em] rounded-[8px] bg-white/[0.08] px-[0.9em] py-[0.5em] text-[0.4rem] text-white/70 ring-1 ring-white/10">
                <svg viewBox="0 0 24 24" className="h-[1.2em]" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
                {ATTACHMENT}
              </span>
            </div>

            {/*
             * The reply. Set in the sans at a normal reading size, because this
             * is prose an assistant wrote and not a file — the monospace it used
             * to be is what made it look like source.
             */}
            {/*
              * Every line starts at the same left edge.
              *
              * The numbered steps used to carry pl-[3%], which put two of the
              * six lines on a different left margin from the other four. In a
              * block this small that does not read as hierarchy, it reads as
              * text that has slipped.
              */}
            <div className="mt-[3%] space-y-[1.6%] text-left text-[0.42rem] leading-[1.7] text-white/80">
              {streamed.map((line, i) => (
                <p key={i} className={line.text ? undefined : "hidden"}>
                  {line.text}
                  {/* The caret rides the end of whichever line is still being
                      written, and disappears when the last one finishes. */}
                  {!line.done && line.text && <span className="film-caret" />}
                </p>
              ))}
            </div>
          </div>
        ) : (
          <p className="pt-[12%] text-center text-[0.55rem] text-white/25">Ask anything</p>
        )}
      </div>

      <div className="absolute inset-x-[4%] bottom-[4%] flex h-[9%] items-center gap-[1.5%] rounded-full bg-white/[0.06] px-[2%] ring-1 ring-white/10">
        <svg viewBox="0 0 24 24" className="h-[46%] text-white/45" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
        </svg>
        <span className="text-[0.4rem] text-white/30">
          {revealed ? ATTACHMENT : "Attach a file"}
        </span>
      </div>
    </div>
  );
}

/*
 * The cursor, which is the thread through the whole thing.
 *
 * It moves to whatever the current beat is about, so a viewer who has looked
 * away knows where to look when they come back. Position is a percentage of the
 * stage rather than of the zoomed layer, so it lands in the same place
 * regardless of how far the camera has pushed in.
 */
function Cursor({ at }: { at: { x: number; y: number } }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 18"
      className="film-cursor absolute z-40 w-[1.6%] drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
      style={{ left: `${at.x}%`, top: `${at.y}%` }}
    >
      <path d="M1 1l9.5 8.2-4.2.5 2.6 5.4-2 1-2.6-5.4-3.3 2.6z" fill="white" stroke="#1a1a24" strokeWidth="0.8" />
    </svg>
  );
}
