import { Link } from "react-router-dom";
import { Wordmark } from "@/components/landing/Wordmark";
import { Hero } from "@/components/landing/Hero";
import { LaunchFilm } from "@/components/landing/LaunchFilm";
import { QuestionSpread } from "@/components/landing/QuestionSpread";
import { TellOne } from "@/components/landing/TellOne";
import { Compare } from "@/components/landing/Compare";
import { WorksWith } from "@/components/landing/WorksWith";
import { HandoverFilm } from "@/components/landing/HandoverFilm";
import { HeroStats } from "@/components/landing/HeroStats";
import { Pricing } from "@/components/landing/Pricing";
import { Faq } from "@/components/landing/Faq";
import { SiteFooter } from "@/components/landing/SiteFooter";

/*
 * Landing.
 *
 * The page the launch film points at, in the film's order: the promise, the
 * film itself, the questions every AI keeps asking, what it looks like when
 * they stop, how that compares with every other way of getting there, and
 * then the real thing working today, the price and the questions.
 *
 * It used to be a door: a headline, a line, a button. That was right while the
 * only visitors were people who already wanted the app. People arriving from a
 * thirty second film want the argument finished before they download, and the
 * argument is short enough to make in five screens.
 */

export function Landing() {
  return (
    <div className="bg-paper">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-[76rem] items-center justify-between gap-4 px-5 py-5 sm:gap-6 sm:px-6">
          <Wordmark />

          {/*
           * Three links, and two of them are the pages this one stopped being.
           * A header on a one-screen page is navigation to elsewhere, not a
           * table of contents for what is below it.
           */}
          <nav className="flex items-center gap-4 sm:gap-7">
            {/* Anchors, not routes. Both sections are on this page; the
                routes stay for anybody sent a direct link. */}
            <a
              href="#pricing"
              className="inline-flex min-h-11 items-center text-[0.875rem] text-ink/70 transition-opacity duration-150 hover:opacity-70 sm:min-h-0"
            >
              Pricing
            </a>
            <a
              href="#faq"
              className="inline-flex min-h-11 items-center text-[0.875rem] text-ink/70 transition-opacity duration-150 hover:opacity-70 sm:min-h-0"
            >
              Questions
            </a>
            <Link
              to="/signin"
              className="inline-flex min-h-11 items-center text-[0.875rem] text-ink/70 transition-opacity duration-150 hover:opacity-70 sm:min-h-0"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <Hero />
      <LaunchFilm />
      <QuestionSpread />
      <TellOne />
      <Compare />

      <WorksWith />

      {/*
       * The real thing, after the promise.
       *
       * Everything above is the argument, and two of its four moments are
       * marked as coming next. This is the part that works on a Mac today,
       * recorded from the real interface, so the page ends on proof rather
       * than on a picture of the future.
       */}
      <section
        aria-labelledby="see-it"
        className="relative px-5 pb-16 pt-16 sm:px-6 sm:pb-20 lg:pb-28"
      >
        <div className="mx-auto max-w-[64rem]">
          <h2
            id="see-it"
            className="mb-10 max-w-[20ch] font-display text-[clamp(2rem,4.2vw,3.25rem)] font-semibold leading-[1.04] tracking-[-0.045em] text-ink"
          >
            The real thing, working today
          </h2>
          <HandoverFilm />
          <p className="ink-muted mt-6 max-w-[46ch] text-[1rem] leading-relaxed">
            The real interface, and the real document it writes. Nothing here is
            a mock up of something that works differently.
          </p>
          <div className="mt-14">
            <HeroStats />
          </div>
        </div>
      </section>

      <section
        className="mx-auto max-w-[76rem] px-5 py-16 sm:px-6 sm:py-20 lg:py-28"
      >
        <Pricing />
      </section>

      <section className="mx-auto max-w-[76rem] px-5 pb-16 sm:px-6 sm:pb-20 lg:pb-28">
        <Faq limit={4} />
      </section>

      <SiteFooter />
    </div>
  );
}
