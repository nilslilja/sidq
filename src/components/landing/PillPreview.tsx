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

export function PillPreview({
  query,
  rows,
  selected = 0,
  status,
  footer = "Whole conversation, not a summary",
  className,
}: {
  query?: string;
  rows: PillRow[];
  selected?: number;
  status?: string;
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
        "pane-glass",
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
      <ul className="px-2 pb-2">
        {rows.map((row, i) => (
          <li key={row.title}>
            <div
              className={cn(
                "flex w-full items-center gap-2.5 rounded-[11px] px-2.5 py-2 text-left",
                "transition-[background,box-shadow] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)]",
                i === selected ? "row-glass-on" : "",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 shrink-0 rounded-full transition-colors duration-150",
                  i === selected
                    ? "bg-[#B8A6FF] shadow-[0_0_8px_rgba(184,166,255,0.8)]"
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
