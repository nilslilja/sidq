import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { DownloadButton, usePlatform } from "./DownloadButton";

/*
 * Footer.
 *
 * Ends on the offer rather than on a sitemap: the last CTA sits above the link
 * columns, because someone who scrolled this far is deciding, not navigating.
 *
 * Only real destinations are listed. A footer full of links to pages that do not
 * exist yet is the fastest way to look like a template.
 */

/*
 * Nothing here links to /welcome.
 *
 * That route is the desktop app's own first window, served into a Tauri
 * WebView. Reaching it in a browser gives you a setup flow for an app you have
 * not installed, with keyboard steps that cannot fire and permission steps that
 * do nothing. The only way in is downloading the app.
 */
const COLUMNS = [
  {
    heading: "Product",
    links: [
      /*
       * Labelled for the machine you are on. "Download for Mac" is an
       * instruction a phone cannot follow, and it is the only word in this
       * footer that changes — a desktop reads exactly what it always did.
       */
      { label: null, to: "/downloading" },
      { label: "Pricing", to: "/#pricing" },
    ],
  },
  {
    /*
     * The guides column, which is here for two readers.
     *
     * A person who arrived from a search for one of these gets the others, and
     * a crawler gets a link to a page that would otherwise be an orphan —
     * reachable only from the sitemap, which is a request to look rather than
     * a reason to. Sitewide, so every page passes something to it.
     */
    heading: "Guides",
    links: [{ label: "ChatGPT to Claude", to: "/chatgpt-to-claude" }],
  },
  {
    heading: "Account",
    links: [
      { label: "Sign in", to: "/signin" },
      { label: "Upgrade", to: "/upgrade" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", to: "/privacy" },
      { label: "Terms", to: "/terms" },
    ],
  },
];

export function SiteFooter() {
  const onAPhone = usePlatform().platform === "phone";
  return (
    <footer className="relative overflow-hidden border-t border-ink/10">
      {/* The same dawn light as the hero, inverted and faint, so the page closes
          where it opened. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[24rem] bg-[radial-gradient(80%_100%_at_70%_0%,rgba(243,211,176,0.35)_0%,rgba(243,211,176,0)_60%),radial-gradient(70%_90%_at_20%_10%,rgba(99,102,241,0.13)_0%,rgba(99,102,241,0)_65%)]"
      />

      <div className="relative mx-auto max-w-[76rem] px-6">
        <div className="py-20 text-center">
          {/*
           * The page closes on the pitch, which is also how it opened.
           *
           * This heading was empty. It held "Tomorrow is one of the 250." from
           * the day planner, that line was deleted with the rest of the
           * planner copy in 88e9f4d, and nothing replaced it — so the closing
           * call to action had no headline at all and the accessibility tree
           * carried an unnamed h2 to the bottom of every page.
           *
           * The pitch belongs here rather than a third new sentence. A line
           * gets repeated because somebody heard it twice, and the two places
           * anybody is deciding whether to download are the two buttons.
           */}
          {/*
           * Not the pitch again.
           *
           * The comment above this used to argue that a line gets repeated
           * because somebody heard it twice, and that was right when the
           * landing page was eight sections long and this sat a very long way
           * below the hero. The page is one screen now, so the two of them
           * were inches apart and it read as a stammer rather than a refrain.
           */}
          <h2 className="mx-auto max-w-[18ch] font-serif text-[clamp(2rem,5vw,3.75rem)] leading-[1.0]">
            One keystroke. It is already there.
          </h2>
          <p className="mx-auto mt-6 max-w-[42ch] text-[1rem] leading-relaxed ink-muted">
            If it has not earned its place on your screen within a week, delete
            it.
          </p>
          <div className="mt-9 flex justify-center">
            <DownloadButton size="lg" />
          </div>
        </div>

        <div className="grid gap-10 border-t border-ink/10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="font-display text-[1.5rem] leading-none tracking-[-0.05em]">
              Sidq
            </div>
            <p className="mt-3 max-w-[26ch] text-[0.875rem] leading-relaxed ink-muted">
              Your AI conversations, carried from one AI to the next.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h3 className="text-[0.875rem] font-medium">{column.heading}</h3>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li
                    key={
                      link.label ?? (onAPhone ? "Get Sidq" : "Download for Mac")
                    }
                  >
                    <Link
                      to={link.to}
                      className={cn(
                        // 44 points is Apple's minimum, and a footer link at 36
                        // is the sort of thing you only notice by missing it
                        // twice on a phone. Widened on touch alone: on a mouse
                        // the extra height is dead space between rows.
                        "inline-flex min-h-11 items-center text-[0.875rem] sm:min-h-9",
                        "ink-muted transition-colors duration-150 hover:text-accent",
                      )}
                    >
                      {link.label ??
                        (onAPhone ? "Get Sidq" : "Download for Mac")}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ink/10 py-8 text-[0.75rem] ink-muted">
          <span>© {new Date().getFullYear()} Sidq. All rights reserved.</span>
          <span>Built for people who live between four AIs.</span>
        </div>
      </div>
    </footer>
  );
}
