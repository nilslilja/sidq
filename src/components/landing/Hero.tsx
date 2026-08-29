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
        className="absolute inset-x-0 top-0 h-[56rem] bg-[linear-gradient(180deg,#33325F_0%,#3E3C70_22%,#514E86_42%,#7D739F_54%,#B08FA0_65%,#D9A88E_76%,#F3D3B0_88%,#F7F6F3_100%)]"
      />

      {/*
       * Grain over the sky, because a single gradient stretched this far bands
       * visibly on an eight bit display, and flat stripes across the purple is
       * the one artefact that makes a hand-made sky look cheap.
       */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[56rem] opacity-[0.035] mix-blend-overlay"
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
        className="bloom-breathe absolute left-[72%] top-[33rem] size-[34rem] -translate-x-1/2 rounded-full"
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
        className="absolute inset-x-0 top-[39rem] h-[14rem] w-full"
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

      <div className="relative mx-auto flex min-h-[46rem] max-w-[52rem] flex-col items-center px-6 pb-28 pt-28 lg:pt-32">
        <div className="animate-rise mb-9">
          <PoweredByClaude />
        </div>

        <h1
          id="hero"
          className="animate-rise text-balance text-center font-display text-[clamp(2.5rem,7vw,4.75rem)] leading-[0.95] tracking-[-0.045em] text-white"
          style={{ animationDelay: "80ms" }}
        >
          The models remember everything except&nbsp;you
        </h1>

        <p
          className="animate-rise mt-7 max-w-[44ch] text-balance text-center text-[clamp(1.0625rem,1.7vw,1.375rem)] leading-snug text-white/60"
          style={{ animationDelay: "160ms" }}
        >
          Sidq is the one that remembers. Every conversation you have ever had,
          carried whole into whichever AI you open next.
        </p>

        {/* The line somebody repeats, directly over the button. */}
        <p
          className="animate-rise mt-10 text-center font-display text-[clamp(1.25rem,2.4vw,1.75rem)] tracking-[-0.03em] text-white"
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

        <p className="mt-5 text-center text-[0.8125rem] text-white/55">
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
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-[56rem]"
    >
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
            top: `${top}rem`,
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
const CLOUDS: [number, number, number, number, number, number][] = [
  [6, 30, 24, 5, 0.2, 0],
  [58, 27, 30, 5.5, 0.15, -30],
  [30, 35, 36, 6, 0.13, -60],
];

// One download button on this site, identical everywhere: a primary action that
// changes shape three times reads as three different offers.
export { DownloadButton };
