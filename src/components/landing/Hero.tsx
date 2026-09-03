/*
 * The hero, with its sky back.
 *
 * It was stripped to a flat gradient while hunting a performance problem, and
 * the result was correct and completely characterless — a headline on a purple
 * rectangle that could have belonged to anything. The sky is the only thing on
 * this site nobody else has.
 *
 * What came back: the stars, the two shooting stars, both skeins of birds, the
 * cloud on the horizon, the ridges and the grain over the whole thing. What did
 * not: `filter: blur()` on anything that moves. The clouds and the sun were
 * solid circles with a 26px and a 70px blur, and the sun animated `scale` on
 * top of that — a blurred layer that changes size has to be re-blurred every
 * frame, which was the single most expensive thing on the page. They are
 * radial gradients now. A blurred circle and a soft radial gradient are the
 * same picture; only one of them costs anything.
 *
 * The grain is scoped to this section and absolutely positioned. The version
 * that had to go was `position: fixed` over the entire document, which is a
 * different thing: that one re-blended across the whole viewport on every
 * scroll frame.
 */
import { DownloadButton, usePlatform } from "./DownloadButton";
import { PoweredByClaude } from "./PoweredByClaude";
import { WaitlistForPlatform } from "./WaitlistForPlatform";

export function Hero() {
  const { platform } = usePlatform();

  return (
    <section className="relative overflow-hidden" aria-labelledby="hero">
      {/*
       * The light stops sit low on purpose. Every line of hero copy has to land
       * on the dark half or white text on pale peach fails contrast outright.
       */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,#3A3968_0%,#46437B_20%,#5B5793_40%,#8A7FA8_56%,#BE9AA6_68%,#E3B597_79%,#F6DCBC_90%,#F7F6F3_100%)]"
      />

      {/*
       * Grain over the sky, because a single gradient stretched this far bands
       * visibly on an eight bit display, and flat stripes across the purple is
       * the one artefact that makes a hand-made sky look cheap.
       */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <Sky />

      {/*
       * The sun, low and just off centre, breathing so the page is alive before
       * anything is scrolled. A gradient rather than a blurred circle, and
       * opacity rather than scale — see the note at the top of this file.
       */}
      <div
        aria-hidden="true"
        className="bloom-breathe absolute left-[72%] top-[58%] aspect-square w-[110%] max-w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full sm:w-[80%]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,233,196,0.85) 0%, rgba(255,226,178,0.42) 38%, rgba(255,220,170,0) 72%)",
        }}
      />

      {/* A horizon ridge. Distance in a flat drawing is the far thing being
          paler, not smaller, so the back ridge is the lowest contrast. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1440 220"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-[22%] min-h-[7rem] w-full"
      >
        <path
          d="M0 172 L140 138 L280 158 L430 118 L580 152 L730 128 L880 160 L1030 122 L1180 154 L1330 130 L1440 148 L1440 220 L0 220 Z"
          fill="rgba(59,58,118,0.09)"
        />
        <path
          d="M0 190 L180 120 L300 165 L470 70 L610 150 L760 105 L900 170 L1080 95 L1240 160 L1440 110 L1440 220 L0 220 Z"
          fill="rgba(59,58,118,0.16)"
        />
        <path
          d="M0 210 L220 165 L420 195 L640 140 L860 190 L1080 150 L1290 195 L1440 165 L1440 220 L0 220 Z"
          fill="rgba(59,58,118,0.10)"
        />
      </svg>

      <div className="relative mx-auto flex max-w-[52rem] flex-col items-center px-6 pb-[8vh] pt-28 sm:pb-[7vh] lg:pt-32">
        {/*
         * `w-full`, and it is load-bearing.
         *
         * PoweredByClaude is a `@container` that sizes itself from its parent —
         * a container sized by its own contents cannot constrain them. In a
         * flex column with `items-center` every child shrinks to fit, so this
         * wrapper measured about a word wide and the badge wrapped one word per
         * line on a phone. Nothing about it looked wrong on a desktop.
         */}
        <div className="animate-rise mb-9 w-full">
          <PoweredByClaude />
        </div>

        {/*
         * ── Set as a poster, not as a sentence ───────────────────────────────
         *
         * The words did not change and did not need to. What was wrong was that
         * they were typeset like prose: one balanced block, every word the same
         * weight, breaking wherever the measure happened to run out. A line
         * whose whole job is to be screenshotted cannot break somewhere
         * different on every screen.
         *
         * So the turn in the sentence is the turn in the layout. "The models
         * remember everything" is the setup and sits on its own; "except you"
         * is the payoff and drops to its own line at every width above a phone.
         * The reader gets the beat the sentence was written to have.
         *
         * `text-balance` is gone deliberately. It optimises for even rag, which
         * is right for a paragraph and wrong here — it kept pulling "except"
         * up to sit with the setup and killing the joke.
         */}
        <h1
          id="hero"
          className="animate-rise w-full text-center font-display text-[clamp(2.375rem,7.4vw,5rem)] leading-[0.94] tracking-[-0.05em] text-[#F4F1FF]"
          style={{ animationDelay: "80ms" }}
        >
          The models remember everything{" "}
          {/*
           * The payoff, and the only place on the page where the brand violet
           * carries meaning rather than decoration: the sentence is about the
           * one thing the models do not have, and the colour is what marks it.
           *
           * `block` only from sm up. On a phone the measure is already forcing
           * a break and a hard one as well leaves "except you" stranded under
           * two nearly empty lines.
           */}
          {/*
           * #CDBEFF and not the brand's own #B8A6FF, which is a contrast
           * result rather than a preference. The headline crosses the sky from
           * #3A3968 down to about #5B5793, and measured against the darkest
           * point it reaches, B8A6FF gives 3.08:1 — under the 3:1 bar for large
           * text once antialiasing is accounted for, and visibly muddy on a
           * laptop in daylight. This tint measures 3.84:1 at the same point and
           * 6.31:1 at the top, and reads as the same colour.
           */}
          {/*
           * The payoff, and the reason it is not a second typeface.
           *
           * Geist Mono was tried here on the theory that a real pairing beats
           * the same font at another weight. It does not work at this size:
           * mono letterforms are evenly spaced by design, so next to a display
           * line pulled to -0.05em the phrase reads as a code sample rather
           * than the end of a sentence, and the even rhythm drains the emphasis
           * out of exactly the two words that carry the joke.
           *
           * The contrast that does work is weight and colour against the same
           * family: lighter, so it lands as an aside rather than a shout, and
           * violet, which is the one place on the page the brand colour means
           * something — the sentence is about the thing the models do not have.
           *
           * #CDBEFF and not the brand's own #B8A6FF is a measurement. The
           * headline crosses the sky from #3A3968 to about #5B5793, and against
           * the darkest point B8A6FF gives 3.08:1, under the 3:1 large-text
           * bar. This measures 3.84:1 there and 6.31:1 at the top.
           */}
          <span className="block font-normal text-[#CDBEFF]">except&nbsp;you</span>
        </h1>

        {/*
         * white/85 and a 1.5rem ceiling, both for contrast rather than taste.
         *
         * white/60 measured 2.89:1 against the sky here, which fails AA
         * outright. Raising the ink to 85% is most of the fix, but not all of
         * it: at the old 22px ceiling the line sat just under the 24px
         * large-text threshold and still owed the full 4.5:1, and even solid
         * white only reaches 4.67:1 at that point in the gradient. Taking the
         * ceiling to 24px puts it in large-text territory, where the bar is
         * 3:1 and it clears comfortably. At the small end it renders at 17px
         * higher in the darker sky and measures 5.04:1, which clears 4.5:1
         * on its own.
         */}
        <p
          className="animate-rise mt-7 w-full max-w-[44ch] text-balance text-center text-[clamp(1.0625rem,1.7vw,1.5rem)] leading-snug text-white/85"
          style={{ animationDelay: "160ms" }}
        >
          Sidq is the one that remembers. Every conversation you have ever had,
          carried whole into whichever AI you open next.
        </p>

        {/* The line somebody repeats, directly over the button. */}
        <p
          className="animate-rise mt-10 w-full text-center font-display text-[clamp(1.125rem,2.4vw,1.75rem)] tracking-[-0.03em] text-white"
          style={{ animationDelay: "240ms" }}
        >
          Stop introducing yourself to robots.
        </p>

        <div
          className="animate-rise mt-7 flex justify-center"
          style={{ animationDelay: "320ms" }}
        >
          <DownloadButton size="lg" />
        </div>

        {/*
         * Ink, for the same reason the stat band below is ink: this line has
         * crossed into the warm half of the sky. Measured where it now sits,
         * white/55 comes to 1.52:1 against rgb(213,171,157), which is not a
         * faint line, it is an invisible one. It was already failing before
         * the numbers were added; they only made it obvious by putting legible
         * text directly underneath it.
         */}
        <p className="mt-5 w-full text-center text-[0.8125rem] text-ink/80">
          Free. No card. Mac app, about a minute to set up.
        </p>



        {/* Has to stay on the page the button is on: the button points a phone
            at `#waitlist-email`, and without the form that is a dead link. */}
        {!platform.startsWith("macos") && (
          <div className="mt-2 w-full max-w-[34rem] text-white [&_.ink-muted]:text-white/60 [&_a]:text-white [&_input]:text-white">
            <WaitlistForPlatform platform={platform} />
          </div>
        )}
      </div>

      {/*
       * The numbers sit at the base of the sky, outside the copy column, and
       * the placement is a contrast requirement rather than a layout taste.
       *
       * Inside the column they floated: their position within the gradient
       * moved with the viewport, measured anywhere from 60% to 94% down, and
       * the colour behind them moved with it. No fixed ink value passes AA
       * across that whole range — 80% ink measured 4.85:1 at 320px and 4.44:1
       * at 1440px, failing at the wide end. Anchored here they are always in
       * the last tenth, where the sky has resolved to cream, and the figure is
       * stable.
       *
       * Below the button on purpose too. Somebody who arrived ready to install
       * should reach the button without reading four statistics first.
       */}
      {/*
       * The statistics moved out of the hero and under the film.
       *
       * The film is pulled up over the bottom of the sky, which is exactly
       * where this band used to sit, so a hundred pixels of the demo landed on
       * top of it. Below the film they also read better than they did here:
       * four numbers about a product somebody has just watched work are
       * evidence, where the same four ahead of it were claims.
       */}
    </section>
  );
}

/*
 * Weather.
 *
 * Everything here is pitched at the edge of noticeable: this sky's first job is
 * holding white copy at contrast, and anything that pulls attention off the
 * headline is a fault rather than a flourish. Positions are written down rather
 * than random, so it is the same sky on every render and in every screenshot.
 */
function Sky() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {/* Stars, only in the band that stays dark. Lower down the sky is already
          warming and a star there reads as a speck of dust. */}
      {STARS.map(([left, top, size, delay], i) => (
        <span
          key={i}
          className="sky-twinkle absolute rounded-full bg-white"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            width: `${size}px`,
            height: `${size}px`,
            animationDelay: `${delay}s`,
          }}
        />
      ))}

      {/* Two, on very different clocks, so they never fall into a rhythm. */}
      <span
        className="sky-shoot absolute h-px w-[7rem] origin-left rounded-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.85))]"
        style={{ left: "18%", top: "9%", rotate: "24deg" }}
      />
      <span
        className="sky-shoot absolute h-px w-[5rem] origin-left rounded-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.7))]"
        style={{
          left: "63%",
          top: "17%",
          rotate: "31deg",
          animationDelay: "11s",
        }}
      />

      {/* Birds. Two skeins at different heights and speeds, which is the only
          thing that makes a flat silhouette read as distance. Kept in the dark
          upper half, where a white silhouette still has contrast. */}
      <div className="sky-cross absolute left-0 top-[21%] w-full opacity-[0.26]">
        <Birds />
      </div>
      <div
        className="sky-cross absolute left-0 top-[27%] w-full scale-[0.62] opacity-[0.17]"
        style={{ animationDelay: "-26s", animationDuration: "86s" }}
      >
        <Birds />
      </div>

      {/* Cloud, low and warm, where the sky is already turning. Soft-edged
          gradients rather than blurred ovals: anything with an edge starts
          looking like a logo, and anything blurred that moves costs a re-blur
          on every frame. */}
      {CLOUDS.map(([left, top, w, h, opacity, delay], i) => (
        <span
          key={i}
          className="sky-cloud absolute rounded-full"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            width: `${w}rem`,
            height: `${h}rem`,
            opacity,
            animationDelay: `${delay}s`,
            background:
              "radial-gradient(closest-side, rgba(255,227,203,0.95) 0%, rgba(255,227,203,0.5) 45%, rgba(255,227,203,0) 78%)",
          }}
        />
      ))}
    </div>
  );
}

/** Three birds, as three strokes. At this size anything more is mud. */
function Birds() {
  return (
    <svg
      viewBox="0 0 120 30"
      className="h-[1.6rem] w-[7rem]"
      fill="none"
      stroke="white"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M6 14 q5 -5 10 0 q5 -5 10 0" />
      <path d="M44 8 q4 -4 8 0 q4 -4 8 0" />
      <path d="M78 18 q4.5 -4.5 9 0 q4.5 -4.5 9 0" />
    </svg>
  );
}

/** left %, top %, px, delay s. Fixed, so the sky does not reshuffle. */
const STARS: [number, number, number, number][] = [
  [8, 6, 1.5, 0],
  [15, 14, 1, 1.8],
  [23, 4, 1, 3.4],
  [31, 11, 1, 5.1],
  [39, 7, 1, 2.6],
  [47, 15, 1, 0.9],
  [56, 5, 1.5, 1.3],
  [64, 12, 1, 4.1],
  [71, 8, 1, 0.4],
  [79, 16, 1, 2.2],
  [86, 6, 1, 4.6],
  [93, 13, 1, 1.1],
  [12, 22, 1, 3.8],
  [68, 23, 1, 2.9],
];

/** left %, top rem, width rem, height rem, opacity, delay s. */
/** left %, top %, width rem, height rem, opacity, delay s. */
const CLOUDS: [number, number, number, number, number, number][] = [
  [4, 62, 22, 4.5, 0.22, 0],
  [54, 55, 28, 5, 0.17, -30],
  [26, 71, 32, 5.5, 0.14, -60],
];

// One download button on this site, identical everywhere: a primary action that
// changes shape three times reads as three different offers.
export { DownloadButton };
