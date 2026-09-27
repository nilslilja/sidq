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
import { SidqDot } from '@/components/SidqDot';

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
        className="flex h-full w-full flex-col items-center justify-center rounded-[22px] bg-paper"
        style={{
          // The website's card: paper, a hairline, one neutral shadow. It was a
          // violet gradient, the last thing on screen still in the old colour.
          boxShadow: "0 0 0 1px rgba(18,18,26,0.08), 0 24px 60px -20px rgba(18,18,26,0.45)",
        }}
      >
        <Mark />

        <p className="mt-6 font-display text-[1.75rem] font-semibold leading-none tracking-[-0.05em] text-ink">
          Sidq
        </p>

        {/*
         * The dot instead of a spinner. It is what sits on screen once Sidq is
         * running, so the first thing anybody sees of it is the thing they will
         * see all day, already breathing.
         */}
        <span className="mt-14">
          <SidqDot mood="idle" />
        </span>

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
      className="text-[#4F46E5]"
    />
  );
}
