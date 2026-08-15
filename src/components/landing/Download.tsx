import { useEffect, useState } from 'react';
import { ArrowDownToLine, Command } from 'lucide-react';
import { detectPlatform, refinePlatform, ALL_PLATFORMS, type PlatformInfo } from '@/lib/platform';
import { artifactFor, RELEASE_VERSION } from '@/lib/releases';
import { GlassStage } from './GlassStage';
import { cn } from '@/lib/cn';

/*
 * The download.
 *
 * The one place on this page that stops being an editorial layout and becomes a
 * soft, lit, physical surface. That contrast is deliberate: hard rules and heavy
 * ink everywhere else make this section land as an object rather than as another
 * band of content, and it is the only section with a job.
 *
 * Names the visitor's machine so there is no decision to make. The synchronous
 * guess renders immediately and a client-hints upgrade refines Apple Silicon
 * versus Intel afterwards, so the button is never blank and never waits.
 */

export function Download() {
  const [info, setInfo] = useState<PlatformInfo>(() => detectPlatform());
  const [showAll, setShowAll] = useState(false);
  const artifact = artifactFor(info.platform);

  useEffect(() => {
    let cancelled = false;
    void refinePlatform(info).then((next) => {
      if (!cancelled) setInfo(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // The scroll anchor id lives on the wrapper in Landing, so the heading takes
    // a different one. Two elements sharing an id makes the #download jump target
    // ambiguous and is invalid markup.
    <section className="relative overflow-hidden" aria-labelledby="download-heading">
      <GlassStage />

      <div className="relative mx-auto max-w-[76rem] px-6 py-24 lg:py-32">
        <div className="grid gap-14 lg:grid-cols-[1fr_23rem] lg:items-center lg:gap-20">
          <div>
            <p className="text-[0.625rem] uppercase tracking-[0.24em] text-accent">
              The companion
            </p>
            <h2
              id="download-heading"
              className="mt-5 font-display text-[clamp(2.25rem,4.6vw,3.5rem)] leading-[0.94] tracking-[-0.04em]"
            >
              It sits above
              <br />
              everything else
              <br />
              <span className="ink-quiet">and says almost nothing.</span>
            </h2>

            <p className="mt-7 max-w-[40ch] text-[1.0625rem] leading-relaxed ink-muted">
              A small glass card, always on top, out of the way. It knows which task you
              are on, notices when the window in front of you stopped matching it, and
              tells you when to stop.
            </p>

            {/* Four claims, one line each. The long spec list that used to live here
                was the least-read part of the page and it fought the calm. */}
            <ul className="mt-9 flex flex-wrap gap-x-7 gap-y-2.5 text-[0.875rem] ink-muted">
              {[
                'Window titles, never your screen',
                'On-device voice',
                'Answers instantly, offline',
                'Break timing from your data',
              ].map((claim) => (
                <li key={claim} className="flex items-center gap-2">
                  <span aria-hidden="true" className="size-1 rounded-full bg-accent/50" />
                  {claim}
                </li>
              ))}
            </ul>
          </div>

          {/* The panel. Floats on the field rather than being ruled onto the page. */}
          <div className="glass rounded-[22px] p-7">
            <div className="flex items-center gap-2 text-[0.625rem] uppercase tracking-[0.2em] ink-muted">
              <Command className="size-3.5" />
              Desktop · v{RELEASE_VERSION}
            </div>

            <a
              href={artifact?.url ?? '/signin'}
              // Names the saved file. Without it people get Tauri's build name,
              // which has "aarch64" in it and reads as a mistake.
              download={artifact?.filename}
              className={cn(
                'btn-soft group mt-6 flex min-h-[3.5rem] w-full items-center justify-center gap-3',
                'rounded-[14px] px-6 text-[1rem] font-medium',
              )}
            >
              {info.label}
              <ArrowDownToLine className="size-[1.125rem] transition-transform duration-200 group-hover:translate-y-0.5" />
            </a>

            <p className="mt-3.5 text-center text-[0.8125rem] ink-muted">{info.detail}</p>

            <button
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="mt-6 min-h-11 w-full text-[0.6875rem] uppercase tracking-[0.18em] ink-muted transition-colors duration-150 hover:text-ink"
            >
              {showAll ? 'Hide other platforms' : 'Other platforms'}
            </button>

            {showAll && (
              <ul className="border-t border-ink/10">
                {ALL_PLATFORMS.map((p) => {
                  const other = artifactFor(p.platform);
                  if (!other) return null;
                  return (
                    <li key={p.platform} className="border-b border-ink/10 last:border-b-0">
                      <a
                        href={other.url}
                        download={other.filename}
                        className="flex min-h-11 items-center justify-between gap-4 py-2 text-[0.875rem] transition-colors duration-150 hover:text-accent"
                      >
                        <span>{p.label}</span>
                        <span className="text-[0.75rem] ink-muted">{other.size}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="mt-6 border-t border-ink/10 pt-5 text-[0.75rem] leading-relaxed ink-muted">
              Free, no card. The web app works on its own if you would rather not install
              anything.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
