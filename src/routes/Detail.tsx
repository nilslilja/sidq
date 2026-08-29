import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { Pricing } from "@/components/landing/Pricing";
import { Faq } from "@/components/landing/Faq";
import { SiteFooter } from "@/components/landing/SiteFooter";

/*
 * The two pages the landing page stopped being.
 *
 * Pricing and the questions used to be the sixth and seventh sections of a
 * single scroll. They are worth keeping and they are not worth putting in front
 * of somebody who came to download a free Mac app, so they are a click away.
 *
 * Their own routes rather than one page with anchors, because they are
 * genuinely different questions — what it costs, and whether it does the thing
 * — and because each one is then something you can send to a person on its own.
 */

/** A light page, with a header that reads on paper rather than on the hero. */
function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-paper">
      <header className="border-b border-ink/10">
        <div className="mx-auto flex max-w-[76rem] items-center justify-between gap-6 px-6 py-5">
          <Link
            to="/"
            className={cn(
              "inline-flex min-h-11 items-center sm:min-h-0",
              "font-display text-[1.375rem] leading-none tracking-[-0.05em]",
            )}
          >
            Sidq
          </Link>

          <nav className="flex items-center gap-6 sm:gap-7">
            <Link
              to="/pricing"
              className="inline-flex min-h-11 items-center text-[0.875rem] transition-opacity duration-150 hover:opacity-60 sm:min-h-0"
            >
              Pricing
            </Link>
            <Link
              to="/faq"
              className="inline-flex min-h-11 items-center text-[0.875rem] transition-opacity duration-150 hover:opacity-60 sm:min-h-0"
            >
              Questions
            </Link>
            <Link
              to="/"
              className="inline-flex min-h-11 items-center rounded-[10px] bg-ink px-4 text-[0.875rem] font-medium text-paper transition-opacity duration-150 hover:opacity-90 sm:min-h-9"
            >
              Download
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[76rem] px-6 py-16 lg:py-24">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export function PricingPage() {
  return (
    <Page>
      <Pricing />
    </Page>
  );
}

export function FaqPage() {
  return (
    <Page>
      <Faq />
    </Page>
  );
}
