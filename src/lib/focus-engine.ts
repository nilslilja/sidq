import type { Calibration } from './calibration';

/*
 * The focus engine. Runs in the desktop companion.
 *
 * Two jobs: decide when to suggest a break, and decide whether what you are doing
 * right now matches what you said you would do.
 *
 * ── On the break science, honestly ────────────────────────────────────────────
 * Kleitman's basic rest-activity cycle (1963) proposed that the ~90 minute cycle
 * governing sleep stages continues while awake, and Lavie's work found matching
 * oscillations in reaction time and sustained attention. EEG does show ultradian
 * swings in frontal beta and theta.
 *
 * But the evidence does NOT support a fixed 90 minute clock. Measured cycle length
 * varies roughly 80 to 120 minutes between people, and Lack found no consistent
 * 90 to 120 minute alertness cycle at all in his data. Ericsson's deliberate
 * practice work is the sturdier finding: elite performers across music, chess and
 * writing converge on 60 to 90 minute bursts.
 *
 * So this does not ship Pomodoro or a 90/20 rule as if either were settled. It
 * starts at a defensible default and then learns the individual's real cycle from
 * their own completion data, which is both better science and the thing this
 * product is already built to do.
 */

/** Where we start before there is any personal evidence. */
export const DEFAULT_CYCLE_MINUTES = 52;
export const MIN_CYCLE_MINUTES = 25;
export const MAX_CYCLE_MINUTES = 110;

/** Break length scales with the burst, roughly the 1:5 ratio the studies imply. */
const BREAK_RATIO = 0.2;
export const MIN_BREAK_MINUTES = 5;
export const MAX_BREAK_MINUTES = 20;

export type BreakUrgency = 'none' | 'suggested' | 'overdue';

export interface BreakAdvice {
  urgency: BreakUrgency;
  /** Minutes of continuous focus at the point this was computed. */
  focusedMinutes: number;
  /** This person's learned burst length. */
  cycleMinutes: number;
  breakMinutes: number;
  /** Shown to the user. Never a command, always an observation plus an option. */
  message: string;
  /** Why the engine thinks this, in one line. Shown on request, never unprompted. */
  reason: string;
}

/**
 * The person's real burst length.
 *
 * Derived from the block size they actually finish, because a block size someone
 * completes 85% of the time IS their sustainable burst, measured rather than
 * assumed. Falls back to 52 minutes, which sits inside the 60-to-90 deliberate
 * practice band once you account for the fact that most people overestimate.
 */
export function cycleMinutesFor(calibration: Calibration): number {
  if (calibration.confidence === 'none' || calibration.bestDuration === null) {
    return DEFAULT_CYCLE_MINUTES;
  }

  // Someone who reliably finishes 45 minute blocks can sustain a little beyond one
  // block before the wheels come off. 1.5x is a deliberately conservative stretch.
  const derived = Math.round(calibration.bestDuration * 1.5);
  return Math.min(MAX_CYCLE_MINUTES, Math.max(MIN_CYCLE_MINUTES, derived));
}

export function breakMinutesFor(cycleMinutes: number): number {
  return Math.min(
    MAX_BREAK_MINUTES,
    Math.max(MIN_BREAK_MINUTES, Math.round(cycleMinutes * BREAK_RATIO)),
  );
}

export function adviseBreak(args: {
  /** Continuous minutes at the keyboard on task, excluding idle. */
  focusedMinutes: number;
  calibration: Calibration;
  /** Minutes since the last break ended. Null if they have not taken one. */
  minutesSinceBreak: number | null;
}): BreakAdvice {
  const { focusedMinutes, calibration } = args;
  const cycleMinutes = cycleMinutesFor(calibration);
  const breakMinutes = breakMinutesFor(cycleMinutes);

  const base = { focusedMinutes, cycleMinutes, breakMinutes };

  // Deep in a stretch. Interrupting good work is the worst thing this can do, so
  // the bar for speaking up is high and rises with how well it is going.
  if (focusedMinutes < cycleMinutes) {
    return {
      ...base,
      urgency: 'none',
      message: '',
      reason: `${focusedMinutes} of about ${cycleMinutes} minutes into your usual stretch.`,
    };
  }

  if (focusedMinutes < cycleMinutes * 1.6) {
    return {
      ...base,
      urgency: 'suggested',
      message: `You have been going ${focusedMinutes} minutes. ${breakMinutes} away from the screen would hold the rest of the day together.`,
      reason:
        calibration.confidence === 'none'
          ? 'Based on a typical sustainable burst, until there is enough of your own history to be specific.'
          : `Your own data says ${cycleMinutes} minutes is about your limit before completion drops.`,
    };
  }

  return {
    ...base,
    urgency: 'overdue',
    message: `${focusedMinutes} minutes without stopping. Whatever you do next will be worse than what you just did.`,
    reason: 'Sustained attention degrades well before people notice it has.',
  };
}

// ---------------------------------------------------------------------------
// Activity relevance
// ---------------------------------------------------------------------------

/*
 * How the companion knows what you are doing.
 *
 * Deliberately NOT screenshots through a vision model. That would cost dollars per
 * user per day, send your screen to a server, and be less reliable than the thing
 * it replaces. The frontmost application name and window title are readable
 * locally, for free, in under a millisecond, and they are what actually identify
 * the activity.
 *
 * Nothing here leaves the machine.
 */

export interface ActivitySample {
  /** e.g. "Figma", "Google Chrome", "Xcode" */
  app: string;
  /** e.g. "pricing page - Figma", "Cheap flights to Lisbon - Google Chrome" */
  windowTitle: string;
  at: number;
}

export type Alignment = 'aligned' | 'neutral' | 'drifting';

export interface AlignmentVerdict {
  alignment: Alignment;
  /** 0..1, how sure. Low confidence never triggers an interruption. */
  confidence: number;
  matchedTerms: string[];
}

/** Apps that are almost never the work, whatever the task is. */
const DISTRACTION_APPS = [
  'youtube',
  'netflix',
  'tiktok',
  'instagram',
  'twitter',
  'x',
  'reddit',
  'discord',
  'twitch',
  'steam',
  'facebook',
  'pinterest',
];

const DISTRACTION_TERMS = [
  'youtube',
  'netflix',
  'tiktok',
  'instagram',
  'reddit',
  'twitch',
  'amazon',
  'ebay',
  'shop',
  'flights',
  'hotel',
];

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'in', 'on', 'at', 'my', 'your',
  'it', 'is', 'be', 'do', 'that', 'this', 'with', 'from', 'up', 'out', 'i',
  'get', 'make', 'go', 'put', 'one', 'first', 'next', 'about',
]);

function terms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Does the current window look like the task?
 *
 * Purely local string work. Returns `neutral` freely: being unsure is the correct
 * and common answer, and an assistant that guesses wrong about what you are doing
 * gets muted within a day.
 */
export function assessAlignment(sample: ActivitySample, taskTitle: string): AlignmentVerdict {
  const haystack = `${sample.app} ${sample.windowTitle}`.toLowerCase();
  const appLower = sample.app.toLowerCase();

  const taskTerms = terms(taskTitle);
  const matched = taskTerms.filter((t) => haystack.includes(t));

  // A real content match beats everything. Someone can legitimately be doing the
  // work inside YouTube or Reddit, and calling that a distraction is exactly the
  // false positive that makes people turn a tool off.
  if (matched.length > 0) {
    return {
      alignment: 'aligned',
      confidence: Math.min(1, 0.55 + matched.length * 0.2),
      matchedTerms: matched,
    };
  }

  const distractingApp = DISTRACTION_APPS.some(
    (d) => appLower === d || appLower.startsWith(d) || appLower.includes(d),
  );
  const distractingContent = DISTRACTION_TERMS.some((d) => haystack.includes(d));

  if (distractingApp || distractingContent) {
    return {
      alignment: 'drifting',
      // Never fully certain. The user always gets the benefit of the doubt.
      confidence: distractingApp && distractingContent ? 0.8 : 0.6,
      matchedTerms: [],
    };
  }

  return { alignment: 'neutral', confidence: 0.2, matchedTerms: [] };
}

export interface NudgePolicy {
  /** Consecutive drifting samples before speaking. Stops one glance triggering it. */
  samplesBeforeNudge: number;
  /** Minimum gap between nudges, minutes. */
  cooldownMinutes: number;
  minConfidence: number;
}

export const DEFAULT_NUDGE_POLICY: NudgePolicy = {
  samplesBeforeNudge: 4,
  cooldownMinutes: 12,
  minConfidence: 0.6,
};

export interface NudgeDecision {
  shouldNudge: boolean;
  message: string;
}

/**
 * Whether to actually say something.
 *
 * Deliberately reluctant. The failure mode for an always-on assistant is not
 * missing a distraction, it is interrupting too often and being disabled. Every
 * threshold here is set to err toward silence.
 */
export function decideNudge(args: {
  consecutiveDrifting: number;
  confidence: number;
  minutesSinceLastNudge: number | null;
  taskTitle: string;
  policy?: NudgePolicy;
}): NudgeDecision {
  const policy = args.policy ?? DEFAULT_NUDGE_POLICY;
  const quiet = { shouldNudge: false, message: '' };

  if (args.confidence < policy.minConfidence) return quiet;
  if (args.consecutiveDrifting < policy.samplesBeforeNudge) return quiet;
  if (args.minutesSinceLastNudge !== null && args.minutesSinceLastNudge < policy.cooldownMinutes) {
    return quiet;
  }

  return {
    shouldNudge: true,
    // Names the task rather than the distraction. Being told what you were doing
    // is useful; being told what you are doing wrong is nagging.
    message: `You were on "${args.taskTitle}".`,
  };
}
