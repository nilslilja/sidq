import { useEffect, useState } from 'react';
import { Apple, ArrowDownToLine } from 'lucide-react';
import { detectPlatform, refinePlatform, type PlatformInfo } from '@/lib/platform';
import { artifactFor } from '@/lib/releases';
import { cn } from '@/lib/cn';

/*
 * The download button.
 *
 * It downloads. It does not scroll to a section, open a modal, or route to a
 * page that then has another button on it. Someone who clicks "Get for Mac" has
 * already decided, and every step between that decision and the file landing in
 * their Downloads folder loses a share of them.
 *
 * Onboarding does not live on the web. It is the first window of the installed
 * app, so there is nothing here to send anyone to.
 *
 * The platform guess renders synchronously and a client-hints pass upgrades
 * Apple Silicon versus Intel afterwards, so the label is never blank and never
 * waits on a promise.
 */

export function DownloadButton({
  size = 'sm',
  className,
}: {
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const info = usePlatform();
  const artifact = artifactFor(info.platform);

  /*
   * Route to /downloading rather than straight at the file.
   *
   * Hitting the .dmg directly leaves the person on the marketing page with a
   * file in a folder they are not looking at and no idea what to do next. The
   * landing page starts the same download and then explains the next sixty
   * seconds, which is where installs are actually lost.
   */
  const href = artifact ? '/downloading' : '/signin';

  return (
    <a
      href={href}
      // No download attribute: this is a page now, not the file. The file is
      // fetched from that page, which is what keeps the instructions on screen.
      className={cn(
        'btn-soft group inline-flex items-center justify-center gap-2.5 rounded-full font-medium',
        size === 'lg' ? 'min-h-[3.75rem] px-9 text-[1.0625rem]' : 'min-h-11 px-5 text-[0.875rem]',
        className,
      )}
    >
      {info.platform.startsWith('macos') ? (
        <Apple className={size === 'lg' ? 'size-5' : 'size-4'} />
      ) : (
        <ArrowDownToLine className={size === 'lg' ? 'size-5' : 'size-4'} />
      )}
      {artifact ? info.label : 'Open the web app'}
    </a>
  );
}

/** Shared so the button and the download panel never disagree about the machine. */
export function usePlatform(): PlatformInfo {
  const [info, setInfo] = useState<PlatformInfo>(() => detectPlatform());

  useEffect(() => {
    let cancelled = false;
    void refinePlatform(info).then((next) => {
      if (!cancelled) setInfo(next);
    });
    return () => {
      cancelled = true;
    };
    // Runs once. Re-running on every refinement would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return info;
}
