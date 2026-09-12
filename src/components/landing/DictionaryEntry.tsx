/**
 * The name, as a dictionary would have it.
 *
 * ── Why this is funny, and why it needs the real etymology ───────────────────
 * The joke is a format collision: the apparatus of a print dictionary — a
 * headword, a pronunciation in slashes, an italic part of speech, numbered
 * senses — wrapped around a sentence nobody would ever print in one. The
 * apparatus has to be straight-faced or there is nothing to collide with.
 *
 * Which is why sense 1 is real and not a setup. Sidq is صِدق: truthfulness,
 * sincerity, the quality of an account that matches what actually happened.
 * That is also, unchanged, what the product claims to do — carry what was
 * really said rather than a summary of it. So the entry reads as a genuine
 * definition right up until it does not, and the second sense lands on a
 * reader who has already started taking it seriously.
 *
 * The attribution is the other half. A testimonial from a named stranger is a
 * thing people have learned to disbelieve on sight; one from the founder,
 * calling his own product the best thing ever, cannot be mistaken for evidence
 * and is not pretending to be. It is the only honest way to put a rave on your
 * own landing page.
 */
export function DictionaryEntry() {
  return (
    <figure className="w-[17rem] text-left">
      {/*
       * Rules above and below, the way a boxed entry is set. Hairlines, because
       * the whole effect depends on this looking typeset rather than designed.
       */}
      <div aria-hidden="true" className="h-px w-full bg-white/25" />

      <div className="py-4">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 className="font-serif text-[1.75rem] leading-none text-[#F4F1FF]">
            sidq
          </h2>
          {/*
           * A real transcription of the Arabic, not an invented one. The
           * superscript ˤ is pharyngealisation on the ṣād, which is the sound
           * English has no letter for and the reason the word gets spelled six
           * different ways.
           */}
          <span className="font-serif text-[0.9375rem] text-white/55">
            /sˤɪdq/
          </span>
          <span className="font-serif text-[0.9375rem] italic text-white/45">
            noun
          </span>
        </div>

        <ol className="mt-3 space-y-2.5 text-[0.8125rem] leading-relaxed text-white/70">
          <li className="flex gap-2">
            <span
              aria-hidden="true"
              className="shrink-0 tabular-nums text-white/35"
            >
              1.
            </span>
            <span>
              <span className="italic text-white/45">Arabic.</span>{" "}
              truthfulness; sincerity; the quality of an account that matches
              what actually happened.
            </span>
          </li>
          <li className="flex gap-2">
            <span
              aria-hidden="true"
              className="shrink-0 tabular-nums text-white/35"
            >
              2.
            </span>
            <span>
              <span className="italic text-white/45">informal.</span> the best
              shit ever.
            </span>
          </li>
        </ol>

        {/*
         * The citation, set the way a dictionary sets one: indented, smaller,
         * attributed. Dictionaries quote to show a word in use, which is
         * exactly the pretence being kept up here.
         */}
        <figcaption className="mt-3 pl-5 font-serif text-[0.8125rem] italic text-white/40">
          - nils, who made it
        </figcaption>
      </div>

      <div aria-hidden="true" className="h-px w-full bg-white/25" />
    </figure>
  );
}
