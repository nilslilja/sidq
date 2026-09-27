/*
 * The hero, rebuilt around the launch film.
 *
 * The film opens on a feed of questions every AI keeps asking and ends on one
 * line: your AIs, finally on the same page. Somebody who clicks through from
 * it should land on the same sentence in the same room, so the sky is gone and
 * the page is the film's: warm paper, ink, one blue.
 *
 * The last word is written, not set. It is the one place on the page that looks
 * like a person did it, which is the point of the product: the memory is in
 * your own words. See HandwritingText for how the pen works.
 *
 * The only thing that moves is the pen. No badge above the headline, no glow
 * behind it, no staggered entrance: those are what every generated landing
 * page has, and this one should look written by somebody.
 */
import { DownloadButton, usePlatform } from "./DownloadButton";
import { HandwritingText } from "./HandwritingText";
import { WaitlistForPlatform } from "./WaitlistForPlatform";

export function Hero() {
  const { platform } = usePlatform();

  return (
    <section
      className="relative bg-paper"
      aria-labelledby="hero"
    >
      <div className="relative mx-auto flex max-w-[64rem] flex-col items-center px-6 pb-16 pt-32 sm:pb-20 [@media(min-height:820px)]:pt-40">
        <h1
          id="hero"
          className="w-full text-center font-display text-[clamp(2.75rem,7.2vw,6.25rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-ink"
        >
          Your AIs, finally
          <br className="hidden sm:block" /> on the same{" "}
          <HandwritingText className="-mb-[0.1em] text-[#2448E8] [font-size:1.12em]" delay={0.55} />
        </h1>

        <p
          className="mt-7 max-w-[40rem] text-balance text-center text-[clamp(1.0625rem,1.6vw,1.3125rem)] leading-relaxed text-ink/70"
        >
          Every AI you use starts from zero, so you explain your work again in
          every one of them. Sidq is one memory for all of them.{" "}
          <span className="text-ink">Tell one AI. The rest already know.</span>
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-6">
          <DownloadButton size="lg" />
          <a
            href="#film"
            className="text-[0.9375rem] font-medium text-ink underline decoration-ink/25 underline-offset-4 transition-colors duration-150 hover:decoration-ink"
          >
            Watch the film
          </a>
        </div>

        <p className="mt-5 text-center text-[0.8125rem] text-ink/60">
          Free for Mac, in early access. Your memory stays on your Mac.
        </p>

        {/* Has to stay on the page the button is on: the button points a phone
            at `#waitlist-email`, and without the form that is a dead link. */}
        {!platform.startsWith("macos") && (
          <div className="mt-2 w-full max-w-[34rem]">
            <WaitlistForPlatform platform={platform} />
          </div>
        )}
      </div>
    </section>
  );
}
