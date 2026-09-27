import { useEffect, useRef, useState } from "react";

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
 * The frame is a hairline, not a floating card with a glow under it, and not a
 * player: native controls would put a scrubber and a volume slider on the one
 * object on this page that should look finished.
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
          className="relative overflow-hidden rounded-[12px] border border-ink/10 bg-white"
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
            className="absolute bottom-3 right-3 min-h-9 cursor-pointer rounded-[6px] bg-ink px-3 text-[0.75rem] font-medium text-paper transition-colors duration-150 hover:bg-ink/85"
          >
            {sound ? "Sound off" : "Sound on"}
          </button>
        </div>
      </div>
    </section>
  );
}
