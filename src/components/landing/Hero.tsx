/*
 * The whole website, more or less.
 *
 * This page used to make an argument: the promise, the product, two moments it
 * exists for, what carrying on costs you, what fixing it costs, the objections,
 * then the offer again. Eight sections, a drawn Mac tilting on scroll, sixteen
 * twinkling stars and a WebGL shader behind all of it.
 *
 * It is a download page now. The reference was goldfish.sh, which sells a Mac
 * app with about a hundred and thirty words and a button: a headline, a line
 * saying what it is, download, footer. No features, no screenshots, no pricing.
 * Nobody reads a marketing page to decide whether to install a free Mac app —
 * they install it. Everything that was here is one click away rather than
 * scrolled past.
 *
 * It is also the end of the performance problem. There is nothing left on this
 * page for a compositor to struggle with: no canvas, no blurred layers moving,
 * no transform driven from a scroll handler. The background is one gradient.
 */
import { DownloadButton, usePlatform } from "./DownloadButton";
import { PoweredByClaude } from "./PoweredByClaude";
import { WaitlistForPlatform } from "./WaitlistForPlatform";

export function Hero() {
  const { platform } = usePlatform();

  return (
    <section
      className="relative isolate overflow-hidden"
      aria-labelledby="hero"
      /*
       * Painted, not rendered. This was a fragment shader repainting the
       * viewport behind the entire page; it is three gradient stops now and
       * costs one paint, once.
       */
      style={{
        background:
          "radial-gradient(120% 90% at 50% -10%, #2b2a52 0%, #221f3f 45%, #171531 100%)",
      }}
    >
      <div className="mx-auto flex min-h-[100svh] max-w-[52rem] flex-col items-center justify-center px-6 py-28">
        <PoweredByClaude tone="light" className="mb-10" />

        {/*
         * The headline is the fourth in this project's life and the argument
         * for it is recorded in the commit that chose it: the gap stated as
         * settled fact, no named villain, nothing to walk back. The next good
         * idea about what Sidq is goes in a post, not here.
         */}
        <h1
          id="hero"
          className="animate-rise text-balance text-center font-display text-[clamp(2.5rem,7vw,4.75rem)] leading-[0.95] tracking-[-0.045em] text-white"
        >
          The models remember everything except&nbsp;you
        </h1>

        <p
          className="animate-rise mt-7 max-w-[44ch] text-balance text-center text-[clamp(1.0625rem,1.7vw,1.375rem)] leading-snug text-white/60"
          style={{ animationDelay: "120ms" }}
        >
          Sidq is the one that remembers. Every conversation you have ever had,
          carried whole into whichever AI you open next.
        </p>

        {/* The line somebody repeats, directly over the button. */}
        <p
          className="animate-rise mt-10 text-center font-display text-[clamp(1.25rem,2.4vw,1.75rem)] tracking-[-0.03em] text-white"
          style={{ animationDelay: "200ms" }}
        >
          Stop introducing yourself to robots.
        </p>

        <div
          className="animate-rise mt-7 flex justify-center"
          style={{ animationDelay: "280ms" }}
        >
          <DownloadButton size="lg" />
        </div>

        <p className="mt-5 text-center text-[0.8125rem] text-white/55">
          Free. No card. Mac app, about a minute to set up.
        </p>

        {/*
         * Everyone who is not on a Mac. This has to stay on the page the button
         * is on: the button points a phone at `#waitlist-email`, and with the
         * form somewhere else that is a link to nothing.
         */}
        {!platform.startsWith("macos") && (
          <div className="mt-2 w-full max-w-[34rem] text-white [&_.ink-muted]:text-white/55 [&_a]:text-white [&_input]:text-white">
            <WaitlistForPlatform platform={platform} />
          </div>
        )}
      </div>
    </section>
  );
}
