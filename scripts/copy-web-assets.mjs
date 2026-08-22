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
import { cp, mkdir, readdir } from 'node:fs/promises';
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

for (const file of await readdir(SOURCE)) {
  const target = TARGETS.find((t) => t.match(file));
  if (!target) continue;
  await mkdir(target.into, { recursive: true });
  await cp(join(SOURCE, file), join(target.into, file));
  console.log(`[web-assets] ${file} -> ${target.into}`);
}
