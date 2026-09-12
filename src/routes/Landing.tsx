import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { Hero } from "@/components/landing/Hero";
import { Reveal } from "@/components/landing/Reveal";
import { WorksWith } from "@/components/landing/WorksWith";
import { HandoverFilm } from "@/components/landing/HandoverFilm";
import { HeroStats } from "@/components/landing/HeroStats";
import { Pricing } from "@/components/landing/Pricing";
import { Faq } from "@/components/landing/Faq";
import { SiteFooter } from "@/components/landing/SiteFooter";

/*
 * Landing.
 *
 * One job, and now only that job: get the app onto the machine.
 *
 * There were eight sections here — the argument, the product, the two moments,
 * the cost of carrying on, the offer, the pricing table, the questions. All of
 * it true and most of it unread, because nobody reads a marketing page to
 * decide whether to install a free Mac app.
 *
 * The reference is goldfish.sh: a headline, a line, a button, a footer, about a
 * hundred and thirty words. Pricing and the questions did not get deleted, they
 * got their own routes, so the landing page is a door rather than a pitch and
 * anybody who wants the detail is one click from it.
 */

export function Landing() {
  return (
    <div className="bg-paper">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-[76rem] items-center justify-between gap-4 px-5 py-5 sm:gap-6 sm:px-6">
          <Link
            to="/"
            className={cn(
              "inline-flex min-h-11 items-center sm:min-h-0",
              "font-display text-[1.375rem] leading-none tracking-[-0.05em] text-white",
            )}
          >
            Sidq
          </Link>

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
              className="inline-flex min-h-11 items-center text-[0.875rem] text-white/75 transition-opacity duration-150 hover:opacity-70 sm:min-h-0"
            >
              Pricing
            </a>
            <a
              href="#faq"
              className="inline-flex min-h-11 items-center text-[0.875rem] text-white/75 transition-opacity duration-150 hover:opacity-70 sm:min-h-0"
            >
              Questions
            </a>
            <Link
              to="/signin"
              className="inline-flex min-h-11 items-center text-[0.875rem] text-white/75 transition-opacity duration-150 hover:opacity-70 sm:min-h-0"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <Hero />

      {/*
       * The names, directly under the number that counts them. Anyone who read
       * "10 assistants" in the hero and wondered whether theirs is one of them
       * gets the answer in the next screenful rather than having to install to
       * find out.
       */}
      {/*
       * ── The demonstration, straddling the fold ────────────────────────────
       *
       * It used to live between the roster and the price, which meant somebody
       * had to already be persuaded enough to scroll past two sections before
       * they saw the product do anything.
       *
       * Now it starts inside the hero. The top quarter of the film sits over
       * the bottom of the sky and is already running when the page loads, so
       * the first screen contains a moving product rather than a promise about
       * one, and the frame is visibly cut off — which is the part that makes
       * somebody scroll. The rest arrives as they do.
       *
       * The negative margin is what pulls it up over the hero, and it is tuned
       * against one hard constraint: it may never touch the download button.
       * At 16vh it covered the button by seventy pixels, which trades the only
       * conversion on the page for an effect. Four leaves the button clear and
       * still puts roughly a third of the film in the first screen.
       *
       * It is on this wrapper rather than in the hero's own padding so the hero
       * stays a self-contained section that reads without knowing this exists.
       */}
      <section
        aria-labelledby="see-it"
        className="relative z-10 -mt-[4vh] px-5 pb-16 sm:px-6 sm:pb-20 lg:-mt-[6vh] lg:pb-28"
      >
        <div className="mx-auto max-w-[68rem]">
          <HandoverFilm />

          {/*
           * The heading comes after the film, not before it.
           *
           * Above, it would be a label on something already visible and would
           * push the film out of the first screen, which is the one thing this
           * placement exists to avoid. Underneath it reads as the caption to
           * what somebody has just watched.
           */}
          <h2
            id="see-it"
            className="mx-auto mt-12 max-w-[20ch] text-balance text-center font-serif text-[clamp(1.75rem,3.6vw,2.75rem)] leading-[1.0]"
          >
            Watch a conversation change hands
          </h2>
          <p className="ink-muted mx-auto mt-4 max-w-[46ch] text-balance text-center text-[1rem] leading-relaxed">
            The real interface, and the real document it writes. Nothing here is
            a mock-up of something that works differently.
          </p>

          {/*
           * The measurements, after the demonstration rather than before it.
           * Four numbers about a product somebody has just watched work read as
           * evidence; the same four ahead of it are claims.
           */}
          <div className="mt-14">
            <HeroStats />
          </div>
        </div>
      </section>

      <Reveal>
        <WorksWith />
      </Reveal>

      {/*
       * Pricing and the questions are on the page again.
       *
       * They were moved to their own routes when this became a download page,
       * and a header link that navigates somewhere else is a worse answer than
       * one that scrolls: somebody wondering what it costs wants the number in
       * the same breath, not a page load. The routes still exist, so each is
       * something you can send to a person on its own, but nobody has to leave
       * to read either one.
       *
       * That is still two sections against the original eight. What did not
       * come back is the argument: the three feature bands, the stats, the
       * second download panel. Nobody reads a case for a free Mac app.
       */}
      <section className="mx-auto max-w-[76rem] px-5 py-16 sm:px-6 sm:py-20 lg:py-28">
        <Reveal>
          <Pricing />
        </Reveal>
      </section>

      <section className="mx-auto max-w-[76rem] px-5 pb-16 sm:px-6 sm:pb-20 lg:pb-28">
        <Reveal>
          <Faq limit={4} />
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  );
}
