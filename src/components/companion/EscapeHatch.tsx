import { cn } from "@/lib/cn";

/**
 * Where the conversation goes next.
 *
 * The panel used to end at "Saved to Downloads · attach it to any AI", which is
 * a dead end dressed as a success: the file exists and the person still has to
 * switch application, find the composer, click it and paste. Those four steps
 * are the whole reason the keystroke exists, and they were still being done by
 * hand at the last moment of the flow.
 *
 * So this is the last step: pick an assistant, and Sidq compiles the handover
 * for that specific destination, puts it on the clipboard and opens the
 * assistant in the person's own browser. One paste, and the four steps are one
 * step.
 *
 * ── Why the browser and not Sidq's own webview ───────────────────────────────
 * Sidq can open these inside itself and type straight into the composer, which
 * is better exactly when it works. It is a trap when it does not: a webview
 * that has never been signed in shows a logged-out page, and the conversation
 * is typed into nothing while this panel reports success. Google refuses OAuth
 * in embedded webviews, so Gemini can fail that way every time, and a passkey
 * fails everywhere. A paste that always works beats an injection that sometimes
 * lands nowhere.
 *
 * ── Why a rail and not a list ────────────────────────────────────────────────
 * A list of five rows under a success card is a second menu, and a second menu
 * is a decision about navigation rather than about where the work goes. A rail
 * is one object with one thing moving inside it, which is what choosing between
 * five things actually is. It also reads at a glance, which matters: this panel
 * appears at the end of an action somebody has already committed to.
 */

/** One place a conversation can go. */
export interface Hatch {
  id: string;
  label: string;
}

export function EscapeHatch({
  options,
  selected,
  /** The assistant that stopped, when this conversation ended at its limit. */
  wall,
  onSelect,
  onPick,
}: {
  options: Hatch[];
  selected: number;
  wall?: string | null;
  onSelect: (index: number) => void;
  onPick: (id: string) => void;
}) {
  if (!options.length) return null;

  /*
   * Equal columns, so the lozenge can slide on `transform` alone.
   *
   * The alternative is measuring each cell and animating `left`, which means a
   * layout read on every keypress and an animation off the compositor. Equal
   * widths make the whole thing arithmetic: the lozenge is one column wide and
   * sits `index` columns along.
   */
  const columns = options.length;

  return (
    <div className="mt-4">
      <p className="text-[0.8125rem] leading-snug text-white/45">
        {/*
         * The one line worth reading at this moment.
         *
         * When the conversation ended at a limit message, the panel says which
         * assistant stopped. It is not a slogan: it is read out of that
         * session's own last turn by `wall::ended_at_wall`, and when it did
         * not happen the sentence is simply not said.
         */}
        {wall ? (
          <>
            <span className="font-medium text-[#D8CCFF]">{wall}</span> cut you
            off. Finish it in:
          </>
        ) : (
          <>Take it somewhere else:</>
        )}
      </p>

      <div
        role="radiogroup"
        aria-label="Where to carry this conversation"
        className="rail-glass relative mt-2 grid gap-0 rounded-full p-0.5"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {/*
         * The lozenge, behind the labels.
         *
         * One element for the whole rail rather than a highlight per option:
         * five elements fading in and out is a cross-fade, and a single one
         * moving is the thing Apple's own segmented controls do, which is what
         * makes the selection read as an object being carried rather than as a
         * state being redrawn.
         */}
        <span
          aria-hidden="true"
          className="rail-thumb pointer-events-none absolute inset-y-0.5 left-0.5 rounded-full"
          style={{
            width: `calc((100% - 0.25rem) / ${columns})`,
            transform: `translateX(${selected * 100}%)`,
          }}
        />

        {options.map((option, i) => {
          /*
           * The assistant that just cut them off is still drawn, and refuses.
           *
           * Removing it would be tidier and worse: the rail would silently have
           * four items where it had five, and the one name somebody is looking
           * for at that exact moment would be the one that vanished. Struck
           * through, it answers the question instead of dodging it.
           */
          const refuses = !!wall && option.label === wall;

          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={i === selected}
              disabled={refuses}
              onMouseEnter={() => !refuses && onSelect(i)}
              onClick={() => !refuses && onPick(option.id)}
              className={cn(
                "relative z-10 truncate rounded-full px-2 py-1.5",
                "text-[0.75rem] font-medium transition-colors duration-150",
                refuses && "cursor-not-allowed text-white/25 line-through",
                !refuses && i === selected && "text-[#1A1726]",
                !refuses &&
                  i !== selected &&
                  "cursor-pointer text-white/55 hover:text-white/85",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[0.75rem] leading-relaxed text-white/35">
        {/*
         * Said plainly, because it is the part people do not believe. An app
         * that types into another app is one keystroke from sending something
         * on your behalf, and this one stops short of it on purpose.
         */}
        ↵ copies the handover and opens it in your browser. Press ⌘V.
      </p>
    </div>
  );
}
