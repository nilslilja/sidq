import { ProductVideo } from './ProductVideo';
import { DownloadButton } from './DownloadButton';
import { PoweredByClaude } from './PoweredByClaude';
import { ScrollTilt } from './ScrollTilt';

/*
 * The hero.
 *
 * A dawn sky, a single sentence, one lit button, and the product sitting under
 * the fold line so the first scroll lands on it.
 *
 * The sky is not decoration borrowed from a competitor. Every handover is a
 * picking-up-again, and a sunrise is the most direct statement of that without
 * writing the word. It also costs nothing: four gradient stops and a blurred
 * circle, no photograph to license and no megabytes to ship.
 */

export function Hero() {
  return (
    <section className="relative overflow-hidden" aria-labelledby="hero">
      {/* ── The sky ──────────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        // The light stops sit low on purpose. Every line of hero copy has to land
        // on the dark half, or white text on pale peach fails contrast outright,
        // which is exactly what the first pass did to the "Free. No card." line.
        // Measured, not guessed: the last line of hero copy ends at 41% of this
        // block's height, so the sky stays dark to 42% and the dawn runs from
        // there down. That keeps every piece of white text on a dark field while
        // still putting real sunrise above the fold on a normal display.
        className="absolute inset-x-0 top-0 h-[62rem] bg-[linear-gradient(180deg,#33325F_0%,#3E3C70_22%,#514E86_42%,#7D739F_54%,#B08FA0_65%,#D9A88E_76%,#F3D3B0_88%,#F7F6F3_100%)]"
      />
      {/*
        * Grain over the whole sky.
        *
        * A single gradient stretched down sixty-two rem bands visibly on an
        * eight bit display — flat stripes across the purple, which is the one
        * artefact that makes a hand-made sky look cheap. Noise breaks the
        * banding up and is the difference between a gradient and a surface.
        *
        * An inline SVG turbulence as a data URI: no request, no file, and it
        * tiles at any size.
        */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[62rem] opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* ── Weather ───────────────────────────────────────────────────────
        *
        * Stars, one rare shooting star, two skeins of birds and some cloud on
        * the horizon. Everything here is pitched at the edge of noticeable:
        * this sky's first job is holding white copy at contrast, and anything
        * that pulls attention off the headline is a fault rather than a
        * flourish.
        *
        * Positions are written down rather than random, so the sky is the same
        * sky on every render and in every screenshot.
        */}
      <Sky />

      {/* The sun, low and just off centre. Breathing, so the page is alive
          before anything has been scrolled. */}
      <div
        aria-hidden="true"
        className="bloom-breathe absolute left-[72%] top-[38rem] size-[22rem] -translate-x-1/2 rounded-full bg-[#FFE9C4] opacity-70 blur-[70px]"
      />
      {/* A horizon ridge. One path, low contrast, purely to give the sky a floor. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1440 220"
        preserveAspectRatio="none"
        className="absolute inset-x-0 top-[43rem] h-[14rem] w-full"
      >
        {/* A third ridge behind the other two, paler and lower in contrast.
            Distance in a flat drawing comes from exactly this: the far thing is
            lighter, not smaller. */}
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

      <div className="relative mx-auto max-w-[76rem] px-6 pt-24 lg:pt-32">
        {/*
          * ── Arriving, rather than being there already ─────────────────────
          *
          * Everything below the fold has come in on a Reveal since the start;
          * the hero, which is the only thing most people see, was simply
          * present. The page loaded finished.
          *
          * Same discipline as `Reveal`: sixteen pixels and a fade, opacity and
          * transform only so it stays on the compositor, and the whole thing
          * off under prefers-reduced-motion — the keyframes in global.css are
          * guarded there, so nothing here needs to check.
          *
          * Staggered by roughly a tenth of a second, in reading order. Any
          * further apart and it stops being an entrance and starts being a
          * sequence somebody has to wait through.
          */}
        <div className="animate-rise mb-7 flex justify-center">
          <PoweredByClaude />
        </div>

        <h1
          id="hero"
          className="animate-rise mx-auto max-w-[22ch] text-balance text-center font-display text-[clamp(2.5rem,5.6vw,4.75rem)] leading-[0.96] tracking-[-0.042em] text-white"
          style={{ animationDelay: '90ms' }}
        >
          The models remember everything except&nbsp;you
        </h1>

        {/*
          * ── The headline is chosen, and it is now closed ──────────────────
          *
          * Four in total. The first three went in three days — "Start where
          * you actually stopped", "Your AI is hiding half of what it thinks",
          * "Every AI you open starts from zero" — each true, each about a
          * symptom, and each meaning the site said something different from
          * the site a week earlier. That is how a product ends up with no
          * identity, and it is the reason this one was picked on a stated bar
          * instead of on a Tuesday feeling.
          *
          * The bar was: would a stranger screenshot this and post it with no
          * caption. Everything else followed from it. No named villain, because
          * Sidq is built with Claude and the mark is on this very page, so
          * picking that fight would be both ungrateful and stupid. No hedge,
          * because the claim is simply true. The gap is stated as settled fact,
          * which is what confidence sounds like in a sentence.
          *
          * There is a second line, and it is not this one. "Stop introducing
          * yourself to robots" is the pitch: what you say to a person, what
          * goes on the social card, what sits over the download button below.
          * A headline is read; a pitch is repeated. They are different jobs and
          * they needed different sentences.
          *
          * The next good idea about what Sidq is goes into a post. Not here.
          */}
        {/*
          * One line under the headline, and nothing else.
          *
          * There were two paragraphs here, one of them fifty words. A hero is
          * read in about a second and a half by somebody deciding whether to
          * keep scrolling, and every sentence after the first is competing with
          * the download button rather than helping it. The argument did not get
          * cut, it moved to WhatThisMeans, where somebody who has decided to
          * care will actually read it.
          */}
        <p
          className="animate-rise mx-auto mt-7 max-w-[46ch] text-center text-[clamp(1.0625rem,1.7vw,1.4375rem)] leading-snug text-white/60"
          style={{ animationDelay: '180ms' }}
        >
          Sidq is the memory layer. Every conversation you have ever had, carried whole into
          whichever AI you open next.
        </p>

        {/*
          * The pitch, directly over the button.
          *
          * This is the line somebody repeats, so it belongs at the moment they
          * are deciding — not buried in the body where it would be read once
          * and never said. It is deliberately the rudest sentence on the page
          * and it is the only one that is.
          */}
        <p
          className="animate-rise mt-11 text-center font-display text-[clamp(1.375rem,2.4vw,1.875rem)] tracking-[-0.03em] text-white"
          style={{ animationDelay: '260ms' }}
        >
          Stop introducing yourself to robots.
        </p>

        <div className="animate-rise mt-7 flex justify-center" style={{ animationDelay: '340ms' }}>
          <DownloadButton size="lg" />
        </div>

        <p className="mt-5 text-center text-[0.8125rem] text-white/55">
          Free. No card. Mac app, about a minute to set up.
        </p>

        {/*
         * The product, breaking the fold.
         *
         * Drop the recording at public/video/sidq.mp4 and this becomes real
         * footage. Until then it renders the drawn mock, so the page is never
         * waiting on an asset that does not exist.
         *
         * The clip to shoot is the handover: the bar hanging off the menu bar,
         * ⌘⇧K, a real list of real conversations, Enter, and the file landing
         * in another assistant that picks the thread up mid-thought. That last
         * beat is the whole argument and no competitor can film it, because
         * none of them can read the conversation you had somewhere else.
         */}
        <ScrollTilt className="mt-16 lg:mt-20">
          <ProductVideo
            caption="Sidq hangs off the menu bar. One keystroke opens every conversation you have had with any AI, and the one you pick is carried into the next one word for word."
          />
        </ScrollTilt>
      </div>
    </section>
  );
}

/**
 * The dark half of the sky, with things happening in it.
 *
 * Kept out of the main component because it is twenty absolutely positioned
 * decorations and none of them are the hero's argument.
 */
function Sky() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[62rem]">
      {/* Stars, only in the band that stays dark. Below about 34% the sky is
          already warming and a star there reads as a speck of dust. */}
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
        style={{ left: '18%', top: '9%', rotate: '24deg' }}
      />
      <span
        className="sky-shoot absolute h-px w-[5rem] origin-left rounded-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.7))]"
        style={{ left: '63%', top: '17%', rotate: '31deg', animationDelay: '11s' }}
      />

      {/* Birds. Two skeins at different heights and speeds, which is the only
          thing that makes a flat silhouette read as distance.
          
          Kept in the dark upper half. Lower down the sky is already warming
          towards peach and a white silhouette has almost no contrast left —
          the birds were there first and simply could not be seen. */}
      <div className="sky-cross absolute left-0 top-[21%] w-full opacity-[0.26]">
        <Birds />
      </div>
      <div
        className="sky-cross absolute left-0 top-[27%] w-full scale-[0.62] opacity-[0.17]"
        style={{ animationDelay: '-26s', animationDuration: '86s' }}
      >
        <Birds />
      </div>

      {/* Cloud, low and warm, where the sky is already turning. Blurred ovals
          rather than shapes: anything with an edge starts looking like a logo. */}
      {CLOUDS.map(([left, top, w, h, opacity, delay], i) => (
        <span
          key={i}
          className="sky-cloud absolute rounded-full bg-[#FFE3CB] blur-[26px]"
          style={{
            left: `${left}%`,
            top: `${top}rem`,
            width: `${w}rem`,
            height: `${h}rem`,
            opacity,
            animationDelay: `${delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/** Three birds, as three strokes. At this size anything more is mud. */
function Birds() {
  return (
    <svg viewBox="0 0 120 30" className="h-[1.6rem] w-[7rem]" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round">
      <path d="M6 14 q5 -5 10 0 q5 -5 10 0" />
      <path d="M44 8 q4 -4 8 0 q4 -4 8 0" />
      <path d="M78 18 q4.5 -4.5 9 0 q4.5 -4.5 9 0" />
    </svg>
  );
}

/** left %, top %, px, delay s. Fixed, so the sky does not reshuffle. */
const STARS: [number, number, number, number][] = [
  [8, 6, 1.5, 0], [15, 14, 1, 1.8], [23, 4, 1, 3.4], [31, 11, 1.5, 0.9],
  [39, 7, 1, 2.6], [47, 16, 1, 4.1], [56, 5, 1.5, 1.3], [64, 12, 1, 3.1],
  [71, 8, 1, 0.4], [79, 15, 1.5, 2.2], [86, 6, 1, 4.6], [93, 13, 1, 1.1],
  [12, 22, 1, 3.8], [35, 25, 1, 5.2], [68, 23, 1, 2.9], [88, 27, 1, 4.4],
];

/** left %, top rem, width rem, height rem, opacity, delay s. */
const CLOUDS: [number, number, number, number, number, number][] = [
  [6, 34, 22, 3.5, 0.16, 0],
  [58, 31, 28, 4, 0.12, -30],
  [30, 39, 34, 4.5, 0.1, -60],
];

// The CTA itself lives in DownloadButton, re-exported here only so the existing
// call sites keep working. There is one download button on this site and it is
// identical everywhere, because a primary action that changes shape three times
// reads as three different offers.
export { DownloadButton };
