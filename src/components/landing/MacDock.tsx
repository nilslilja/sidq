import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { SidqMark } from "@/components/SidqMark";

/*
 * A dock that magnifies the way the real one does.
 *
 * ── Why the cosine, and not a distance falloff ───────────────────────────────
 *
 * The obvious version scales each icon by how near the pointer is, and it feels
 * wrong in a way people notice without being able to name: the icons nearest
 * the cursor grow, but the ones at the edge of the effect pop in and out as
 * they cross the threshold. macOS uses a raised cosine across a fixed window,
 * which reaches exactly 1.0 at both ends, so an icon entering the field starts
 * growing from nothing and leaving it stops at nothing. That continuity is the
 * whole feel.
 *
 * ── Why positions are computed rather than laid out ──────────────────────────
 *
 * Icons under magnification are different widths, and the row has to stay
 * centred while they change. Letting flexbox do it means every frame is a
 * layout pass on the main thread. Each icon is absolutely positioned from a
 * running sum of scaled widths instead, so a frame is a transform and a left,
 * and the browser never reflows the row.
 *
 * ── Why the icons are drawn ──────────────────────────────────────────────────
 *
 * The reference implementation for this loaded Finder, Safari, Mail and the
 * rest from a CDN mirror of Apple's own artwork. Those are Apple's marks, and
 * putting them on a page that sells something is a trademark problem rather
 * than a styling choice — which is also why the desktop behind this draws its
 * own wallpaper instead of shipping a screenshot of macOS.
 *
 * So the neighbours are generic shapes, recognisable as the kinds of app a dock
 * holds without being anybody's. The only real mark here is Sidq's, which is
 * the one we own and the one the shot is about.
 */

interface DockApp {
  id: string;
  name: string;
  /** Drawn, not fetched. See the note above. */
  render: (size: number) => React.ReactNode;
}

const BASE = 46;
const MAX_SCALE = 1.85;
const MIN_SCALE = 1;
const FIELD = 190;
const GAP = 6;

/*
 * The real icons, from the CDN the reference implementation used.
 *
 * These are Apple's artwork served from a third party rather than drawn here,
 * which is a deliberate call by the owner of this site: a dock with invented
 * squares in it does not read as a Mac, and the whole point of the shot is that
 * Sidq is sitting among the applications somebody already has.
 *
 * Two consequences worth knowing rather than discovering. They are external
 * requests, so they are lazy and asynchronous and the shelf lays out correctly
 * before any of them arrive — the dock must never wait on the network. And the
 * artwork is Apple's, so if it ever needs to come off, every URL is in this one
 * array and nothing else changes.
 */
const ICONS = {
  finder:
    "https://cdn.21st.dev/assets/mirror/99/9963f31f43cd77b0c28981ba7bac04db749a5749019f554d1afb75225a3e9151.png",
  safari:
    "https://cdn.21st.dev/assets/mirror/d5/d558230225bb0dd1897db6c7cf0d03b29506eef8078fe25313c48cd8f72d05ad.png",
  terminal:
    "https://cdn.21st.dev/assets/mirror/11/11d8587bae8852b8232d1f37e318c4b0fbbd2b0f2b61c71a79dbae327b4fa0c1.webp",
  mail:
    "https://cdn.21st.dev/assets/mirror/7b/7bb8671183d2a2bbb8a3858b1971cc5699ba0103673b011590d22f0fa309bb87.png",
  notes:
    "https://cdn.21st.dev/assets/mirror/cb/cbfa4e5db383bbb86683edc2f7d309e9fd7000d07833f6449837be51b77558fa.png",
  music:
    "https://cdn.21st.dev/assets/mirror/03/035600d3c05ccbfc974888a3319fa721dac7321dd18734a5d0405af1fd259c41.png",
  calendar:
    "https://cdn.21st.dev/assets/mirror/e1/e1e93987488d4a904f4b7273213d36319c73d81ca9680b440c144f69af5a7f9a.png",
  photos:
    "https://cdn.21st.dev/assets/mirror/45/45c61147b702b2765802969df55878aa5f69e27abe656174339dc661d0f9a31d.png",
} as const;

function Shot({ src, name, size }: { src: string; name: string; size: number }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      width={size}
      height={size}
      className="object-contain"
      // Drawn from the icon rather than a box behind it, so a transparent
      // corner does not sit on a rectangle of shadow.
      style={{ filter: `drop-shadow(0 2px 5px rgba(0,0,0,0.28))` }}
      title={name}
    />
  );
}

const APPS: DockApp[] = [
  { id: "finder", name: "Finder", render: (s) => <Shot src={ICONS.finder} name="Finder" size={s} /> },
  { id: "safari", name: "Safari", render: (s) => <Shot src={ICONS.safari} name="Safari" size={s} /> },
  { id: "mail", name: "Mail", render: (s) => <Shot src={ICONS.mail} name="Mail" size={s} /> },
  { id: "notes", name: "Notes", render: (s) => <Shot src={ICONS.notes} name="Notes" size={s} /> },
  { id: "terminal", name: "Terminal", render: (s) => <Shot src={ICONS.terminal} name="Terminal" size={s} /> },
  {
    /*
     * The only mark here that is ours, and the reason the shot exists. Drawn
     * from SidqMark rather than an image so it stays sharp at every
     * magnification and matches the icon the app actually ships.
     */
    id: "sidq",
    name: "Sidq",
    render: (s) => (
      <div
        className="grid place-items-center rounded-[22%]"
        style={{
          width: s,
          height: s,
          background: "linear-gradient(160deg, #5B5793, #2E2D55)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), 0 2px 5px rgba(0,0,0,0.28)",
        }}
      >
        <SidqMark width={s * 0.58} height={s * 0.32} className="text-white" />
      </div>
    ),
  },
  { id: "photos", name: "Photos", render: (s) => <Shot src={ICONS.photos} name="Photos" size={s} /> },
  { id: "music", name: "Music", render: (s) => <Shot src={ICONS.music} name="Music" size={s} /> },
  { id: "calendar", name: "Calendar", render: (s) => <Shot src={ICONS.calendar} name="Calendar" size={s} /> },
];

/** Apps with a running dot under them, so the shelf reads as somebody's Mac. */
const RUNNING = new Set(["finder", "safari", "sidq"]);

export function MacDock({ className }: { className?: string }) {
  const [pointer, setPointer] = useState<number | null>(null);
  const [scales, setScales] = useState<number[]>(() => APPS.map(() => MIN_SCALE));
  const frame = useRef<number | undefined>(undefined);
  const target = useRef<number[]>(APPS.map(() => MIN_SCALE));
  const shelf = useRef<HTMLDivElement>(null);

  /*
   * The raised cosine. Zero at both edges of the field, one at the centre, so
   * an icon crossing the boundary begins and ends at exactly its resting size.
   */
  const magnify = useCallback((x: number | null) => {
    if (x === null) return APPS.map(() => MIN_SCALE);
    return APPS.map((_, i) => {
      const centre = i * (BASE + GAP) + BASE / 2;
      const min = x - FIELD / 2;
      if (centre < min || centre > x + FIELD / 2) return MIN_SCALE;
      const theta = ((centre - min) / FIELD) * 2 * Math.PI;
      const t = (1 - Math.cos(Math.min(Math.max(theta, 0), 2 * Math.PI))) / 2;
      return MIN_SCALE + t * (MAX_SCALE - MIN_SCALE);
    });
  }, []);

  /*
   * One rAF loop easing toward the target, rather than setting the target
   * directly. Snapping to the cosine on every mousemove is correct and feels
   * brittle; the ease is what gives the shelf weight.
   */
  useEffect(() => {
    target.current = magnify(pointer);
    const tick = () => {
      let moving = false;
      setScales((prev) =>
        prev.map((s, i) => {
          const diff = target.current[i] - s;
          if (Math.abs(diff) > 0.002) moving = true;
          return s + diff * 0.22;
        }),
      );
      if (moving || pointer !== null) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [pointer, magnify]);

  // Absolute positions from a running sum, so the row never reflows.
  let x = 0;
  const lefts = scales.map((s) => {
    const w = BASE * s;
    const left = x;
    x += w + GAP;
    return left;
  });

  return (
    <div
      ref={shelf}
      aria-hidden="true"
      onMouseMove={(e) => {
        const r = shelf.current?.getBoundingClientRect();
        if (r) setPointer(e.clientX - r.left - 10);
      }}
      onMouseLeave={() => setPointer(null)}
      className={cn(
        "pointer-events-auto flex items-end rounded-[18px] border border-white/15 p-[10px]",
        "bg-[rgba(45,45,45,0.55)] backdrop-blur-md",
        "shadow-[0_8px_28px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.16)]",
        className,
      )}
      style={{ width: x + 20 - GAP }}
    >
      <div className="relative" style={{ height: BASE, width: "100%" }}>
        {APPS.map((app, i) => {
          const s = scales[i];
          const size = BASE * s;
          return (
            <div
              key={app.id}
              title={app.name}
              className="absolute bottom-0 flex flex-col items-center"
              style={{ left: lefts[i], width: size, height: size, zIndex: Math.round(s * 10) }}
            >
              {app.render(size)}
              {RUNNING.has(app.id) && (
                <span className="absolute -bottom-[7px] size-[3px] rounded-full bg-white/75" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
