import { PillPreview } from './PillPreview';
import { cn } from '@/lib/cn';

/*
 * Where the bar actually sits, on an ordinary Mac.
 *
 * The one thing worth showing about Sidq is a thing a screenshot of the app on
 * its own cannot: it hangs off the menu bar, above everything, and it is there
 * whether or not you are thinking about it. So this draws a plain desktop and
 * puts the real interface where it really goes.
 *
 * Drawn, not filmed. A recording taken off somebody's actual machine puts their
 * wallpaper, their dock and their open windows on the front page, which is how
 * the last one had to be thrown away. This has nothing in it that belongs to
 * anybody, stays sharp on every display, and cannot go quietly stale the way a
 * screenshot does when the interface moves on.
 *
 * The loop is nine seconds: the bar sitting there, opened into the picker,
 * closed again. Short enough to read twice while somebody is still deciding
 * whether to scroll.
 */

/** Menu titles, so the bar has something ordinary to sit beside. */
const MENUS = ['Finder', 'File', 'Edit', 'View', 'Window', 'Help'];

export function DesktopMock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative aspect-[16/10] w-full overflow-hidden rounded-[18px]',
        // A dawn gradient rather than a stock macOS photo: it belongs to Sidq
        // and there is nothing to license.
        'bg-[linear-gradient(165deg,#2A2A5C_0%,#4C4A8A_28%,#8E7BB0_52%,#D8A08C_74%,#F0C9A0_100%)]',
        'shadow-[0_40px_100px_-30px_rgba(30,27,75,0.55)]',
        className,
      )}
    >
      {/* ── The menu bar the pill hangs from ──────────────────────────────── */}
      <div className="absolute inset-x-0 top-0 z-20 flex h-[5.5%] items-center gap-[1.6%] bg-black/25 px-[2%] backdrop-blur-md">
        <span
          aria-hidden="true"
          className="h-[42%] w-[1.1%] rounded-[1px] bg-white/70"
          style={{ maskImage: 'none' }}
        />
        {MENUS.map((menu, i) => (
          <span
            key={menu}
            className={cn(
              'text-[clamp(0.4rem,0.72vw,0.6875rem)] leading-none',
              i === 0 ? 'font-semibold text-white/85' : 'text-white/55',
            )}
          >
            {menu}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-[1.2%] text-[clamp(0.4rem,0.72vw,0.6875rem)] text-white/55">
          <span aria-hidden="true">100%</span>
          <span aria-hidden="true">Fri 09:41</span>
        </span>
      </div>

      {/* ── A window being worked in, dimmed because it is only context ──── */}
      <div className="absolute inset-x-[9%] bottom-[9%] top-[19%] overflow-hidden rounded-[12px] bg-[#15151C]/95 shadow-[0_20px_70px_-15px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-4 py-2.5">
          <span className="size-2 rounded-full bg-[#FF5F57]" />
          <span className="size-2 rounded-full bg-[#FEBC2E]" />
          <span className="size-2 rounded-full bg-[#28C840]" />
        </div>
        {/* Blurred on purpose. Legible fake code invites people to read the
            fake code instead of looking at the thing above it. */}
        <div className="space-y-2 p-5 opacity-[0.3] blur-[0.5px]">
          {[62, 88, 45, 74, 30, 80, 55, 68].map((width, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-3 shrink-0 rounded-full bg-white/10 py-1" />
              <span
                className={cn(
                  'h-[0.4rem] rounded-full',
                  i % 3 === 0 ? 'bg-[#B8A6FF]/40' : i % 3 === 1 ? 'bg-white/15' : 'bg-white/10',
                )}
                style={{ width: `${width}%` }}
              />
            </div>
          ))}
        </div>
      </div>

      {/*
        * Both states share this mark, flush under the menu bar and centred,
        * because that is exactly where the window puts itself. Anchoring them
        * to the same top edge is what makes the two read as one object opening
        * rather than two things taking turns.
        */}
      <div className="pointer-events-none absolute left-1/2 top-[5.5%] z-30 w-[min(30rem,74%)] -translate-x-1/2">
        {/* Collapsed: the bar, doing nothing. */}
        <div className="shot-bar absolute inset-x-0 top-0 origin-top">
          <div
            className={cn(
              'flex items-center gap-2.5 px-3.5 py-2',
              // Squared where it meets the menu bar, rounded where it ends.
              // That silhouette is a notch, and it is why this reads as part of
              // the machine rather than a window somebody left open.
              'mx-auto w-[min(14rem,52%)] rounded-b-[12px]',
              'border-x border-b border-white/[0.08] bg-[#08080B]/95 backdrop-blur-xl',
              'shadow-[0_10px_24px_-12px_rgba(0,0,0,0.75)]',
            )}
          >
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[#B8A6FF]/70" />
            <span className="flex-1 truncate text-[clamp(0.4rem,0.68vw,0.6875rem)] tracking-wide text-white/50">
              17 conversations
            </span>
            <span className="shrink-0 rounded-[4px] bg-white/[0.06] px-1.5 py-0.5 text-[clamp(0.35rem,0.6vw,0.625rem)] text-white/35">
              ⌘⇧K
            </span>
          </div>
        </div>

        {/* Expanded: the picker, unfurled from the same edge. */}
        <div className="shot-picker absolute inset-x-0 top-0 origin-top">
          <PillPreview
            className="w-full"
            rows={[
              { title: 'Pricing page copy', meta: '5h session · Sidq' },
              { title: 'Onboarding email sequence', meta: '95 exchanges · Verdict' },
              { title: 'Refund policy wording', meta: '40m · Sidq' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
