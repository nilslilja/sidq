import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { detectPlatform, refinePlatform, type PlatformInfo } from '@/lib/platform';
import { artifactFor } from '@/lib/releases';
import { PillPreview } from '@/components/landing/PillPreview';
import { PoweredByClaude } from '@/components/landing/PoweredByClaude';
import { cn } from '@/lib/cn';

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
  }, [artifact, started]);

  return (
    <div className="grid min-h-[100dvh] grid-cols-1 bg-[#0B0B10] text-white lg:grid-cols-[minmax(0,46%)_1fr]">
      {/* ── Instructions ─────────────────────────────────────────────────── */}
      <div className="flex flex-col justify-center px-10 py-16 lg:px-16">
        <div className="mx-auto w-full max-w-[26rem]">
          <Link to="/" className="font-display text-[1.5rem] leading-none tracking-[-0.05em]">
            Sidq
          </Link>

          <h1 className="mt-10 font-display text-[clamp(2rem,3.4vw,2.75rem)] leading-[1.02] tracking-[-0.035em]">
            Open Sidq in
            <br />
            three steps
          </h1>

          <ol className="mt-9 space-y-5">
            <Step n={1}>Open your Downloads folder</Step>
            <Step n={2}>
              Double-click{' '}
              <span className="text-white">{artifact?.filename ?? 'the installer'}</span>
            </Step>
            <Step n={3}>Drag Sidq into Applications, then open it</Step>
          </ol>

          {/*
           * The reassurance that matters on a Mac. People have been trained by
           * years of unsigned apps to expect a warning, and saying there is not
           * one is only worth saying because it is true: the build is signed and
           * notarised by Apple.
           */}
          <p className="mt-9 rounded-[12px] border border-white/[0.08] bg-white/[0.02] p-4 text-[0.8125rem] leading-relaxed text-white/55">
            Signed and notarised by Apple, so it opens with no security warning. Setup takes
            about a minute.
          </p>

          <p className="mt-6 text-[0.8125rem] text-white/35">
            Download did not start?{' '}
            {artifact ? (
              <a
                href={artifact.url}
                download={artifact.filename}
                className="text-white/70 underline underline-offset-4 transition-colors duration-150 hover:text-white"
              >
                Get it again
              </a>
            ) : (
              // Reached only if someone opens this URL directly on a machine
              // Sidq does not ship for. There is no browser version to offer, so
              // it says so rather than routing them somewhere that cannot help.
              <span className="text-white/50">Sidq is macOS only right now.</span>
            )}
          </p>

          <div className="mt-10">
            <PoweredByClaude />
          </div>
        </div>
      </div>

      {/* ── Showcase ─────────────────────────────────────────────────────── */}
      <div className="relative hidden overflow-hidden border-l border-white/[0.06] bg-[#08080C] lg:block">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px)',
            backgroundSize: '38px 38px',
          }}
        />
        <div
          aria-hidden="true"
          className="bloom-breathe pointer-events-none absolute left-1/2 top-1/3 size-[34rem] -translate-x-1/2 rounded-full bg-[#6366F1] opacity-[0.10] blur-[110px]"
        />

        <div className="relative grid h-full place-items-center p-12">
          <div className="w-full max-w-[30rem]">
            <p className="text-center font-display text-[1.75rem] leading-snug tracking-[-0.03em] text-white/90">
              It already knows where you stopped.
            </p>
            <div className="mt-8">
              <PillPreview
                rows={[
                  { title: 'Pricing page copy', meta: '5h session · Sidq' },
                  { title: 'Onboarding email sequence', meta: '95 exchanges · Verdict' },
                ]}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-4">
      <span
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-full',
          'bg-white/[0.07] text-[0.8125rem] tabular-nums text-white/60',
        )}
      >
        {n}
      </span>
      <span className="pt-0.5 text-[1rem] leading-relaxed text-white/70">{children}</span>
    </li>
  );
}
