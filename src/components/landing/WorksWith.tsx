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
  const names = new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(SUPPORTED);
  return (
    <section
      aria-labelledby="works-with"
      className="mx-auto max-w-[64rem] px-5 pb-4 pt-16 sm:px-6 sm:pt-20"
    >
      {/*
       * One sentence, not a moving strip of glass pills. The pills were the
       * other half of every generated landing page; the names set as a line of
       * type answer the only question anybody has here, which is whether theirs
       * is one of them.
       */}
      <h2 id="works-with" className="text-[0.9375rem] font-semibold text-ink">
        Reads all of these
      </h2>
      <p className="mt-3 max-w-[52ch] text-[clamp(1.25rem,2.2vw,1.625rem)] font-medium leading-snug tracking-[-0.02em] text-ink">
        {names}.
      </p>
      <p className="mt-4 max-w-[46ch] text-[0.9375rem] leading-relaxed text-ink/60">
        Nobody needs eleven. You use three or four, and not one of them can read
        another.
      </p>
    </section>
  );
}
