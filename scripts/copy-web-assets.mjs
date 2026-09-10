/*
 * Copy the large web-only assets into the build output.
 *
 * They used to live in `public/`, which Vite copies into `dist/`, which Tauri
 * then packages into the app. The installers and the product video are 25MB
 * between them, so every build of Sidq shipped a copy of its own installers
 * inside itself: the DMG went from 6.3MB to 25MB and nothing said why.
 *
 * They belong to the website and not to the app, so they sit outside `public/`
 * and are copied in by the web build only. `npm run build` stays the app build;
 * Vercel runs `build:web`.
 */
import { cp, mkdir, readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = 'release';
const TARGETS = [
  { match: (f) => f.endsWith('.dmg'), into: 'dist/downloads' },
  { match: (f) => f.endsWith('.mp4') || f.endsWith('.webm'), into: 'dist/video' },
];

if (!existsSync(SOURCE)) {
  // A clone without the binaries still builds; the download button falls back
  // to "Mac only for now" rather than the build failing.
  console.warn(`[web-assets] no ${SOURCE}/ directory, skipping`);
  process.exit(0);
}

const copied = [];
for (const file of await readdir(SOURCE)) {
  const target = TARGETS.find((t) => t.match(file));
  if (!target) continue;
  await mkdir(target.into, { recursive: true });
  await cp(join(SOURCE, file), join(target.into, file));
  copied.push(file);
  console.log(`[web-assets] ${file} -> ${target.into}`);
}

/*
 * ── Refuse to ship a download button that 404s ───────────────────────────────
 *
 * This has already happened once: "days with no working download and nothing
 * anywhere reported it", per the comment in src/lib/releases.ts. It is a silent
 * failure by construction — the page renders perfectly, the button looks right,
 * and only somebody actually pressing it finds out.
 *
 * It is set up to happen again. `release/*.dmg` is now in .gitignore, so the
 * installers for 0.9.4 are in the repo only because they were committed before
 * that rule existed. The next release's will not be added by `git add -A`, this
 * script will find nothing to copy, and the site will advertise a file that is
 * not there.
 *
 * So the build fails instead. A failed deploy is a bad afternoon; a live
 * download button that does nothing is lost sales nobody can see.
 *
 * Skipped when RELEASE_BASE points somewhere else — once the installers move to
 * GitHub Releases the site stops serving them and there is nothing here to
 * check.
 */
const base = process.env.VITE_RELEASE_BASE ?? '/downloads';
if (base.startsWith('/')) {
  const version = (await readFile('package.json', 'utf8').then(JSON.parse)).version;
  const wanted = [`Sidq_${version}_aarch64.dmg`, `Sidq_${version}_x64.dmg`];
  const missing = wanted.filter((f) => !copied.includes(f));

  if (missing.length) {
    console.error(
      `[web-assets] the site advertises ${version} and these are not in ${SOURCE}/:`,
    );
    for (const f of missing) console.error(`[web-assets]   ${f}`);
    console.error('[web-assets] the download button would 404. Refusing to build.');
    console.error(
      '[web-assets] either put them in release/, or point VITE_RELEASE_BASE at GitHub Releases.',
    );
    process.exit(1);
  }
}
