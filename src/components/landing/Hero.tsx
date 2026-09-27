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
 * Nothing here moves after the first second. The headline rises, the word is
 * written, and then the page is still, because this is a door and not a show.
 */
import { DownloadButton, usePlatform } from "./DownloadButton";
import { HandwritingText } from "./HandwritingText";
import { WaitlistForPlatform } from "./WaitlistForPlatform";

export function Hero() {
  const { platform } = usePlatform();

  return (
    <section
      className="relative overflow-hidden bg-paper"
      aria-labelledby="hero"
    >
      {/*
       * The light in the room. Two washes painted into the ground, warm on one
       * side and the brand's lilac on the other, fixed rather than animated:
       * decoration that moves costs a frame budget on a page people read.
       */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(70%_60%_at_85%_0%,rgba(255,196,150,0.28),transparent_60%),radial-gradient(60%_55%_at_8%_10%,rgba(140,120,255,0.16),transparent_60%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative mx-auto flex max-w-[64rem] flex-col items-center px-6 pb-16 pt-28 sm:pb-20 [@media(min-height:820px)]:pt-36">
        <p
          className="animate-rise inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-1.5 text-[0.75rem] font-medium tracking-[0.02em] text-ink/70 shadow-[0_1px_2px_rgba(20,18,28,0.06),0_8px_24px_-12px_rgba(70,50,140,0.35)] ring-1 ring-black/[0.05]"
          style={{ animationDelay: "0ms" }}
        >
          <span className="size-1.5 rounded-full bg-[#4F46E5]" aria-hidden="true" />
          The memory layer for AI. Early access for Mac.
        </p>

        <h1
          id="hero"
          className="animate-rise mt-8 w-full text-center font-display text-[clamp(2.75rem,7.2vw,6.25rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-ink [text-shadow:0_1px_0_rgba(255,255,255,0.6),0_18px_40px_rgba(70,50,140,0.12)]"
          style={{ animationDelay: "80ms" }}
        >
          Your AIs, finally
          <br className="hidden sm:block" /> on the same{" "}
          <HandwritingText className="-mb-[0.1em] text-[#2448E8] [font-size:1.12em]" delay={0.55} />
        </h1>

        <p
          className="animate-rise mt-7 max-w-[40rem] text-balance text-center text-[clamp(1.0625rem,1.6vw,1.3125rem)] leading-relaxed text-ink/70"
          style={{ animationDelay: "150ms" }}
        >
          Every AI you use starts from zero, so you explain your work again in
          every one of them. Sidq is one memory for all of them.{" "}
          <span className="text-ink">Tell one AI. The rest already know.</span>
        </p>

        <div
          className="animate-rise mt-9 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "230ms" }}
        >
          <DownloadButton size="lg" />
          <a
            href="#film"
            className="group inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-3 text-[0.9375rem] font-medium text-ink ring-1 ring-black/10 transition-[background-color,box-shadow] duration-150 hover:bg-white hover:shadow-[0_6px_20px_-10px_rgba(70,50,140,0.45)]"
          >
            <span
              aria-hidden="true"
              className="grid size-6 place-items-center rounded-full bg-ink text-[0.625rem] text-paper transition-transform duration-150 group-hover:scale-110"
            >
              ▶
            </span>
            Watch the film
          </a>
        </div>

        <p className="mt-5 text-center text-[0.8125rem] text-ink/60">
          Free for Mac. Private by design: your memory stays on your Mac.
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
