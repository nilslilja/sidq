import { Link } from 'react-router-dom';
import { Hero } from '@/components/landing/Hero';
import { HowItHelps } from '@/components/landing/HowItHelps';
import { Pricing } from '@/components/landing/Pricing';
import { Faq } from '@/components/landing/Faq';
import { SiteFooter } from '@/components/landing/SiteFooter';
import { Download } from '@/components/landing/Download';

/*
 * Landing.
 *
 * One job: get the app onto the machine. The page is a single argument, in order:
 * the promise, the product, the two moments it exists for, what it costs you to
 * carry on as you are, what it costs to fix, the objections, the offer again.
 */

const WORKING_DAYS_PER_YEAR = 250;

export function Landing() {
  return (
    <div className="bg-paper">
      {/*
       * Header.
       *
       * Sits at the top of the page and scrolls away with it. It used to be
       * `fixed`, which meant it rode down over every section: dark nav text
       * landing on the dark ink band, the logo sitting on top of the pricing
       * cards, and the whole thing reading as a rendering fault rather than as
       * navigation. A marketing page is read top to bottom once; there is
       * nothing up here worth stealing a strip of every screen for.
       *
       * It is inside the hero's stacking context so the links sit above the sky
       * without needing a z-index war.
       */}
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-[76rem] items-center justify-between gap-6 px-6 py-5">
          <Link
            to="/"
            className="font-display text-[1.375rem] leading-none tracking-[-0.05em] text-white"
          >
            Sidq
          </Link>

          <nav className="flex items-center gap-7">
            <a
              href="#how"
              className="hidden text-[0.875rem] text-white/75 transition-opacity duration-150 hover:opacity-70 sm:inline"
            >
              How it works
            </a>
            <a
              href="#pricing"
              className="hidden text-[0.875rem] text-white/75 transition-opacity duration-150 hover:opacity-70 sm:inline"
            >
              Pricing
            </a>
            <Link
              to="/signin"
              className="text-[0.875rem] text-white/75 transition-opacity duration-150 hover:opacity-70"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <Hero />

      <div id="how">
        <HowItHelps />
      </div>

      {/* ── The cost of carrying on ──────────────────────────────────────── */}
      <section className="bg-ink py-24 text-paper" aria-labelledby="cost">
        <div className="mx-auto max-w-[76rem] px-6">
          <p className="text-[0.625rem] uppercase tracking-[0.24em] text-paper/55">
            What it costs to keep going as you are
          </p>
          <h2
            id="cost"
            className="mt-6 max-w-[20ch] font-display text-[clamp(2.25rem,6vw,4.5rem)] leading-[0.9] tracking-[-0.045em]"
          >
            The day does not fail at 5pm. It fails at 9.
          </h2>

          <div className="mt-14 grid gap-px border border-paper/15 bg-paper/15 sm:grid-cols-3">
            <Stat
              n="~20 min"
              k="Every morning"
              v="Spent deciding what matters, at the hour you are least equipped to decide it."
            />
            <Stat
              n="23 min"
              k="Every interruption"
              v="The documented cost of getting back into the thing you were doing."
            />
            <Stat
              n="0"
              k="Every evening"
              v="Record of what actually happened, so nothing you learn carries into tomorrow."
            />
          </div>

          <p className="mt-10 max-w-[46ch] text-[1rem] leading-relaxed text-paper/70">
            None of that is a discipline problem, and no amount of trying harder touches it.
            It is a measurement problem, and nobody has ever measured it.
          </p>
        </div>
      </section>

      <div id="download">
        <Download />
      </div>

      <div id="pricing">
        <Pricing />
      </div>

      <Faq />

      <SiteFooter />
    </div>
  );
}

function Stat({ k, v, n }: { k: string; v: string; n: string }) {
  return (
    <div className="bg-ink p-6">
      <div className="tabular text-[1.75rem] leading-none text-paper">{n}</div>
      <div className="mt-3 text-[0.625rem] uppercase tracking-[0.2em] text-paper/50">{k}</div>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-paper/75">{v}</p>
    </div>
  );
}

export { WORKING_DAYS_PER_YEAR };
