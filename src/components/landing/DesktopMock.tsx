import { PillPreview } from "./PillPreview";
import { cn } from "@/lib/cn";

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
const MENUS = ["Finder", "File", "Edit", "View", "Window", "Help"];

export function DesktopMock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative aspect-[16/10] w-full overflow-hidden rounded-[18px]",
        // A dawn gradient rather than a stock macOS photo: it belongs to Sidq
        // and there is nothing to license.
        "bg-[linear-gradient(165deg,#2A2A5C_0%,#4C4A8A_28%,#8E7BB0_52%,#D8A08C_74%,#F0C9A0_100%)]",
        "shadow-[0_40px_100px_-30px_rgba(30,27,75,0.55)]",
        className,
      )}
    >
      {/* ── The menu bar the pill lives inside ────────────────────────────── */}
      {/* Same reasoning as the dock below: a fill rather than a backdrop
          filter, because this is inside the subtree the tilt rotates. */}
      <div className="absolute inset-x-0 top-0 z-20 flex h-[5.5%] items-center gap-[1.6%] bg-black/35 px-[2%]">
        <span
          aria-hidden="true"
          className="h-[42%] w-[1.1%] rounded-[1px] bg-white/70"
          style={{ maskImage: "none" }}
        />
        {MENUS.map((menu, i) => (
          <span
            key={menu}
            className={cn(
              "text-[clamp(0.4rem,0.72vw,0.6875rem)] leading-none",
              i === 0 ? "font-semibold text-white/85" : "text-white/55",
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
                  "h-[0.4rem] rounded-full",
                  i % 3 === 0
                    ? "bg-lilac/40"
                    : i % 3 === 1
                      ? "bg-white/15"
                      : "bg-white/10",
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
      {/*
       * `inset-y-0`, and it is load-bearing.
       *
       * This was `top-0` with no height, so the box collapsed to zero — and
       * every percentage inside it resolved against zero. The collapsed bar is
       * `h-[5.5%]`, which came out as no height at all, so the pill simply was
       * not drawn; and the picker's `top-[5.5%]` came out as zero too, so it
       * sat over the menu bar instead of hanging under it.
       *
       * Reported as "the pill isn't visible, it's cropped out and too far up",
       * which is two symptoms of the one cause. Giving the box the mock's full
       * height gives both percentages something real to measure against.
       */}
      <div className="pointer-events-none absolute inset-y-0 left-1/2 z-30 w-[min(30rem,74%)] -translate-x-1/2">
        {/* Collapsed: inside the menu bar, the width of a word. */}
        <div className="shot-bar absolute inset-x-0 top-0 flex h-[5.5%] origin-top items-center justify-center">
          <div
            className={cn(
              "flex h-full items-center gap-2 px-3",
              // Squared where it meets the menu bar, rounded where it ends.
              // That silhouette is a notch, and it is why this reads as part of
              // the machine rather than a window somebody left open.
              "mx-auto w-[min(9rem,34%)] rounded-b-[7px]",
              // Part of the strip, not a card resting on it: no shadow, no
              // ring, and a translucent black close to the bar's own.
              "bg-black/45",
            )}
          >
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full bg-lilac/70"
            />
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
              { title: "Pricing page copy", meta: "5h session · Sidq" },
              {
                title: "Onboarding email sequence",
                meta: "95 exchanges · Verdict",
              },
              { title: "Refund policy wording", meta: "40m · Sidq" },
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
        {/*
         * Liquid glass, built out of CSS rather than pasted in.
         *
         * The reference implementation for this look leans on an SVG
         * `feTurbulence` + `feDisplacementMap` filter over the backdrop, and
         * pulls its icons off a third-party file host. Neither ships here: a
         * displacement filter on a blurred backdrop is one of the most
         * expensive things you can put on a page and this one is in the hero,
         * and the front page should not depend on somebody else's bucket
         * staying up. The icons sitting in it are Apple's, but they are served
         * from `public/dock` rather than fetched.
         *
         * Three layers do it natively. A blurred, brightened backdrop; a white
         * wash for body; and an inset highlight along the top edge with a
         * darker one along the bottom, which is what actually reads as a
         * curved piece of glass rather than a grey bar.
         */}
        <div
          className={cn(
            "relative flex items-end gap-[0.9%] rounded-[14%/38%] px-[1.2%] py-[0.7%]",
            /*
             * A fill, not a backdrop-filter.
             *
             * This was backdrop-blur-2xl with brightness and saturation on top,
             * and it sits inside a subtree the scroll tilt rotates in 3D — the
             * single most expensive arrangement available in a browser, because
             * a backdrop filter under a 3D transform has to re-read and re-blur
             * what is behind it on every frame of the scroll.
             *
             * What is behind it is a static gradient that this component drew,
             * and a heavy blur of a smooth gradient is that same gradient. So it
             * is painted directly. The ring, the inset lip and the shadow below
             * are what actually read as curved glass, and all three are cheap.
             */
            "bg-[linear-gradient(180deg,rgba(255,255,255,0.34),rgba(255,255,255,0.16))]",
            "ring-1 ring-inset ring-white/30",
            "shadow-[0_10px_34px_-12px_rgba(0,0,0,0.5)]",
            // The edge. Light catching the top lip, shadow gathering under it.
            "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit]",
            "before:shadow-[inset_0_1.5px_0_0_rgba(255,255,255,0.6),inset_0_-1px_0_0_rgba(0,0,0,0.12)]",
          )}
          style={{ width: "min(52%, 30rem)" }}
        >
          {DOCK.map((tile) => (
            <img
              key={tile.src}
              src={tile.src}
              alt={tile.alt}
              width={128}
              height={128}
              // Dimensions are declared so the row cannot reflow as they load,
              // which on a hero image is a CLS score rather than a cosmetic.
              className="aspect-square min-w-0 flex-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.28)]"
            />
          ))}

          {/*
           * Sidq, on the end where a recently opened application sits.
           *
           * Worth knowing rather than assuming: the real app has no Dock tile.
           * It sets its activation policy to accessory, which removes it, and
           * that is what lets the pill float over another application's
           * fullscreen Space. This is the shot saying which product it is, in
           * the place a reader's eye already goes.
           */}
          <span
            aria-hidden="true"
            className={cn(
              "relative grid aspect-square flex-1 place-items-center rounded-[22%]",
              "bg-[linear-gradient(160deg,#FFFFFF,#EDEAF7)]",
              "shadow-[0_2px_6px_-1px_rgba(0,0,0,0.35)]",
            )}
          >
            <svg
              viewBox="72 116 386 208"
              className="w-[70%] text-[#4F46E5]"
              fill="none"
              stroke="currentColor"
              strokeWidth="30"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M96 232 C120 168 142 296 168 208 C190 136 210 300 236 236" />
              <path d="M236 236 C258 196 286 256 324 256 L416 256" />
              <circle
                cx="416"
                cy="256"
                r="34"
                fill="currentColor"
                stroke="none"
              />
            </svg>
          </span>

          {/* The divider and the bin, which every Dock has and nothing else does. */}
          <span
            aria-hidden="true"
            className="mx-[0.6%] h-[70%] w-px self-center bg-white/40"
          />
          <img
            src="/dock/trash.png"
            alt=""
            width={128}
            height={128}
            className="aspect-square min-w-0 flex-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.28)]"
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
/**
 * The Dock's applications: the real icons, off this Mac.
 *
 * They were drawn approximations and they did not pass — "it's supposed to be
 * the actual dock Apple uses, real logos nothing made up" — and looking at the
 * two side by side, that is right. A compass that is nearly Safari reads as a
 * knock-off, which is worse for a product shot than either the real thing or no
 * Dock at all.
 *
 * Extracted from /System/Applications with `sips` and served at 128px. These
 * are Apple's artwork, used to depict a Mac desktop in a mockup of a Mac app,
 * which is what every Mac app site does. 108KB for all seven.
 */
const DOCK: { src: string; alt: string }[] = [
  // Finder first, because it is fixed there on every Mac and the menu bar in
  // this shot says Finder is the frontmost application.
  { src: "/dock/finder.png", alt: "" },
  { src: "/dock/apps.png", alt: "" },
  { src: "/dock/safari.png", alt: "" },
  { src: "/dock/settings.png", alt: "" },
  { src: "/dock/messages.png", alt: "" },
  { src: "/dock/mail.png", alt: "" },
  { src: "/dock/music.png", alt: "" },
];
