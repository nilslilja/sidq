/*
 * Render the public pages to static HTML at build time.
 *
 * The site shipped an empty <div id="root"> and painted everything from
 * JavaScript, which meant the headline did not exist until a 100kB bundle had
 * been fetched, parsed and run. That is the wrong trade for a page whose whole
 * job is to be read by someone who has never heard of Sidq, and it is the wrong
 * trade for a crawler, which sees the empty div and nothing else.
 *
 * This renders the same components the browser would, writes the result into
 * the shell, and lets the client hydrate what is already on screen.
 *
 * Only the marketing routes go through here. The desktop app is the same bundle
 * inside a Tauri WebView and has nothing to gain from it.
 */
import { build } from "vite";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";

// Overridable so a development-mode build can be prerendered into its own
// directory when a hydration mismatch needs React's unminified message.
const OUT = process.env.PRERENDER_OUT ?? "dist";
const SSR_OUT = "dist-ssr";
const ROOT = '<div id="root"></div>';

/*
 * React emits its own <link rel="preload"> tags for the images it renders, and
 * `renderToString` leaves them at the front of the markup for the framework to
 * lift into <head>. Leaving them inside #root breaks hydration outright: the
 * client puts them in the head, finds eight elements in the body that it never
 * rendered there, and throws the whole prerendered tree away.
 *
 * Lifting them is also just correct. They are the Dock icons in the hero, they
 * are above the fold, and telling the browser about them in <head> is a
 * hundred milliseconds it does not spend discovering them halfway down a
 * bundle.
 */
function liftHoistedTags(html) {
  const hoisted = [];
  let rest = html;

  for (;;) {
    const match = /^<link\b[^>]*>/.exec(rest);
    if (!match) break;
    hoisted.push(match[0]);
    rest = rest.slice(match[0].length);
  }

  return { hoisted, rest };
}

/*
 * React.lazy resolves between renders, not during one.
 *
 * renderToString does not await anything: the first pass over a lazy route
 * renders the Suspense fallback and, as a side effect, starts the import. So
 * render, let the microtask queue drain, and render again. Two passes is enough
 * for a one-level-deep tree; the loop is there so a nested lazy route does not
 * silently ship its fallback as the page.
 */
async function renderSettled(render, url) {
  let html = "";
  for (let pass = 0; pass < 6; pass += 1) {
    const next = render(url);
    if (pass > 0 && next === html) return next;
    html = next;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return html;
}

await build({
  logLevel: "warn",
  build: {
    ssr: "src/entry-server.tsx",
    outDir: SSR_OUT,
    emptyOutDir: true,
    // The server bundle is thrown away below. Minifying it costs build time and
    // buys nothing, and readable output makes a prerender crash legible.
    minify: false,
  },
});

const { render, ROUTES, metaFor } = await import(`../${SSR_OUT}/entry-server.js`);

/** Escape for an HTML attribute. Copy is written by people and contains quotes. */
function attr(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/*
 * Give each route its own head.
 *
 * Every page used to ship the shell's, which meant one <title> across the site
 * and — much worse — `<link rel="canonical" href="https://www.sidq.tech/">` on
 * all five. A canonical is an instruction, not a hint: four of the five URLs in
 * sitemap.xml were telling Google they were duplicates of the homepage and
 * should be dropped, while the sitemap asked for them to be indexed.
 *
 * Replaced rather than appended. Two canonicals on one page is the same as
 * none, because a crawler that finds a contradiction ignores both.
 */
function withMeta(html, route) {
  const meta = metaFor(route);
  const swaps = [
    [/<title>[\s\S]*?<\/title>/, `<title>${attr(meta.title)}</title>`],
    [
      /<link rel="canonical"[^>]*>/,
      `<link rel="canonical" href="${attr(meta.canonical)}" />`,
    ],
    [
      /<meta property="og:url"[^>]*>/,
      `<meta property="og:url" content="${attr(meta.canonical)}" />`,
    ],
    [
      /<meta property="og:title"[^>]*>/,
      `<meta property="og:title" content="${attr(meta.ogTitle ?? meta.title)}" />`,
    ],
    [
      /<meta\s+property="og:description"[\s\S]*?\/>/,
      `<meta property="og:description" content="${attr(meta.description)}" />`,
    ],
  ];

  let out = html;
  for (const [pattern, replacement] of swaps) {
    if (!pattern.test(out)) {
      throw new Error(
        `prerender: nothing matched ${pattern} in the shell. The head changed ` +
          `and this route would have silently shipped the homepage's tag.`,
      );
    }
    out = out.replace(pattern, replacement);
  }

  /*
   * The description is added rather than swapped, because the shell never had
   * one. Google writes its own snippet without it, out of whatever text it
   * finds first, which on this site is the nav.
   */
  return out.replace(
    "</head>",
    `  <meta name="description" content="${attr(meta.description)}" />\n  </head>`,
  );
}

/*
 * The shell is cached outside dist/ so this script can be run twice.
 *
 * It rewrites dist/index.html in place, which means the second run finds a
 * fully rendered page with no empty root left to fill and fails. Vite empties
 * dist/ on every build, so a cache that lives elsewhere is always either
 * absent (fresh build, read the pristine file) or correct (re-run, read the
 * copy).
 */
const CACHE = join("node_modules", ".cache", "sidq-prerender-shell.html");

async function pristineShell() {
  const built = await readFile(join(OUT, "index.html"), "utf8");
  if (built.includes(ROOT)) {
    await mkdir(dirname(CACHE), { recursive: true });
    await writeFile(CACHE, built);
    return built;
  }

  const cached = await readFile(CACHE, "utf8").catch(() => null);
  if (cached?.includes(ROOT)) return cached;

  throw new Error(
    `prerender: ${OUT}/index.html is already rendered and no shell is cached. Run the build first.`,
  );
}

const shell = await pristineShell();

for (const route of ROUTES) {
  const rendered = await renderSettled(render, route);
  const { hoisted, rest } = liftHoistedTags(rendered);

  const page = withMeta(shell, route)
    .replace("</head>", `${hoisted.join("\n    ")}\n  </head>`)
    .replace(ROOT, `<div id="root">${rest}</div>`);
  const file =
    route === "/"
      ? join(OUT, "index.html")
      : join(OUT, route.slice(1), "index.html");

  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, page);

  const kb = (Buffer.byteLength(page) / 1024).toFixed(1);
  const lifted = hoisted.length ? `  ${hoisted.length} hoisted` : "";
  console.log(`[prerender] ${route.padEnd(10)} ${kb.padStart(6)} kB${lifted}`);
}

await rm(SSR_OUT, { recursive: true, force: true });
