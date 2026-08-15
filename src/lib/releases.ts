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

export const RELEASE_VERSION = '0.1.0';

/*
 * Where the files are served from.
 *
 * In dev this is `public/downloads`, so `npm run desktop:build` followed by a
 * copy into that folder gives a real installer on a real click without
 * publishing anything. That local folder is gitignored: a 6MB binary does not
 * belong in the repository.
 */
const RELEASE_BASE =
  (import.meta.env.VITE_RELEASE_BASE as string | undefined) ??
  // Same rule as the desktop sign-in origin: never guess a host. In production
  // this must be set; without it the buttons fall back to the web app rather
  // than linking at a domain or GitHub org nobody has confirmed we control.
  (import.meta.env.DEV ? '/downloads' : '');

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
    size: '11 MB',
  },
  'macos-intel': {
    url: `${RELEASE_BASE}/Sidq_${RELEASE_VERSION}_x64.dmg`,
    filename: `Sidq ${RELEASE_VERSION}.dmg`,
    size: '11 MB',
  },
  windows: {
    url: `${RELEASE_BASE}/Sidq_${RELEASE_VERSION}_x64-setup.exe`,
    filename: `Sidq ${RELEASE_VERSION} Setup.exe`,
    size: '~7 MB',
  },
  linux: {
    url: `${RELEASE_BASE}/Sidq_${RELEASE_VERSION}_amd64.AppImage`,
    filename: `Sidq-${RELEASE_VERSION}.AppImage`,
    size: '~80 MB',
  },
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
