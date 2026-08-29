import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { Hero } from "@/components/landing/Hero";
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
            <Link
              to="/pricing"
              className="inline-flex min-h-11 items-center text-[0.875rem] text-white/75 transition-opacity duration-150 hover:opacity-70 sm:min-h-0"
            >
              Pricing
            </Link>
            <Link
              to="/faq"
              className="inline-flex min-h-11 items-center text-[0.875rem] text-white/75 transition-opacity duration-150 hover:opacity-70 sm:min-h-0"
            >
              Questions
            </Link>
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
      <SiteFooter />
    </div>
  );
}
