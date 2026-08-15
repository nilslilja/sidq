import { Link } from 'react-router-dom';
import { DownloadButton } from './DownloadButton';

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
    heading: 'Product',
    links: [
      { label: 'Download for Mac', to: '/downloading' },
      { label: 'Pricing', to: '/#pricing' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { label: 'Sign in', to: '/signin' },
      { label: 'Upgrade', to: '/upgrade' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy', to: '/privacy' },
      { label: 'Terms', to: '/terms' },
    ],
  },
];

export function SiteFooter() {
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
          <h2 className="mx-auto max-w-[18ch] font-display text-[clamp(2rem,5vw,3.75rem)] leading-[0.94] tracking-[-0.045em]">
            Tomorrow is one of the 250.
          </h2>
          <p className="mx-auto mt-6 max-w-[42ch] text-[1rem] leading-relaxed ink-muted">
            If it has not earned its place on your screen within a week, delete it.
          </p>
          <div className="mt-9 flex justify-center">
            <DownloadButton size="lg" />
          </div>
        </div>

        <div className="grid gap-10 border-t border-ink/10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="font-display text-[1.5rem] leading-none tracking-[-0.05em]">Sidq</div>
            <p className="mt-3 max-w-[26ch] text-[0.875rem] leading-relaxed ink-muted">
              Your AI conversations, carried from one assistant to the next.
            </p>
            <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink/[0.04] px-3 py-1.5 text-[0.75rem] ink-muted">
              <span className="size-1.5 rounded-full bg-[#34C77B]" />
              All systems operational
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h3 className="text-[0.875rem] font-medium">{column.heading}</h3>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="inline-flex min-h-9 items-center text-[0.875rem] ink-muted transition-colors duration-150 hover:text-accent"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ink/10 py-8 text-[0.75rem] ink-muted">
          <span>© {new Date().getFullYear()} Sidq. All rights reserved.</span>
          <span>Built for people who live between four assistants.</span>
        </div>
      </div>
    </footer>
  );
}
