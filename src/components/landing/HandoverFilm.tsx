import { useEffect, useRef, useState } from "react";
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
 * Every mechanical step is half a second, which is roughly how long the action
 * actually takes: a click is instant and the eye needs a beat to see the
 * result, and anything longer reads as the demo waiting for you rather than
 * showing you something. The first version held each step for three or four
 * seconds and felt broken.
 *
 * Two beats break the rule, both because they are the point rather than the
 * plumbing: the list of conversations, which is the moment somebody realises
 * how much of their history is in there, and the document at the end, which is
 * the thing being sold and has to be read.
 */
const BEATS: Beat[] = [
  { hold: 900, scale: 1, at: { x: 50, y: 46 }, caption: "It sits above everything, out of the way." },
  { hold: 500, scale: 2.4, at: { x: 50, y: 9 }, caption: "One shortcut, from wherever you are." },
  { hold: 2200, scale: 1.5, at: { x: 50, y: 30 }, caption: "Everything you have said, to every assistant." },
  { hold: 500, scale: 1.7, at: { x: 38, y: 26 }, caption: "Pick one." },
  { hold: 500, scale: 1.7, at: { x: 38, y: 26 }, caption: "It writes the file." },
  { hold: 500, scale: 1, at: { x: 50, y: 50 }, caption: "Open anything else." },
  { hold: 500, scale: 2.4, at: { x: 14, y: 84 }, caption: "Attach it." },
  { hold: 3400, scale: 1.1, at: { x: 50, y: 44 }, caption: "It arrives knowing the decisions, the constraints and where you stopped." },
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
 * Verbatim from `compiler.rs`. See the note at the top of this file: this is
 * generated output, not prose written to look like it. Trimmed only by cutting
 * whole sections from the end, never by rewording a line.
 */
const HANDOVER = `# Continue this conversation

WHAT THIS IS

A record of a conversation that happened somewhere else, given to you so it can
carry on here. It was between the person you are talking to now and ChatGPT,
yesterday, working on checkout. It includes the assistant's private reasoning,
which was never shown to anyone.

They were there for all of it. Do not summarise it back to them; that spends the
turn on something they already know.

WHO YOU ARE TALKING TO

Standing instructions this person has given assistants before, in their own
words. Apply them here unless they say otherwise.

- never use em dashes in anything you write for me

WHERE IT GOT TO

It opened with: our checkout silently drops about 8% of payments and we cannot
work out why

By the end they were on: so we key on the event id instead

The last thing they asked was: add the idempotency key and backfill the failed
events`;

export function HandoverFilm({ className }: { className?: string }) {
  const [beat, setBeat] = useState(0);
  const [playing, setPlaying] = useState(true);
  const wrap = useRef<HTMLDivElement>(null);

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
  const showPicker = beat >= 1 && beat <= 4;
  const showChat = beat >= 5;
  const selected = beat >= 3 ? 0 : 1;

  return (
    <div ref={wrap} className={cn("w-full", className)}>
      <div
        className={cn(
          "relative aspect-[16/10] w-full overflow-hidden rounded-[18px]",
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
  return (
    <div className="absolute inset-x-[8%] top-[12%] bottom-[6%] z-10 overflow-hidden rounded-[10px] bg-[#141319] ring-1 ring-white/10 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)]">
      <div className="flex h-[7%] items-center gap-[0.6%] bg-white/[0.04] px-[1.4%]">
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
          <span key={c} className="h-[26%] w-[0.9%] rounded-full" style={{ background: c }} />
        ))}
      </div>

      <div className="h-[76%] overflow-hidden px-[4%] pt-[2.5%]">
        {revealed ? (
          <pre className="film-paste whitespace-pre-wrap font-mono text-[0.34rem] leading-[1.45] text-white/80">
            {HANDOVER}
          </pre>
        ) : (
          <p className="pt-[12%] text-center text-[0.55rem] text-white/25">
            Ask anything
          </p>
        )}
      </div>

      {/* The composer, with the attach control the fifth beat zooms to. */}
      <div className="absolute inset-x-[4%] bottom-[4%] flex h-[9%] items-center gap-[1.5%] rounded-full bg-white/[0.06] px-[2%] ring-1 ring-white/10">
        <svg viewBox="0 0 24 24" className="h-[46%] text-white/45" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
        </svg>
        <span className="text-[0.4rem] text-white/30">
          {revealed ? "Continue-this-conversation.md" : "Attach a file"}
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
