import type { ActivitySample } from '@/lib/focus-engine';

/*
 * Session replay.
 *
 * At the end of the day: where the hours actually went, built entirely from the
 * window titles the companion is already reading. No timers to start, no projects
 * to tag, no manual logging of any kind. That is the whole point, because every
 * time-tracking product dies on the same rock: it requires the person with the
 * attention problem to remember to press start.
 *
 * Nobody else can produce this. A web app is not on your screen while you are in
 * Figma, so it has no idea. This only exists because the companion is always there.
 */

export interface AppSpan {
  app: string;
  seconds: number;
  /** Share of the tracked day, 0..1. */
  share: number;
}

export interface DayReplay {
  totalSeconds: number;
  /** Longest first. */
  apps: AppSpan[];
  /** Number of distinct app switches. The real cost of a fragmented day. */
  switches: number;
  /** Longest unbroken stretch in one app. */
  longestStretchSeconds: number;
  longestStretchApp: string | null;
  /** One line a person would actually read. */
  headline: string;
}

/** Apps that are the machine idling rather than the person working. */
const IGNORED = ['loginwindow', 'screensaverengine', 'finder', 'sidq'];

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Turn a day of polls into a readable summary.
 *
 * `pollSeconds` is how far apart the samples were taken, which is what converts a
 * count of samples into wall-clock time. Passing the wrong value silently produces
 * plausible-looking but wrong durations, so it is required rather than defaulted.
 */
export function summariseDay(samples: ActivitySample[], pollSeconds: number): DayReplay {
  const usable = samples.filter(
    (s) => s.app.trim().length > 0 && !IGNORED.includes(s.app.toLowerCase()),
  );

  if (usable.length === 0) {
    return {
      totalSeconds: 0,
      apps: [],
      switches: 0,
      longestStretchSeconds: 0,
      longestStretchApp: null,
      headline: 'Nothing tracked today.',
    };
  }

  const byApp = new Map<string, number>();
  let switches = 0;
  let longest = 0;
  let longestApp: string | null = null;
  let runLength = 0;

  usable.forEach((sample, i) => {
    byApp.set(sample.app, (byApp.get(sample.app) ?? 0) + pollSeconds);

    const previous = usable[i - 1];
    if (previous && previous.app !== sample.app) {
      switches++;
      runLength = pollSeconds;
    } else {
      runLength += pollSeconds;
    }

    if (runLength > longest) {
      longest = runLength;
      longestApp = sample.app;
    }
  });

  const totalSeconds = usable.length * pollSeconds;
  const apps: AppSpan[] = [...byApp.entries()]
    .map(([app, seconds]) => ({ app, seconds, share: seconds / totalSeconds }))
    .sort((a, b) => b.seconds - a.seconds);

  return {
    totalSeconds,
    apps,
    switches,
    longestStretchSeconds: longest,
    longestStretchApp: longestApp,
    headline: buildHeadline({ totalSeconds, apps, switches, longest, longestApp }),
  };
}

/**
 * The one sentence worth reading.
 *
 * Ordered by what is actually informative rather than by what is flattering. A
 * fragmented day is the most useful thing to know, so it outranks the total, and
 * it is stated as a count rather than as a judgement.
 */
function buildHeadline(args: {
  totalSeconds: number;
  apps: AppSpan[];
  switches: number;
  longest: number;
  longestApp: string | null;
}): string {
  const { totalSeconds, apps, switches, longest, longestApp } = args;
  const top = apps[0];

  // Roughly one switch a minute or worse. Worth naming before anything else.
  const switchesPerHour = totalSeconds > 0 ? switches / (totalSeconds / 3600) : 0;
  if (switchesPerHour > 55 && totalSeconds > 1800) {
    return `${switches} app switches in ${formatDuration(totalSeconds)}. Your longest unbroken stretch was ${formatDuration(longest)}.`;
  }

  if (longestApp && longest >= 45 * 60) {
    return `${formatDuration(longest)} unbroken in ${longestApp}. That is the day's real work.`;
  }

  if (top && top.share > 0.5) {
    return `${Math.round(top.share * 100)}% of tracked time in ${top.app}.`;
  }

  return `${formatDuration(totalSeconds)} tracked across ${apps.length} apps.`;
}

export { formatDuration };
