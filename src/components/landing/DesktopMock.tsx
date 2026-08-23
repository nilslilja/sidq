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
      {/* ── The menu bar the pill lives inside ────────────────────────────── */}
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
          {/*
            * Sidq's own mark, in the menu bar, because that is the only place
            * on a Mac it ever appears.
            *
            * It was asked for in the Dock instead. It cannot go there: Sidq
            * sets its activation policy to accessory, which removes the Dock
            * tile, and that is not incidental — an ordinary application cannot
            * put a window over another app's fullscreen Space, which is most of
            * the day for anybody who works fullscreen. The Dock icon is the
            * price of the pill working at all.
            */}
          <TrayMark />
          <span aria-hidden="true">100%</span>
          <span aria-hidden="true">Fri 09:41</span>
        </span>
      </div>

      {/* ── A window being worked in, dimmed because it is only context ──── */}
      <div className="absolute inset-x-[9%] bottom-[17%] top-[19%] overflow-hidden rounded-[12px] bg-[#15151C]/95 shadow-[0_20px_70px_-15px_rgba(0,0,0,0.6)]">
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
      {/*
        * The bar sits inside the menu bar; the picker hangs below it.
        *
        * Not the same edge any more. Below the menu bar is where a browser
        * draws its tabs, and a bar living there covered three of them in every
        * window, so it moved up into the strip nobody else uses. The picker is
        * far too tall for that and stays underneath.
        */}
      <div className="pointer-events-none absolute left-1/2 top-0 z-30 w-[min(30rem,74%)] -translate-x-1/2">
        {/* Collapsed: inside the menu bar, the width of a word. */}
        <div className="shot-bar absolute inset-x-0 top-0 flex h-[5.5%] origin-top items-center justify-center">
          <div
            className={cn(
              'flex h-full items-center gap-2 px-3',
              // Squared where it meets the menu bar, rounded where it ends.
              // That silhouette is a notch, and it is why this reads as part of
              // the machine rather than a window somebody left open.
              'mx-auto w-[min(9rem,34%)] rounded-b-[7px]',
              // Part of the strip, not a card resting on it: no shadow, no
              // ring, and a translucent black close to the bar's own.
              'bg-black/35 backdrop-blur-md',
            )}
          >
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[#B8A6FF]/70" />
            <span className="truncate text-[clamp(0.35rem,0.6vw,0.625rem)] leading-none text-white/70">
              214
            </span>
          </div>
        </div>

        {/* Expanded: the picker, unfurled from under the menu bar. */}
        <div className="shot-picker absolute inset-x-0 top-[5.5%] origin-top">
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
      {/* ── The Dock ──────────────────────────────────────────────────────
        *
        * Drawn, like everything else here, and for the same reason: a real one
        * would put somebody's actual applications on the front page, and Apple
        * owns every icon in it. These are shapes.
        *
        * It earns its place by saying something true. Sidq is not among them —
        * it is up in the menu bar instead — and a reader who notices that has
        * understood the product without being told.
        */}
      <div className="absolute inset-x-0 bottom-[2.5%] z-10 flex justify-center">
        <div
          className={cn(
            'flex items-end gap-[0.9%] rounded-[14%/38%] px-[1.2%] py-[0.7%]',
            'bg-white/25 ring-1 ring-inset ring-white/25 backdrop-blur-xl',
            'shadow-[0_8px_28px_-10px_rgba(0,0,0,0.45)]',
          )}
          style={{ width: 'min(46%, 26rem)' }}
        >
          {DOCK.map((tile, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="aspect-square flex-1 rounded-[22%] shadow-[0_2px_6px_-1px_rgba(0,0,0,0.35)]"
              style={{ background: tile }}
            />
          ))}

          {/* The divider and the bin, which every Dock has and nothing else does. */}
          <span aria-hidden="true" className="mx-[0.6%] h-[70%] w-px self-center bg-white/35" />
          <span
            aria-hidden="true"
            className="aspect-square flex-1 rounded-[22%] bg-[linear-gradient(160deg,#F2F2F4,#C9C9CF)] shadow-[0_2px_6px_-1px_rgba(0,0,0,0.35)]"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Sidq in the menu bar: the mark from the Dock icon, at menu bar size.
 *
 * The same two strokes as `public/icons/icon.svg`, cropped to the artwork — the
 * whole square shrunk to this size is a smudge, which is the lesson the app
 * window learned first.
 */
function TrayMark() {
  return (
    <svg
      viewBox="72 116 386 208"
      // Brighter than the clock beside it, and larger. At the parent's 55% it
      // was a smudge, and the one mark on this desktop that belongs to Sidq is
      // the one thing on it worth being able to pick out.
      className="h-[46%] w-auto text-white/85"
      fill="none"
      stroke="currentColor"
      strokeWidth="24"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M96 232 C120 168 142 296 168 208 C190 136 210 300 236 236" />
      <path d="M236 236 C258 196 286 256 324 256 L416 256" />
      <circle cx="416" cy="256" r="30" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Dock tiles as gradients rather than icons.
 *
 * Six shapes that read as applications at a glance and are nobody's property.
 * Apple owns the real ones and a screenshot of a real Dock is somebody's actual
 * machine, which is how the previous product shot had to be thrown away.
 */
const DOCK: string[] = [
  'linear-gradient(160deg,#5AC8FA,#0A84FF)',
  'linear-gradient(160deg,#FF9F0A,#FF375F)',
  'linear-gradient(160deg,#30D158,#00C7BE)',
  'linear-gradient(160deg,#BF5AF2,#5E5CE6)',
  'linear-gradient(160deg,#8E8E93,#48484A)',
  'linear-gradient(160deg,#FFD60A,#FF9F0A)',
];
