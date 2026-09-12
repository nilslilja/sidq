/*
 * The launch card.
 *
 * Sidq starts with the operating system and, until now, gave no sign of it: the
 * pill appears silently somewhere near the menu bar a few seconds later, which
 * on a login where twelve things are starting at once is indistinguishable from
 * nothing happening. Every serious Mac app that lives in the background puts
 * something on screen at launch. It is not decoration — it is the only evidence
 * the thing you installed is running.
 *
 * Its own window rather than a state of another one: the pill is 232 points
 * wide and this has to be readable, and the main window is not open at launch
 * and should not be.
 *
 * The window is transparent and undecorated, so everything visible here is
 * painted below. That also means nothing flashes white while the webview
 * loads — an empty transparent window is invisible rather than a bright
 * rectangle in the middle of somebody's screen.
 */

import { SidqMark } from '@/components/SidqMark';

export function Splash() {
  return (
    <div
      /*
       * `body` paints the site's off-white and this window is transparent, so
       * without opting out that colour bleeds around the card as a cream frame
       * on every edge. It reads as a rendering fault, and it does not reproduce
       * in a browser tab, which is how the pill shipped with it once already.
       */
      data-transparent-window=""
      className="flex h-[100dvh] w-full items-center justify-center bg-transparent p-1"
    >
      <div
        className="flex h-full w-full flex-col items-center justify-center rounded-[22px]"
        style={{
          // The hero's dawn, cropped to the top where it is still night. The
          // same three stops the website opens on, so the first thing you see
          // at login is the thing that sold it to you.
          background:
            "linear-gradient(165deg, #46437B 0%, #3A3968 55%, #2E2D55 100%)",
          boxShadow:
            "0 1px 0 0 rgba(255,255,255,0.10) inset, 0 24px 60px -20px rgba(0,0,0,0.55)",
        }}
      >
        <Mark />

        <p className="mt-6 font-display text-[1.75rem] leading-none tracking-[-0.04em] text-white">
          Sidq
        </p>

        {/*
         * A ring, not a percentage.
         *
         * There is no progress to report: the app is reading transcripts and
         * opening a database, and either it is ready or it is not. A bar that
         * moves at a rate nobody can predict is a worse lie than a spinner.
         */}
        <span
          aria-hidden="true"
          className="splash-spin mt-14 size-5 rounded-full border-2 border-white/20 border-t-white/80"
        />

        <span className="sr-only" role="status">
          Starting Sidq
        </span>
      </div>
    </div>
  );
}

/*
 * The app icon's own paths, at launch size and in white.
 *
 * Same two `d` strings as the sidebar mark in Home. They are the icon's, and a
 * wordmark that has quietly drifted from the app icon is not something anybody
 * notices by looking.
 */
function Mark() {
  return (
    <SidqMark
      width={132}
      height={71}
      className="text-white"
    />
  );
}
