import { cn } from "@/lib/cn";
import { sourceLabel } from "@/lib/companion/sources";

/*
 * The small pieces every panel of the main window is built from.
 *
 * Moved out of Home.tsx when the sidebar grew: the new panels live in files of
 * their own, and a heading, a switch or a keycap drawn two ways is how a window
 * stops looking like one product. Colours come from the window's `--w-` tokens
 * only, so everything here follows the theme.
 */

const DAY_MS = 86_400_000;

/*
 * ── Lately, across your AIs ──────────────────────────────────────────────────
 *
 * The last six things you worked on, from whichever assistant they were in,
 * newest first. This is the product's whole idea in one list: the rows come
 * from different apps and sit together as one history. Read from the same
 * index the picker uses; nothing here is sample data.
 */
export const SOURCE_LOGO: Record<string, string> = {
  chatgpt: "/openai-logo.svg",
  // Codex is OpenAI's, and its mark is theirs.
  codex: "/openai-logo.svg",
  "claude-code": "/claude-logo.svg",
  "claude.ai": "/claude-logo.svg",
  cowork: "/claude-logo.svg",
  gemini: "/gemini-logo.svg",
  grok: "/grok-logo.svg",
};

/**
 * The top of every panel that is not Overview.
 *
 * ── What this is fixing ──────────────────────────────────────────────────────
 * Overview opens on today's date, then a greeting, then a line saying what Sidq
 * is doing right now. Every other panel opened on a single bare word in 1.75rem
 * on white — "Plan", "Search", "Sources" — which is a browser tab, not a screen
 * somebody chose to look at. The window read warm for one route and sterile for
 * the other five.
 *
 * ── Why the eyebrow carries a number ─────────────────────────────────────────
 * The greeting works because the date is checkable: a person can look at it and
 * confirm the app is awake rather than showing them a cached yesterday. An
 * eyebrow reading "YOUR PLAN" above a heading reading "Plan" is decoration and
 * would have been worse than the bare heading it replaced.
 *
 * So every eyebrow states something measured and live, and any panel that has
 * no such number omits the eyebrow entirely rather than inventing one.
 */
export function PanelHead({
  eyebrow,
  title,
  lead,
}: {
  /** Something measured and true, or nothing. Rendered uppercase. */
  eyebrow?: string;
  title: React.ReactNode;
  /** One line under the heading. Optional, and never two. */
  lead?: React.ReactNode;
}) {
  return (
    <header>
      {eyebrow && (
        <p className="text-[0.6875rem] font-medium tracking-[0.08em] text-[var(--w-text-3)]">
          {eyebrow.toUpperCase()}
        </p>
      )}
      <h1
        className={cn(
          "font-display text-[2rem] font-semibold leading-[1.05] tracking-[-0.045em]",
          // Only pulled down when there is an eyebrow to be pulled down from.
          eyebrow && "mt-1.5",
        )}
      >
        {title}
      </h1>
      {lead && (
        <p className="mt-2.5 max-w-[54ch] text-[0.9375rem] leading-relaxed text-[var(--w-text-3)]">
          {lead}
        </p>
      )}
    </header>
  );
}

/**
 * One thing Sidq does, as a row: what it is, what it is doing right now, and
 * on the right the one control that changes it.
 *
 * The text sits in its own element so a switch can find the row it belongs to
 * from its title, the way a person reads it.
 */
export function AutoRow({
  title,
  body,
  children,
}: {
  title: string;
  body: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-6 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-[0.9375rem] font-medium tracking-[-0.01em] text-[var(--w-text)]">
          {title}
        </p>
        <p className="mt-1 max-w-[60ch] text-[0.8125rem] leading-relaxed text-[var(--w-text-3)]">
          {body}
        </p>
      </div>
      <div className="flex min-w-[4.5rem] shrink-0 justify-end pt-0.5">{children}</div>
    </li>
  );
}

/**
 * On or off, as a switch rather than a button that says what it will do.
 *
 * Named for the action it takes, so a screen reader hears "Turn it on" on a
 * switch that is off, and pressed state says which it is. The look is in
 * `.w-switch`: a track that goes blue and a knob that moves on transform only.
 */
export function Toggle({
  on,
  disabled = false,
  onChange,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      disabled={disabled}
      aria-pressed={on}
      aria-label={on ? "Turn it off" : "Turn it on"}
      className="w-switch shrink-0 cursor-pointer"
    />
  );
}

/**
 * A section's title, set small and in sentence case, with an optional note in
 * the same line. Replaces the letter-spaced capitals that labelled these, which
 * is the one typographic habit the website does not have.
 */
export function SectionHead({
  id,
  title,
  note,
}: {
  id: string;
  title: string;
  note?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2
        id={id}
        className="font-display text-[1.125rem] font-semibold tracking-[-0.03em] text-[var(--w-text)]"
      >
        {title}
      </h2>
      {note && (
        <p className="text-[0.75rem] text-[var(--w-text-3)]">{note}</p>
      )}
    </div>
  );
}

/** The assistant a row came from, as its real logo, or its initial. */
export function SourceGlyph({ source }: { source: string }) {
  const logo = SOURCE_LOGO[source];
  return (
    <span className="grid size-6 shrink-0 place-items-center">
      {logo ? (
        <img src={logo} alt="" width={16} height={16} className="size-4" />
      ) : (
        <span className="grid size-4 place-items-center rounded-[4px] bg-[var(--w-invert)] text-[0.5625rem] font-semibold text-[var(--w-on-invert)]">
          {sourceLabel(source).slice(0, 1)}
        </span>
      )}
    </span>
  );
}

/** A keystroke, set in the mono face so it reads as something you press. */
export function Keys({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[5px] border border-[var(--w-line)] bg-[var(--w-surface)] px-1.5 py-0.5 font-mono text-[0.75rem] text-[var(--w-text-2)]">
      {children}
    </kbd>
  );
}

/** A key, inline in a sentence. Small enough not to shout in a stats column. */
export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[5px] border border-[var(--w-line)] bg-[var(--w-surface)] px-1.5 py-0.5 font-mono text-[0.6875rem] text-[var(--w-text)]">
      {children}
    </kbd>
  );
}

/** Rust stores seconds; everything in the browser is milliseconds. */
export function whenHandedOver(seconds: number): string {
  const days = Math.floor((Date.now() - seconds * 1000) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(seconds * 1000).toLocaleDateString();
}

export function whenLabel(endedAt: number): string {
  const days = Math.floor((Date.now() - endedAt) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}
