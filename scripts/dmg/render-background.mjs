/*
 * Draws the installer window's background: the picture behind the two icons
 * when somebody opens the Sidq disk image.
 *
 * Plain white, one short line, a blue arrow drawn by hand from the app to
 * Applications, and the name signed in the corner in the same pen as the
 * website's headline. Finder shows a still picture here and nothing else, so
 * there is no animation to be had; the arrow carries the motion instead.
 *
 * Rendered by headless Chrome at 1x and 2x and joined into one TIFF, which is
 * how Finder picks the sharp one on a Retina screen.
 *
 *   node scripts/dmg/render-background.mjs
 *
 * Writes scripts/dmg/background.tiff. Positions here must match settings.py.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
 * extra is white, and nothing is drawn near the bottom edge.
 */
const W = 560;
const H = 388;

// The handwritten name, from the geometry the website already generates.
const source = readFileSync(join(root, "src/components/landing/handwriting.ts"), "utf8");
const json = source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1);
const sidq = JSON.parse(json)["Sidq"];
const [vx, vy, vw, vh] = sidq.viewBox;

const font = pathToFileURL(join(root, "public/fonts/geist-sans.woff2")).href;

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
@font-face { font-family: Geist; src: url("${font}") format("woff2"); font-weight: 100 900; }
html, body { margin: 0; width: ${W}px; height: ${H}px; background: #fff; overflow: hidden; }
body { font-family: Geist, -apple-system, sans-serif; color: #12121a; -webkit-font-smoothing: antialiased; position: relative; }
h1 { position: absolute; top: 40px; width: 100%; margin: 0; text-align: center; font-size: 23px; font-weight: 600; letter-spacing: -0.035em; }
p { position: absolute; top: 74px; width: 100%; margin: 0; text-align: center; font-size: 13px; color: rgba(18,18,26,0.5); letter-spacing: -0.005em; }
svg.arrow { position: absolute; left: 0; top: 0; }
svg.name { position: absolute; left: 50%; top: 300px; height: 26px; transform: translateX(-50%); color: #2448e8; }
</style></head><body>
<h1>Your AIs have never met.</h1>
<p>Drag Sidq over to introduce them.</p>
<svg class="arrow" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" stroke="#2448e8" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
  <path d="M222 196 C 252 176, 300 172, 336 190" />
  <path d="M322 181 L 337 191 L 320 197" />
</svg>
<svg class="name" viewBox="${vx} ${vy} ${vw} ${vh}" style="width:${((26 * vw) / vh).toFixed(1)}px">
  <path d="${sidq.full}" fill="currentColor" />
</svg>
</body></html>`;

const work = mkdtempSync(join(tmpdir(), "sidq-dmg-"));
const page = join(work, "background.html");
writeFileSync(page, html);

for (const [scale, name] of [[1, "bg.png"], [2, "bg@2x.png"]]) {
  execFileSync(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--default-background-color=ffffffff",
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
