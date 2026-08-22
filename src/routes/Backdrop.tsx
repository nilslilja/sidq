/*
 * A clean background to film the pill against.
 *
 * The first attempt at product footage was recorded straight off a live
 * desktop, which put somebody's wallpaper, dock and open windows on the front
 * page and had to be thrown away. Changing a person's wallpaper to take a
 * screenshot is not a reasonable thing for an app to do, and asking them to do
 * it before every recording is not reasonable either.
 *
 * So Sidq brings its own. This is a plain window at the top of the screen, no
 * chrome and no content, that the real pill sits above. Everything in the frame
 * then belongs to us, the pill is genuinely the shipping component rather than
 * a drawing of it, and no part of anybody's machine is in the shot.
 *
 * Not reachable in normal use. It is opened by the recording script and closed
 * again afterwards.
 */

export function Backdrop() {
  return (
    <div
      className="h-[100dvh] w-full"
      style={{
        // The gradient the landing page already uses for its drawn desktop, so
        // real footage and the fallback illustration sit next to each other
        // without looking like two different products.
        background:
          'linear-gradient(165deg,#2A2A5C 0%,#4C4A8A 28%,#8E7BB0 52%,#D8A08C 74%,#F0C9A0 100%)',
      }}
    />
  );
}
