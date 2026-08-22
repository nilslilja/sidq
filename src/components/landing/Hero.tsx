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
        <div className="mb-7 flex justify-center">
          <PoweredByClaude />
        </div>

        <h1
          id="hero"
          className="mx-auto max-w-[19ch] text-center font-display text-[clamp(2.5rem,5.6vw,4.75rem)] leading-[0.96] tracking-[-0.042em] text-white"
        >
          The models got extraordinary. Nobody joined them up
        </h1>

        {/*
          * The headline says what Sidq is, not what is wrong this week.
          *
          * It was rewritten three times in three days — "Start where you
          * actually stopped", "Your AI is hiding half of what it thinks",
          * "Every AI you open starts from zero" — each a true sentence about a
          * symptom, and each meaning the site said something different from the
          * site a week earlier. That is how a product ends up with no identity.
          *
          * This one is the position rather than a symptom, and it is the whole
          * argument in seven words: the models are the achievement of the
          * decade and they cannot see each other. Sidq is the layer that joins
          * them. Symptoms belong in the posts, where a new angle every week is
          * the point.
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
        <p className="mx-auto mt-7 text-center text-[clamp(1.0625rem,1.7vw,1.4375rem)] leading-snug text-white/60">
          Sidq is the layer that does.
        </p>

        <div className="mt-10 flex justify-center">
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
            caption="Sidq hangs off the menu bar. One keystroke opens every conversation you have had with any assistant, and the one you pick is carried into the next one word for word."
          />
        </ScrollTilt>
      </div>
    </section>
  );
}

// The CTA itself lives in DownloadButton, re-exported here only so the existing
// call sites keep working. There is one download button on this site and it is
// identical everywhere, because a primary action that changes shape three times
// reads as three different offers.
export { DownloadButton };
