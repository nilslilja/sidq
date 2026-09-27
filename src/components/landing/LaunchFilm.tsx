import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/*
 * The launch film, on the page it points at.
 *
 * Thirty seconds that make the whole argument: every AI asks the same
 * questions, what if they all just knew. It plays muted and looping the moment
 * it is on screen, because a feed autoplays muted too and this is the same
 * film somebody may have just scrolled past. One button turns the sound on and
 * starts it from the top, since the score is timed to the picture and joining
 * it halfway through loses the beat it was written for.
 *
 * The frame is a sheet on the paper with a soft shadow under it, not a player:
 * native controls would put a scrubber and a volume slider on the one object
 * on this page that should look finished.
 */
export function LaunchFilm() {
  const video = useRef<HTMLVideoElement>(null);
  const [sound, setSound] = useState(false);

  /*
   * Played by hand when it scrolls into view, not by `autoPlay`.
   *
   * React sets `muted` as a property after the element exists, so the markup
   * the prerender ships has no muted attribute and the browser refuses to
   * autoplay it. Setting it here and calling play() once it is on screen is
   * the reliable version, and pausing it off screen stops a 30 second loop
   * decoding behind everything else on the page.
   */
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.muted = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const toggleSound = () => {
    const el = video.current;
    if (!el) return;
    const next = !sound;
    el.muted = !next;
    if (next) {
      el.currentTime = 0;
      void el.play().catch(() => {});
    }
    setSound(next);
  };

  return (
    <section
      id="film"
      aria-label="The Sidq launch film"
      className="relative scroll-mt-8 px-5 pb-20 sm:px-6 sm:pb-28"
    >
      <div className="mx-auto max-w-[68rem]">
        <div
          className={cn(
            "group relative overflow-hidden rounded-[28px] bg-white",
            "ring-1 ring-black/[0.06]",
            "shadow-[0_1px_2px_rgba(20,18,28,0.06),0_30px_80px_-30px_rgba(60,40,120,0.45),0_12px_28px_-18px_rgba(20,18,28,0.35)]",
          )}
        >
          <video
            ref={video}
            src="/video/sidq-film.mp4"
            poster="/video/sidq-film-poster.jpg"
            width={1920}
            height={1080}
            muted
            loop
            playsInline
            preload="metadata"
            className="block aspect-video h-auto w-full"
          />
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={sound}
            className={cn(
              "absolute bottom-4 right-4 inline-flex min-h-10 items-center gap-2 rounded-full px-4 py-2",
              "bg-ink/80 text-[0.8125rem] font-medium text-paper backdrop-blur-md",
              "shadow-[0_8px_24px_-10px_rgba(20,18,28,0.6)] transition-transform duration-150",
              "cursor-pointer hover:scale-[1.03] active:scale-[0.97]",
            )}
          >
            {sound ? "Sound off" : "Play with sound"}
          </button>
        </div>
      </div>
    </section>
  );
}
