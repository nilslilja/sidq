/*
 * The mark, in one place.
 *
 * These two `d` strings are the app icon's own. `public/icons/icon.svg` is the
 * source and a test reads both files and fails if they stop matching, because a
 * mark that has quietly drifted from the Dock icon is not something anybody
 * notices by looking — you never see them side by side.
 *
 * It lived inline in Home.tsx until the overlay needed it too. Two inlined
 * copies is exactly the drift the guard exists to prevent, so there is one
 * component and the guard reads this file.
 *
 * ── Why it is cropped ────────────────────────────────────────────────────────
 *
 * The viewBox is a wide, short band out of the icon's 512 square rather than
 * the square itself. The drawing lives across the middle; the whole canvas
 * shrunk to 22 points is a smudge with air above and below it.
 *
 * ── Why the colour is `currentColor` ─────────────────────────────────────────
 *
 * ── Why the weight is a constant and not a literal ──────────────────────────
 *
 * It was `strokeWidth="24"` here, 20 in `public/icons/icon.svg`, 30 in the Dock
 * tile the landing page draws and 22 on the splash screen. One mark, four
 * weights, and the test that exists to catch exactly this compared only the two
 * `d` strings — so the shapes matched, the strokes did not, and nothing failed.
 *
 * Two callers with two palettes: the window paints it `--w-mark`, which is
 * indigo on paper and white in the dark, and the overlay paints it against a
 * translucent pane over an unknown desktop. Inheriting means neither has to
 * know anything about the other, and the trailing circle can never end up a
 * different colour from the stroke that leads into it.
 */

/** The Dock icon's own stroke weight. Kept in step by a test. */
const ICON_STROKE = 20;

export function SidqMark({
  width = 30,
  height = 16,
  strokeWidth = ICON_STROKE,
  className,
}: {
  width?: number;
  height?: number;
  /**
   * Defaults to the icon's own weight, so `<SidqMark />` with no props *is* the
   * Dock icon. Override it only for optical reasons, and say why at the call
   * site: at very small sizes a stroke this fine starts to disappear.
   */
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="72 116 386 208"
      width={width}
      height={height}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M96 232 C120 168 142 296 168 208 C190 136 210 300 236 236" />
      <path d="M236 236 C258 196 286 256 324 256 L416 256" />
      <circle cx="416" cy="256" r="30" fill="currentColor" stroke="none" />
    </svg>
  );
}
