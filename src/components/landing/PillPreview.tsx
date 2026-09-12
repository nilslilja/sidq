import { cn } from "@/lib/cn";

/*
 * The picker, as it actually is.
 *
 * ── Why this exists and why it keeps going stale ─────────────────────────────
 *
 * The real picker in routes/Pill.tsx is wired to live sessions, a Tauri window
 * and a keyboard, none of which exist on a marketing page. So the page draws
 * it, and the drawing has to be kept honest by hand.
 *
 * It was not. The pill was remastered into liquid glass — `pane-glass` panes,
 * inset `row-glass` rows, `chip-glass` keycaps, a 22px radius — and this file
 * stayed on the flat `bg-[#141319]` box from before it, so the front page spent
 * a week showing an interface the product no longer had.
 *
 * Every class below is copied from Pill.tsx rather than approximated, and the
 * test beside this file fails if the two stop sharing them. A screenshot cannot
 * catch this: both versions look fine, one of them is just not the product.
 */

export interface PillRow {
  title: string;
  meta: string;
}

/**
 * The confirmation, when there is one.
 *
 * Every field is one the real panel prints, and the panel is only worth drawing
 * because it is the one moment the product proves it did something: a click
 * that produces no visible result reads as a click that failed.
 */
export interface PillSaved {
  /** Just the filename. The real one prints `path.split('/').pop()`. */
  file: string;
  words: number;
  turns?: number;
  hours?: number;
}

export function PillPreview({
  query,
  rows,
  selected = null,
  status,
  pressed = false,
  saved,
  footer = "The conversation itself, not a summary",
  className,
}: {
  query?: string;
  rows: PillRow[];
  /*
   * When set, this replaces the list — which is what Pill.tsx does rather than
   * stacking the two: the rows are wrapped in `phase.kind !== 'saved' && ...`
   * (Pill.tsx:1045), so choosing a conversation swaps the body rather than
   * pushing it down.
   */
  saved?: PillSaved;
  /*
   * Which row is under the pointer, or null for none.
   *
   * Null matters: the picker opens with nothing highlighted, because nothing is
   * hovered yet. Defaulting to row 0 made the film look like it arrived with a
   * conversation already chosen, so the actual choosing never read as an event.
   */
  selected?: number | null;
  status?: string;
  /** The row is being clicked this instant. */
  pressed?: boolean;
  footer?: string;
  className?: string;
}) {
  const count =
    rows.length === 1 ? "1 conversation" : `${rows.length} conversations`;

  return (
    <div
      className={cn(
        // Pill.tsx: 'overflow-hidden rounded-[22px]' + 'pane-glass'. The border
        // and shadow live inside pane-glass; adding any here doubles the rim.
        "w-full overflow-hidden rounded-[22px] text-left",
        // `animate-pane` too, because the real panel does not appear, it opens
        // (Pill.tsx:784). Without it the film popped the window into frame in a
        // single frame, which is the one thing a window never does.
        "pane-glass animate-pane",
        className,
      )}
    >
      {/*
       * The header. There is no search box in the real picker any more — typing
       * filters and the query appears here as text, so a box drawn on the page
       * would be an interface element that does not exist.
       */}
      <div className="flex items-center gap-3 px-4 pb-2.5 pt-3">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-[0.9375rem] leading-tight",
              query ? "text-white" : "font-medium text-white/90",
            )}
          >
            {query || "Pick up where you stopped"}
            {query && (
              // Static caret. A blink in a still frame reads as a rendering
              // fault, and nothing on this page has focus anyway.
              <span className="ml-0.5 inline-block h-[1.05em] w-px translate-y-[0.15em] bg-white/70" />
            )}
          </p>
        </div>
        <span className="shrink-0 text-[0.6875rem] tabular-nums text-white/35">
          {status ?? count}
        </span>
      </div>

      {/* Rows are inset with their own radius, which is what makes a selection
          read as a control rather than a table row. */}
      {saved ? (
        /*
         * ── Saved to Downloads ────────────────────────────────────────────────
         *
         * Copied from Pill.tsx:931 rather than approximated, same as the rest
         * of this file. The tick lands instead of appearing: `animate-land`
         * scales it in, which is the difference between "the panel updated" and
         * "that worked", and is the whole reason this state is worth drawing.
         */
        <div className="animate-pane-body border-t border-white/[0.06] px-4 py-5">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="animate-land chip-glass-on mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[0.8125rem] text-[#D8CCFF]"
            >
              ✓
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.9375rem] font-medium leading-tight text-white">
                Saved to Downloads
              </p>
              <p className="mt-1 truncate text-[0.8125rem] text-white/50">
                {saved.file}
              </p>

              {/* The product stated as a number: what you did not retype. */}
              {saved.words > 0 && (
                <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[0.8125rem] text-white/70">
                  <span className="font-display text-[1.125rem] leading-none tabular-nums text-[#D8CCFF]">
                    {saved.words.toLocaleString()}
                  </span>
                  <span>words carried</span>
                  {saved.turns ? (
                    <span className="text-white/35">
                      · {saved.turns.toLocaleString()} messages
                    </span>
                  ) : null}
                  {saved.hours ? (
                    <span className="text-white/35">· {saved.hours}h of work</span>
                  ) : null}
                </p>
              )}

              <p className="mt-2.5 text-[0.8125rem] leading-relaxed text-white/40">
                Attach it to any AI. It already tells them to read it and carry
                on rather than summarise it back to you.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <ul className="px-2 pb-2">
          {rows.map((row, i) => (
            <li key={row.title}>
              <div
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left",
                  "transition-[background,box-shadow] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)]",
                  i === selected ? "row-glass-on" : "",
                  // The press. Brief, small, and on the row itself rather than a
                  // separate ripple, because that is what the real one does.
                  i === selected && pressed ? "scale-[0.985] brightness-125" : "",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 shrink-0 rounded-full transition-colors duration-150",
                    i === selected
                      ? "bg-lilac shadow-[0_0_8px_rgba(184,166,255,0.8)]"
                      : "bg-white/20",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-[0.875rem] leading-tight transition-colors duration-150",
                      i === selected ? "text-white" : "text-white/85",
                    )}
                  >
                    {row.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[0.75rem] leading-none text-white/35">
                    {row.meta}
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/*
       * The footer, which is a hairline rule and not a glass lip. `.lip-glass`
       * exists but belongs to the collapsed bar; using it here would invent a
       * surface the picker does not have.
       */}
      <div className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-2.5">
        <span className="min-w-0 truncate text-[0.6875rem] text-white/30">
          {footer}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[0.625rem] text-white/25">
          <Cap>↑↓</Cap>
          <Cap>↵</Cap>
          <Cap>⌘↵</Cap>
        </span>
      </div>
    </div>
  );
}

function Cap({ children }: { children: React.ReactNode }) {
  // Pill.tsx: 'chip-glass rounded-[6px] px-1.5 py-0.5 text-white/45'.
  return (
    <span className="chip-glass rounded-[6px] px-1.5 py-0.5 text-white/45">
      {children}
    </span>
  );
}
