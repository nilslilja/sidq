/*
 * Draws the installer window's background: the picture behind the two icons
 * when somebody opens the Sidq disk image.
 *
 * Warm paper, one joke, and a party's worth of introductions: the name is on a
 * tag under each icon ("hello, I'm Sidq", "hello, we're Applications") and a
 * blue arrow drawn by hand says which way to drag. Finder shows a still
 * picture here and nothing else, so there is no animation to be had; the arrow
 * carries the motion instead.
 *
 * ── The names on the tags ────────────────────────────────────────────────────
 *
 * Finder writes each icon's name itself, over this picture. Over a light
 * picture it writes them dark, in dark mode too (checked on macOS 26), so the
 * tags are white stickers placed exactly where it writes.
 *
 * Rendered by headless Chrome at 1x and 2x and joined into one TIFF, which is
 * how Finder picks the sharp one on a Retina screen.
 *
 *   node scripts/dmg/render-background.mjs
 *
 * Writes scripts/dmg/background.tiff. Positions here must match settings.py.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/*
 * The window, in points. settings.py sizes the Finder window to the same.
 *
 * 28 points taller than the layout needs, because whether Finder counts the
 * title bar inside a window's height depends on who you ask. Either way the
 * extra is paper, and nothing is drawn near the bottom edge.
 */
const W = 560;
const H = 388;

// Icon centres and size, as in settings.py.
const APP = { x: 150, y: 205 };
const APPLICATIONS = { x: 410, y: 205 };
const ICON = 88;

/*
 * Where Finder writes a name: the top of its line, below the icon's centre.
 * Measured off a mounted image at icon_size 88 and text_size 13.
 */
const LABEL_TOP = ICON / 2 + 9;
const LABEL_HEIGHT = 16;

const BLUE = "#2448E8";
const INK = "#12121A";
const PAPER = "#F7F6F3";

const geist = pathToFileURL(join(root, "public/fonts/geist-sans.woff2")).href;
const caveat = pathToFileURL(join(root, "scripts/fonts/Caveat.ttf")).href;

/** A tag under an icon, wide enough for its name, and the greeting before it. */
function tag({ x, y }, width, hello) {
  // A 3pt band across the top, then white around the name.
  const top = y + LABEL_TOP - 4;
  const height = LABEL_HEIGHT + 7;
  return `
<div class="tag" style="left:${x - width / 2}px; top:${top}px; width:${width}px; height:${height}px"></div>
<div class="hello" style="right:${W - (x - width / 2) + 7}px; top:${top - 5}px">${hello}</div>`;
}

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
@font-face { font-family: Geist; src: url("${geist}") format("woff2"); font-weight: 100 900; }
@font-face { font-family: Caveat; src: url("${caveat}") format("truetype"); }
html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
body {
  position: relative;
  font-family: Geist, -apple-system, sans-serif;
  color: ${INK};
  -webkit-font-smoothing: antialiased;
  background:
    radial-gradient(circle at 1px 1px, rgba(18, 18, 26, 0.07) 1px, transparent 1.4px) 0 0 / 18px 18px,
    ${PAPER};
}
h1 { position: absolute; top: 34px; width: 100%; margin: 0; text-align: center; font-size: 23px; font-weight: 600; letter-spacing: -0.035em; }
p { position: absolute; width: 100%; margin: 0; text-align: center; }
.sub { top: 67px; font-size: 13px; color: rgba(18, 18, 26, 0.55); letter-spacing: -0.005em; }
.fine { top: 324px; font-size: 11px; color: rgba(18, 18, 26, 0.38); }
.hand { position: absolute; font-family: Caveat, cursive; color: ${BLUE}; white-space: nowrap; }
.note { left: 0; right: 0; top: 128px; text-align: center; font-size: 21px; transform: rotate(-3deg); }
.hello { position: absolute; font-family: Caveat, cursive; color: ${BLUE}; font-size: 17px; white-space: nowrap; transform: rotate(-5deg); transform-origin: right center; }
.tag { position: absolute; border-radius: 6px; background: #fff; box-shadow: inset 0 3px 0 ${BLUE}, 0 0 0 1px rgba(18, 18, 26, 0.1), 0 2px 6px -2px rgba(18, 18, 26, 0.18); }
svg.arrow { position: absolute; left: 0; top: 0; }
</style></head><body>
<h1>Your AIs have been ghosting each other.</h1>
<p class="sub">Drag Sidq into Applications. It&rsquo;ll do the introductions.</p>
<div class="hand note">go on, say hi</div>
<svg class="arrow" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" stroke="${BLUE}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
  <path d="M216 190 C 250 166, 306 162, 342 184" />
  <path d="M327 176 L 343 185 L 326 192" />
</svg>
${tag(APP, 58, "hello, I&rsquo;m")}
${tag(APPLICATIONS, 100, "hello, we&rsquo;re")}
<p class="fine">Takes about three seconds. Friendships take a little longer.</p>
</body></html>`;

const work = mkdtempSync(join(tmpdir(), "sidq-dmg-"));
const page = join(work, "background.html");
writeFileSync(page, html);

for (const [scale, name] of [[1, "bg.png"], [2, "bg@2x.png"]]) {
  execFileSync(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--default-background-color=f7f6f3ff",
    `--window-size=${W},${H}`,
    `--force-device-scale-factor=${scale}`,
    `--screenshot=${join(work, name)}`,
    pathToFileURL(page).href,
  ], { stdio: "ignore" });
}

execFileSync("tiffutil", [
  "-cathidpicheck",
  join(work, "bg.png"),
  join(work, "bg@2x.png"),
  "-out",
  join(here, "background.tiff"),
], { stdio: "ignore" });

console.log(`background.tiff written (${W}x${H} and @2x), preview pngs in ${work}`);
