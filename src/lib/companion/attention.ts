import type { ActivitySample } from '@/lib/focus-engine';

/*
 * The instrument.
 *
 * Sidq logs (app, window title, timestamp) every few seconds. Over a week that
 * is roughly a hundred thousand data points about one person's attention, and
 * until now the product used them for a drift nudge and a bar chart.
 *
 * This computes the things nobody has ever been told about themselves:
 *
 *   - Your own context-switch recovery cost. The famous "23 minutes" is Gloria
 *     Mark's population average. Yours is a different number and it is knowable.
 *   - Start latency: how long between sitting down and actually starting. This
 *     is the metric for a distractible brain and nothing measures it.
 *   - Your gateway app: not where you spend the most time, but the one that
 *     reliably precedes a long drift.
 *   - Golden hours, measured rather than self-reported, because almost everyone
 *     says "mornings" and most of them are wrong.
 *
 * None of this is possible in a browser tab, and all of it gets sharper the
 * longer someone uses the product, which is the opposite of the retention curve
 * every AI wrapper is on.
 */

/** A stretch in one app with no switch. */
export interface Stretch {
  app: string;
  startedAt: number;
  seconds: number;
}

export interface AttentionProfile {
  /** Minutes to get back to sustained work after a switch. Null until measurable. */
  switchCostMinutes: number | null;
  /** Minutes between the first sample of the day and the first real block. */
  startLatencyMinutes: number | null;
  /** The app that most often precedes a long drift. */
  gatewayApp: string | null;
  /** Hours of the day, 0-23, with the most sustained work. Longest first. */
  goldenHours: number[];
  /** How many days of evidence this is built on. */
  daysOfEvidence: number;
  /** False until there is enough data to say anything without lying. */
  trustworthy: boolean;
}

export const EMPTY_ATTENTION: AttentionProfile = {
  switchCostMinutes: null,
  startLatencyMinutes: null,
  gatewayApp: null,
  goldenHours: [],
  daysOfEvidence: 0,
  trustworthy: false,
};

/** Below this a stretch is passing through, not working. */
const SUSTAINED_SECONDS = 5 * 60;
/** A drift long enough to have cost something. */
const REAL_DRIFT_SECONDS = 10 * 60;
/** Fewer recovery observations than this and the average is noise. */
const MIN_RECOVERIES = 3;
/** A gap longer than this is a different session, not a switch. */
const SESSION_GAP_SECONDS = 30 * 60;

/** Collapse samples into unbroken stretches per app. */
export function toStretches(samples: ActivitySample[], pollSeconds: number): Stretch[] {
  const stretches: Stretch[] = [];

  for (const sample of samples) {
    const last = stretches[stretches.length - 1];
    const contiguous =
      last &&
      last.app === sample.app &&
      sample.at - (last.startedAt + last.seconds * 1000) <= SESSION_GAP_SECONDS * 1000;

    if (contiguous) last.seconds += pollSeconds;
    else stretches.push({ app: sample.app, startedAt: sample.at, seconds: pollSeconds });
  }

  return stretches;
}

/**
 * Build the profile.
 *
 * Every field is independently gated. A week that produced enough switches to
 * measure recovery but never a clean morning start returns a switch cost and a
 * null latency, rather than inventing one to fill the object.
 */
export function deriveAttention(
  samples: ActivitySample[],
  pollSeconds: number,
): AttentionProfile {
  if (samples.length === 0) return EMPTY_ATTENTION;

  const ordered = [...samples].sort((a, b) => a.at - b.at);
  const stretches = toStretches(ordered, pollSeconds);
  const days = new Set(ordered.map((s) => new Date(s.at).toDateString()));

  const switchCost = measureSwitchCost(stretches);

  return {
    switchCostMinutes: switchCost,
    startLatencyMinutes: measureStartLatency(stretches),
    gatewayApp: findGatewayApp(stretches),
    goldenHours: findGoldenHours(stretches),
    daysOfEvidence: days.size,
    // The switch cost is the headline claim, so the profile is only trustworthy
    // once that specific number is real.
    trustworthy: switchCost !== null && days.size >= 2,
  };
}

/*
 * Recovery cost.
 *
 * Find every time a sustained block was interrupted, and measure how long until
 * the person was back in a sustained block. That elapsed time is what the
 * interruption actually cost, as opposed to the thirty seconds it felt like.
 */
function measureSwitchCost(stretches: Stretch[]): number | null {
  const recoveries: number[] = [];

  for (let i = 0; i < stretches.length; i++) {
    const working = stretches[i];
    if (working.seconds < SUSTAINED_SECONDS) continue;

    const interruptedAt = working.startedAt + working.seconds * 1000;

    /*
     * Recovery means getting back to the work you were pulled away from, so it
     * has to be a sustained block IN THE SAME APP.
     *
     * The first version looked for the next sustained block of anything, which
     * was wrong in the exact way that mattered: eight minutes of Slack clears
     * the sustained threshold, so a distraction counted as having recovered and
     * every switch was scored at about one minute.
     */
    for (let j = i + 1; j < stretches.length; j++) {
      const next = stretches[j];
      const gap = (next.startedAt - interruptedAt) / 60_000;

      // A long absence is lunch or the end of the day, not a recovery.
      if (gap > SESSION_GAP_SECONDS / 60) break;

      if (next.app === working.app && next.seconds >= SUSTAINED_SECONDS) {
        recoveries.push(gap);
        break;
      }
    }
  }

  if (recoveries.length < MIN_RECOVERIES) return null;

  // Median, not mean. One forty-minute lunch break misread as a recovery would
  // drag an average badly; the median shrugs it off.
  const sorted = [...recoveries].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return Math.max(1, Math.round(median));
}

/*
 * Start latency.
 *
 * From the first activity of a day to the first sustained block. The difference
 * between "I worked eight hours" and "I actually started at 11:40", which is the
 * single most useful and least flattering number in here.
 */
function measureStartLatency(stretches: Stretch[]): number | null {
  const byDay = new Map<string, Stretch[]>();
  for (const s of stretches) {
    const key = new Date(s.startedAt).toDateString();
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }

  const latencies: number[] = [];
  for (const day of byDay.values()) {
    const first = day[0];
    const firstReal = day.find((s) => s.seconds >= SUSTAINED_SECONDS);
    if (!first || !firstReal) continue;
    latencies.push((firstReal.startedAt - first.startedAt) / 60_000);
  }

  if (latencies.length === 0) return null;
  return Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
}

/*
 * The gateway.
 *
 * Not the app with the most hours. The one that keeps showing up immediately
 * before a long drift, which is a different app and a far more useful thing to
 * know. Most people can name where their time goes and cannot name what opens
 * the door.
 */
function findGatewayApp(stretches: Stretch[]): string | null {
  const counts = new Map<string, number>();

  for (let i = 1; i < stretches.length; i++) {
    if (stretches[i].seconds < REAL_DRIFT_SECONDS) continue;
    const before = stretches[i - 1].app;
    if (!before) continue;
    counts.set(before, (counts.get(before) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [app, count] of counts) {
    if (count > bestCount) {
      best = app;
      bestCount = count;
    }
  }

  // One occurrence is a coincidence, not a pattern.
  return bestCount >= 2 ? best : null;
}

/** Hours of the day ranked by sustained work, longest first, top three. */
function findGoldenHours(stretches: Stretch[]): number[] {
  const byHour = new Map<number, number>();

  for (const s of stretches) {
    if (s.seconds < SUSTAINED_SECONDS) continue;
    const hour = new Date(s.startedAt).getHours();
    byHour.set(hour, (byHour.get(hour) ?? 0) + s.seconds);
  }

  return [...byHour.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour]) => hour);
}

/**
 * The line the companion says out loud.
 *
 * One sentence, a real number, no advice. "You take 19 minutes to recover" lands
 * because it is about them and it is true; "try to avoid distractions" is
 * something they have been told a thousand times and never once acted on.
 */
export function attentionLine(profile: AttentionProfile, context: 'drift' | 'morning'): string | null {
  if (!profile.trustworthy) return null;

  if (context === 'drift' && profile.switchCostMinutes) {
    return `That switch costs you about ${profile.switchCostMinutes} minutes, not the thirty seconds it feels like.`;
  }

  if (context === 'morning') {
    if (profile.startLatencyMinutes && profile.startLatencyMinutes > 20) {
      return `You usually take ${profile.startLatencyMinutes} minutes to properly start. The first task is small on purpose.`;
    }
    if (profile.goldenHours.length > 0) {
      const hour = profile.goldenHours[0];
      return `Your best work happens around ${formatHour(hour)}. Today's hardest thing is there.`;
    }
  }

  return null;
}

function formatHour(hour: number): string {
  if (hour === 0) return 'midnight';
  if (hour === 12) return 'midday';
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}
