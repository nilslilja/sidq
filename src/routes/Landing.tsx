import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { Hero } from "@/components/landing/Hero";
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
        <div className="mx-auto flex max-w-[76rem] items-center justify-between gap-6 px-6 py-5">
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
          <nav className="flex items-center gap-6 sm:gap-7">
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
      <section className="mx-auto max-w-[76rem] px-6 py-20 lg:py-28">
        <Pricing />
      </section>

      <section className="mx-auto max-w-[76rem] px-6 pb-20 lg:pb-28">
        <Faq limit={4} />
      </section>

      <SiteFooter />
    </div>
  );
}
