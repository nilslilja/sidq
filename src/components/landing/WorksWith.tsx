import { SUPPORTED } from "@/lib/companion/sources";

/*
 * The ten, named.
 *
 * The hero says "10 assistants it reads" and a number on its own is a claim
 * somebody has to decide whether to believe. The names are the proof, and they
 * also answer the only question a visitor actually has at this point, which is
 * not "how many" but "is mine in there".
 *
 * Read from `SUPPORTED` rather than written out, for the same reason the count
 * is: this list and the number above it come from the array the picker filters
 * by, so the site cannot claim a reader that was removed or miss one that was
 * added. There is no version of this that drifts.
 *
 * No logos. Every one of these is a trademark belonging to somebody else, and a
 * wall of other companies' marks on a landing page reads as borrowed authority
 * even when the integrations are real. Set in the display face at a size that
 * can be read across a room, the names do the same job and look like a
 * statement rather than a badge collection.
 */

export function WorksWith() {
  return (
    <section
      aria-labelledby="works-with"
      className="mx-auto max-w-[76rem] px-5 pb-4 pt-16 sm:px-6 sm:pt-20"
    >
      <h2
        id="works-with"
        className="ink-muted text-center text-[0.6875rem] uppercase tracking-[0.14em]"
      >
        Reads all of these
      </h2>

      {/*
       * A wrapped row rather than a grid. Ten names of very different lengths
       * in equal columns leaves "Grok" alone in a cell the width of "Claude
       * Cowork", which is the layout that makes a list like this look like
       * filler. Flowing them and centring each line keeps the block dense.
       */}
      {/*
       * ── A moving strip rather than a wrapped block ──────────────────────────
       *
       * Eleven names sitting still read as a feature list, and a feature list is
       * a thing people skim. The same eleven moving read as a roster, and the
       * eye follows them long enough to register how many there are — which is
       * the only claim on this page that is both impressive and checkable by
       * anybody who cares to count.
       *
       * The list is rendered twice into one track, and the animation slides the
       * track exactly half its own width. At the instant the first copy leaves
       * the frame the second is already in that position, so the loop has no
       * seam. See `.marquee-track` in global.css.
       *
       * The duplicate is hidden from assistive technology: a screen reader
       * should hear the roster once, not stutter through it twice.
       */}
      <div className="marquee mt-5 overflow-hidden">
        <div className="marquee-track">
          {[false, true].map((isClone) => (
            <ul
              key={String(isClone)}
              aria-hidden={isClone || undefined}
              className="flex shrink-0 items-center gap-x-3 pr-3"
            >
              {SUPPORTED.map((name) => (
                <li key={name}>
                  <span
                    className={[
                      "glass-subtle inline-flex items-center whitespace-nowrap rounded-full px-3.5 py-1.5",
                      "font-display text-[clamp(0.9375rem,1.4vw,1.125rem)] tracking-[-0.02em]",
                      "text-ink",
                    ].join(" ")}
                  >
                    {name}
                  </span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      <p className="ink-muted mx-auto mt-5 max-w-[46ch] text-balance text-center text-[0.875rem] leading-relaxed">
        Whatever you had the conversation in, Sidq can carry it into whatever you
        open next. Including into a different company's model.
      </p>
    </section>
  );
}
