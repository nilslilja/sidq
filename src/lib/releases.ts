import type { Platform } from './platform';

/*
 * Where the actual binaries live.
 *
 * This exists because the first version of the download button pointed at
 * `/download/macos-arm`, a path with no file behind it. The dev server answers
 * unmatched routes with the SPA's index.html, so the browser dutifully saved a
 * 3kB file called `macos-arm.html`. A download button has to point at a real
 * artifact, and the saved file has to be named something a person recognises in
 * their Downloads folder.
 *
 * Artifacts are served from the releases host rather than the app origin so a
 * new build does not require redeploying the site, and so the download does not
 * come out of the same bandwidth as the marketing page.
 */

export const RELEASE_VERSION = '0.1.3';

/*
 * Where the files are served from.
 *
 * In dev this is `public/downloads`, so `npm run desktop:build` followed by a
 * copy into that folder gives a real installer on a real click without
 * publishing anything. That local folder is gitignored: a 6MB binary does not
 * belong in the repository.
 */
/*
 * Same origin by default.
 *
 * This used to fall back to an empty string in production unless
 * VITE_RELEASE_BASE was set, on the reasoning that Sidq should never guess a
 * host it might not own. That was the right instinct applied to the wrong
 * thing: `/downloads` is not a host, it is a path on the site currently being
 * served, and it cannot point somewhere we do not control.
 *
 * What it actually did was set the variable to "" in production and leave it
 * there, so `artifactFor` returned null for every platform and every visitor
 * saw "Mac only for now" — including everybody on a Mac. The site shipped for
 * days with no working download and nothing anywhere reported it.
 *
 * The variable still overrides, for the day these move to a CDN.
 */
const RELEASE_BASE = (import.meta.env.VITE_RELEASE_BASE as string | undefined) || '/downloads';

export interface ReleaseArtifact {
  /** Fully qualified URL to the installer. */
  url: string;
  /** What the file is called once saved. This is what the person actually sees. */
  filename: string;
  /** Rough size, for the line under the button. */
  size: string;
}

/*
 * Tauri's own output names are like `Sidq_0.1.0_aarch64.dmg`. They are kept as
 * the source filename but presented under a cleaner name via the `download`
 * attribute, because "aarch64" means nothing to most people downloading this.
 */
const ARTIFACTS: Partial<Record<Platform, ReleaseArtifact>> = {
  'macos-arm': {
    url: `${RELEASE_BASE}/Sidq_${RELEASE_VERSION}_aarch64.dmg`,
    filename: `Sidq ${RELEASE_VERSION}.dmg`,
    size: '2.9 MB',
  },
  'macos-intel': {
    url: `${RELEASE_BASE}/Sidq_${RELEASE_VERSION}_x64.dmg`,
    filename: `Sidq ${RELEASE_VERSION}.dmg`,
    size: '3.2 MB',
  },
  /*
   * There is no Windows or Linux entry, and that is not an oversight.
   *
   * This map used to carry a `.exe` at "~7 MB" and an `.AppImage` at "~80 MB".
   * Neither file was ever built, so both buttons 404'd, and neither size was
   * ever measured — they were invented to make the rows look finished.
   *
   * The app is Mac-only in the code and not merely in the build: it shells to
   * /usr/bin/curl to confirm a plan, reads ~/Library/Application Support for
   * transcripts, and hangs its window off the macOS menu bar. Shipping a
   * Windows build is weeks of work, and until that work is done the honest
   * thing is an empty entry here, which every caller already renders as "Mac
   * only for now" before anybody clicks.
   */
};

/**
 * Null when there is no build for this machine, which callers must handle.
 *
 * Also null when no release host is configured, so a production deploy that
 * forgot VITE_RELEASE_BASE shows "Open the web app" rather than a download
 * button pointing at a bare path that 404s.
 */
export function artifactFor(platform: Platform): ReleaseArtifact | null {
  if (!RELEASE_BASE) return null;
  return ARTIFACTS[platform] ?? null;
}
