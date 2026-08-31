/*
 * Four numbers, under the button.
 *
 * The stats band was deliberately deleted from this page once before, along
 * with the feature bands and the second download panel, because nobody reads a
 * case for a free Mac app. This is not that band. Those were adjectives with
 * digits in them; these are four measurements, and each one answers a question
 * somebody actually asks before installing:
 *
 *   does it know my tools      ten of them
 *   will it carry enough       a hundred and fifty thousand tokens
 *   is it going to be slow     fifty two milliseconds
 *   where does my stuff go     nowhere
 *
 * Every figure is checkable against the program. The count is the assistants
 * in `assistants.rs` plus the transcript readers. The token figure is
 * MAX_CHARS in `compiler.rs`, 600,000 characters, converted at four characters
 * to the token. The 52ms is `recent_sessions()` on real transcripts, down from
 * 1,599ms before the digest cache. The zero is the handover path, which makes
 * no network call at all.
 *
 * The zero carries the weight, and it is last because a row is read left to
 * right and the last thing read is the thing repeated. It is also the only one
 * of the four a hosted competitor cannot print, which is the actual reason the
 * band is worth its space.
 *
 * Ink, not white, and that is not a style choice.
 *
 * The band lands at 79% down the sky, where the gradient has already warmed to
 * rgb(227,181,151). Measured there, white figures come to 1.85:1 and the
 * white/55 labels to 1.43:1 — both far under AA, and the labels effectively
 * invisible. Ink measures 9.2:1 on the same pixel. Every other line of hero
 * copy is white because every other line sits on the dark half; this one does
 * not, so it flips.
 *
 * The labels are ink/80 rather than the `.ink-muted` token, and that is not
 * somebody ignoring the token.
 *
 * `.ink-muted` is 65% ink, calibrated at 4.6:1 against the paper canvas, and
 * that calibration does not hold here. The band does not sit on paper, it sits
 * on a gradient whose exact colour under it depends on the viewport: measured
 * across 320 to 1920, the pixel behind these labels ranges from rgb(219,175,154)
 * to rgb(246,231,212). At the dark end 65% ink comes to 4.01:1, which is under
 * AA for twelve point text. 80% clears it at every width tested.
 *
 * A `dl` rather than divs. Each of these is a term and its value, that element
 * exists for exactly this, and a screen reader then reads "assistants it reads,
 * ten" instead of two unrelated fragments.
 */

const STATS: ReadonlyArray<{ figure: string; label: string }> = [
  { figure: "10", label: "assistants it reads" },
  { figure: "150,000", label: "tokens per handover" },
  { figure: "52ms", label: "to list every conversation" },
  { figure: "0", label: "bytes of conversation uploaded" },
];

export function HeroStats() {
  return (
    <dl
      className={[
        "mx-auto grid w-full max-w-[46rem] grid-cols-2 gap-x-6 gap-y-7",
        "sm:grid-cols-4 sm:gap-x-2",
        // Hairlines between the columns rather than boxes around them. A card
        // per number turns four facts into a widget; a rule turns them into a
        // line of type, which is what they are.
        "sm:divide-x sm:divide-ink/15",
      ].join(" ")}
    >
      {STATS.map(({ figure, label }) => (
        <div key={label} className="min-w-0 text-center sm:px-3">
          <dd
            className={[
              "font-display leading-none tracking-[-0.04em] text-ink",
              // Tabular figures so the four numbers sit on a shared baseline
              // grid instead of drifting with the width of a 1 against a 0.
              "text-[clamp(1.5rem,3.4vw,2.25rem)] tabular-nums",
            ].join(" ")}
          >
            {figure}
          </dd>
          <dt className="mt-2 text-balance text-[0.75rem] leading-snug text-ink/80">
            {label}
          </dt>
        </div>
      ))}
    </dl>
  );
}
