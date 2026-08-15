/*
 * Which machine is this, so the download button names it.
 *
 * A generic "Download" forces the visitor to work out which build they need, and a
 * meaningful share of them get it wrong or give up. Naming the platform on the
 * button removes the decision entirely.
 */

export type Platform = 'macos-arm' | 'macos-intel' | 'windows' | 'linux' | 'unknown';

export interface PlatformInfo {
  platform: Platform;
  /** What the button says. */
  label: string;
  /** Shown under it, for the people who care. */
  detail: string;
  /** True when this is a real desktop we ship a build for. */
  supported: boolean;
}

interface UADataLike {
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string; platform?: string }>;
}

/**
 * Synchronous best guess, good enough to render immediately.
 *
 * Apple Silicon cannot be told from Intel synchronously, because Safari reports
 * the same userAgent for both. `refinePlatform` upgrades the answer afterwards if
 * the browser supports it, so the button never blocks on a promise.
 */
export function detectPlatform(): PlatformInfo {
  if (typeof navigator === 'undefined') return describe('unknown');

  const ua = navigator.userAgent;
  const uaData = (navigator as Navigator & { userAgentData?: UADataLike }).userAgentData;
  const platformHint = (uaData?.platform ?? '').toLowerCase();

  // Touch devices are not a download target. iPadOS lies and claims to be a Mac,
  // so the touch-point check has to come first or every iPad is offered a .dmg.
  const isTouchMac = /Mac/.test(ua) && navigator.maxTouchPoints > 1;
  if (isTouchMac || /iPhone|iPad|iPod|Android/i.test(ua)) return describe('unknown');

  if (platformHint.includes('win') || /Windows|Win64|Win32/i.test(ua)) return describe('windows');
  if (platformHint.includes('mac') || /Macintosh|Mac OS X/i.test(ua)) {
    // Default to Apple Silicon: it has been every new Mac for years, so it is the
    // right guess when the browser will not tell us.
    return describe('macos-arm');
  }
  if (platformHint.includes('linux') || /Linux|X11/i.test(ua)) return describe('linux');

  return describe('unknown');
}

/**
 * Upgrade the guess using client hints where available. Only Chromium exposes
 * architecture, so this quietly does nothing elsewhere.
 */
export async function refinePlatform(current: PlatformInfo): Promise<PlatformInfo> {
  if (current.platform !== 'macos-arm') return current;

  const uaData = (navigator as Navigator & { userAgentData?: UADataLike }).userAgentData;
  if (!uaData?.getHighEntropyValues) return current;

  try {
    const hints = await uaData.getHighEntropyValues(['architecture']);
    if (hints.architecture === 'x86') return describe('macos-intel');
  } catch {
    // Client hints unavailable or refused. The synchronous guess stands.
  }
  return current;
}

function describe(platform: Platform): PlatformInfo {
  switch (platform) {
    case 'macos-arm':
      return {
        platform,
        label: 'Download for Mac',
        detail: 'Apple Silicon · macOS 13 or later',
        supported: true,
      };
    case 'macos-intel':
      return {
        platform,
        label: 'Download for Mac',
        detail: 'Intel · macOS 13 or later',
        supported: true,
      };
    case 'windows':
      return { platform, label: 'Download for Windows', detail: 'Windows 10 and 11', supported: true };
    case 'linux':
      return { platform, label: 'Download for Linux', detail: 'AppImage · x86_64', supported: true };
    default:
      return {
        platform,
        label: 'Open Sidq in the browser',
        detail: 'The desktop companion needs a Mac, Windows or Linux machine',
        supported: false,
      };
  }
}

/** Every build, for the "other platforms" list. */
export const ALL_PLATFORMS: { platform: Platform; label: string; detail: string }[] = [
  { platform: 'macos-arm', label: 'macOS', detail: 'Apple Silicon' },
  { platform: 'macos-intel', label: 'macOS', detail: 'Intel' },
  { platform: 'windows', label: 'Windows', detail: '10 and 11' },
  { platform: 'linux', label: 'Linux', detail: 'AppImage' },
];
