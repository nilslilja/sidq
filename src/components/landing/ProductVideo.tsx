import { useEffect, useRef, useState } from 'react';
import { DesktopMock } from './DesktopMock';
import { cn } from '@/lib/cn';

/*
 * The product footage.
 *
 * Self-hosted, not an embed. A Loom or YouTube iframe on a hero costs a
 * third-party connection, a cookie banner argument, their branding over your
 * product, and a spinner before anything is visible. A 2MB mp4 you own starts
 * painting immediately and belongs to you.
 *
 * Silent, looping, no controls, no play button. This is not something to watch,
 * it is something to notice: the page should read exactly the same to someone
 * who never looks directly at it.
 *
 * Falls back to the built mock when no source is provided, so the page is never
 * broken while footage does not exist yet.
 */

export interface ProductVideoProps {
  /** Path under /public. Omit both and the drawn mock is used instead. */
  mp4?: string;
  webm?: string;
  /** First frame, shown while the video loads. Prevents a flash of nothing. */
  poster?: string;
  /** Describes what happens, for anyone who cannot see it. */
  caption: string;
  className?: string;
}

export function ProductVideo({ mp4, webm, poster, caption, className }: ProductVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);

  /*
   * Only play while on screen.
   *
   * An autoplaying loop that runs the whole time someone reads the FAQ is a
   * decoded video frame every 16ms for no reason, which on a laptop is a fan
   * spinning up while they read about how the product protects their focus.
   */
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
        if (entry.isIntersecting) void node.play().catch(() => undefined);
        else node.pause();
      },
      { threshold: 0.25 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (!mp4 && !webm) {
    return <DesktopMock className={className} />;
  }

  return (
    <figure className={cn('relative m-0', className)}>
      <video
        ref={ref}
        poster={poster}
        // Muted is what makes autoplay legal in every browser. playsInline stops
        // iOS taking the video fullscreen the moment it starts.
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={caption}
        className={cn(
          'aspect-[16/10] w-full rounded-[18px] object-cover',
          'shadow-[0_40px_100px_-30px_rgba(30,27,75,0.55)]',
          // Nothing to click. A cursor change would promise controls.
          'pointer-events-none select-none',
        )}
      >
        {webm && <source src={webm} type="video/webm" />}
        {mp4 && <source src={mp4} type="video/mp4" />}
      </video>

      {/* Read by screen readers and shown if the file 404s, so the section still
          says something rather than leaving a black rectangle. */}
      <figcaption className="sr-only">{caption}</figcaption>

      {!visible && <span className="sr-only">Paused while off screen.</span>}
    </figure>
  );
}
