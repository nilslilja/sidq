import { useEffect, useState } from 'react';
import { Wordmark } from "@/components/landing/Wordmark";
import { track } from '@vercel/analytics';
import { detectPlatform, refinePlatform, type PlatformInfo } from '@/lib/platform';
import { artifactFor, RELEASE_VERSION } from '@/lib/releases';
import { InstallFilm } from '@/components/onboarding/Films';

/*
 * The page after Download.
 *
 * The download itself is the easy part. The next sixty seconds are where people
 * are lost: the file is in a folder they are not looking at, and nothing on
 * screen tells them what to do with it.
 *
 * So this fires the download and then does exactly one job: three numbered
 * steps, in the order they happen, naming the real filename. No marketing, no
 * second CTA, nothing to decide.
 */

export function Downloading() {
  const [info, setInfo] = useState<PlatformInfo>(() => detectPlatform());
  const [started, setStarted] = useState(false);

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

  const artifact = artifactFor(info.platform);

  /*
   * Start the download from here rather than relying on the click that got us
   * here. A hidden anchor is used instead of window.location so the navigation
   * to this page is not replaced by the file, which is what makes the
   * instructions visible at all.
   */
  useEffect(() => {
    if (!artifact || started) return;

    const anchor = document.createElement('a');
    anchor.href = artifact.url;
    anchor.download = artifact.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setStarted(true);

    /*
     * Count the download here, at the only place every one of them passes.
     *
     * The button that leads here is not the event worth counting. It fires for
     * platforms with no build, it fires twice when someone double-clicks, and
     * it fires for people who never reach a file. This effect runs once per
     * page, after the anchor has actually been clicked, which makes it the one
     * honest definition of "a download started".
     *
     * Which architecture matters more than the raw total. Intel and Apple
     * Silicon are two different binaries with two different failure modes, and
     * the split is the only way to know whether an Intel bug is worth a day.
     */
    track('download', { arch: info.platform, version: RELEASE_VERSION });
  }, [artifact, started, info.platform]);

  return (
    <div className="grid min-h-[100dvh] grid-cols-1 bg-paper text-ink lg:grid-cols-[minmax(0,46%)_1fr]">
      {/* ── Instructions ─────────────────────────────────────────────────── */}
      <div className="flex flex-col justify-center px-8 py-16 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-[26rem]">
          <Wordmark />

          <h1 className="mt-12 font-display text-[clamp(2.25rem,4vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.05em]">
            Open Sidq in three steps
          </h1>

          <ol className="mt-10 border-t border-ink/10">
            <Step n={1}>Open your Downloads folder</Step>
            <Step n={2}>
              Double-click{' '}
              <span className="font-medium text-ink">{artifact?.filename ?? 'the installer'}</span>
            </Step>
            <Step n={3}>Drag Sidq into Applications, then open it</Step>
          </ol>

          {/*
           * Stated because the next thing somebody fears is the macOS warning.
           * It does not appear, and saying so before they get there is what
           * stops them giving up at the dialog they are bracing for.
           */}
          <p className="mt-8 text-[0.9375rem] leading-relaxed text-ink/60">
            Signed and notarised by Apple, so it opens with no security warning.
            Setup takes about a minute.
          </p>

          <p className="mt-6 text-[0.8125rem] text-ink/45">
            Download did not start?{' '}
            {artifact ? (
              <a
                href={artifact.url}
                download={artifact.filename}
                className="text-ink underline underline-offset-4 transition-colors duration-150 hover:text-[#2448E8]"
              >
                Get it again
              </a>
            ) : (
              <span className="text-ink/60">Sidq is macOS only right now.</span>
            )}
          </p>
        </div>
      </div>

      {/* ── The three steps, played ──────────────────────────────────────── */}
      <div className="relative m-3 hidden overflow-hidden rounded-[20px] bg-[#EFEDE8] ring-1 ring-inset ring-ink/[0.06] lg:grid lg:place-items-center lg:p-12">
        <InstallFilm />
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-baseline gap-4 border-b border-ink/10 py-4">
      <span className="w-5 shrink-0 font-mono text-[0.8125rem] tabular-nums text-[#2448E8]">{n}</span>
      <span className="text-[1.0625rem] leading-relaxed text-ink/75">{children}</span>
    </li>
  );
}
