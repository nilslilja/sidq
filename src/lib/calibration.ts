import type { Day, Task } from '@/types/domain';
import { ALLOWED_MINUTES } from '@shared/plan';

/*
 * The calibration engine.
 *
 * This is the part of Sidq that is not a prompt. A competitor can copy the prompt
 * in an afternoon; they cannot copy what this accumulates.
 *
 * Every closed day is evidence about how this specific person actually works, as
 * opposed to how they believe they work. The engine turns that history into a small
 * set of measured facts, and those facts go into the next day's generation. Day 30
 * is materially better than day 1 for reasons no amount of prompt engineering can
 * reproduce on a cold start.
 *
 * Everything here is gated on sample size. An opinion formed from four tasks is
 * noise wearing a lab coat, and shipping it would make the product feel arbitrary
 * exactly when the user is deciding whether to trust it.
 */

/** Below this, a per-bucket rate is not worth acting on. */
const MIN_SAMPLES_PER_BUCKET = 4;
/** Below this total, the engine reports "none" and the planner ignores it. */
const MIN_TOTAL_TASKS = 12;
const MIN_CLOSED_DAYS = 3;

export type Confidence = 'none' | 'low' | 'medium' | 'high';

export interface DurationStat {
  minutes: number;
  planned: number;
  completed: number;
  /** 0..1, only meaningful when planned >= MIN_SAMPLES_PER_BUCKET. */
  rate: number;
  trustworthy: boolean;
}

export interface Calibration {
  confidence: Confidence;
  closedDays: number;
  totalTasks: number;

  /** Overall share of planned tasks that got finished. */
  completionRate: number;

  /** Completion rate broken down by the size Sidq gave the task. */
  byDuration: DurationStat[];
  /** The block size this person actually finishes. Null until there is evidence. */
  bestDuration: number | null;
  /** Sizes they reliably abandon. The planner is told to stop using these. */
  avoidDurations: number[];

  /**
   * Minutes of work they actually complete on a day they engage with at all.
   * Learned, not assumed. This replaces the fixed 240 ceiling with a real number.
   */
  realisticCapacity: number | null;
  /** Median planned minutes, so we can see the gap between intent and reality. */
  typicalPlanned: number | null;

  /** Local hours where completions actually cluster. */
  peakHours: number[];

  /** Share of tasks that have been carried at least twice. High means over-planning. */
  chronicCarryRate: number;

  /** Verb-led task openings they finish most and least often. */
  strongOpeners: string[];
  weakOpeners: string[];
}

export const EMPTY_CALIBRATION: Calibration = {
  confidence: 'none',
  closedDays: 0,
  totalTasks: 0,
  completionRate: 0,
  byDuration: [],
  bestDuration: null,
  avoidDurations: [],
  realisticCapacity: null,
  typicalPlanned: null,
  peakHours: [],
  chronicCarryRate: 0,
  strongOpeners: [],
  weakOpeners: [],
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

/** First word of a title, lowercased. Task titles always start with a verb. */
function opener(title: string): string {
  return title.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
}

function confidenceFor(closedDays: number, totalTasks: number): Confidence {
  if (closedDays < MIN_CLOSED_DAYS || totalTasks < MIN_TOTAL_TASKS) return 'none';
  if (closedDays < 7) return 'low';
  if (closedDays < 21) return 'medium';
  return 'high';
}

/**
 * Derive the model. Pure: hand it closed days, get facts back.
 * Only closed days count, because an open day has not had its chance yet and
 * counting it would drag every completion rate toward zero.
 */
export function deriveCalibration(days: Day[]): Calibration {
  const closed = days.filter((d) => d.status === 'closed');
  if (closed.length === 0) return EMPTY_CALIBRATION;

  // Only completed and rolled tasks are evidence. A pending task on a closed day
  // should not exist, and an active one has not resolved either way.
  const allTasks: Task[] = closed.flatMap((d) => d.tasks);
  const graded = allTasks.filter((t) => t.status === 'completed' || t.status === 'rolled');
  if (graded.length === 0) return { ...EMPTY_CALIBRATION, closedDays: closed.length };

  const completed = graded.filter((t) => t.status === 'completed');

  // --- by duration ----------------------------------------------------------
  const byDuration: DurationStat[] = ALLOWED_MINUTES.map((minutes) => {
    const planned = graded.filter((t) => t.estMinutes === minutes).length;
    const done = graded.filter((t) => t.estMinutes === minutes && t.status === 'completed').length;
    return {
      minutes,
      planned,
      completed: done,
      rate: planned > 0 ? done / planned : 0,
      trustworthy: planned >= MIN_SAMPLES_PER_BUCKET,
    };
  });

  const trustworthy = byDuration.filter((d) => d.trustworthy);
  const bestDuration =
    trustworthy.length > 0
      ? trustworthy.reduce((a, b) => (b.rate > a.rate ? b : a)).minutes
      : null;

  // A size is "avoid" only if it is both bad in absolute terms and clearly worse
  // than this person's best. One bad week should not blacklist a whole size.
  const bestRate = trustworthy.find((d) => d.minutes === bestDuration)?.rate ?? 0;
  const avoidDurations = trustworthy
    .filter((d) => d.rate < 0.4 && bestRate - d.rate > 0.25)
    .map((d) => d.minutes);

  // --- capacity -------------------------------------------------------------
  // Minutes actually completed per engaged day. Days with zero completions are
  // excluded: they measure whether the person opened the app, not their capacity.
  const perDayCompleted = closed
    .map((d) =>
      d.tasks
        .filter((t) => t.status === 'completed')
        .reduce((sum, t) => sum + t.estMinutes, 0),
    )
    .filter((m) => m > 0);

  // Planned minutes must INCLUDE rolled tasks. A rolled task was on the board and
  // did not get done, which is precisely the over-planning signal this measures.
  // Excluding them makes planned equal completed and silently hides the gap.
  const perDayPlanned = closed
    .map((d) =>
      d.tasks
        .filter((t) => t.status === 'completed' || t.status === 'rolled')
        .reduce((s, t) => s + t.estMinutes, 0),
    )
    .filter((m) => m > 0);

  // --- rhythm ---------------------------------------------------------------
  const hourCounts = new Map<number, number>();
  for (const t of completed) {
    if (!t.completedAt) continue;
    const h = new Date(t.completedAt).getHours();
    hourCounts.set(h, (hourCounts.get(h) ?? 0) + 1);
  }
  const peakHours = [...hourCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .filter(([, n]) => n >= 2)
    .map(([h]) => h)
    .sort((a, b) => a - b);

  // --- carry rot ------------------------------------------------------------
  const chronic = graded.filter((t) => t.carryCount >= 2).length;

  // --- phrasing -------------------------------------------------------------
  const openerStats = new Map<string, { planned: number; done: number }>();
  for (const t of graded) {
    const key = opener(t.title);
    if (key.length < 3) continue;
    const cur = openerStats.get(key) ?? { planned: 0, done: 0 };
    cur.planned++;
    if (t.status === 'completed') cur.done++;
    openerStats.set(key, cur);
  }
  const rankedOpeners = [...openerStats.entries()]
    .filter(([, s]) => s.planned >= MIN_SAMPLES_PER_BUCKET)
    .map(([word, s]) => ({ word, rate: s.done / s.planned }))
    .sort((a, b) => b.rate - a.rate);

  return {
    confidence: confidenceFor(closed.length, graded.length),
    closedDays: closed.length,
    totalTasks: graded.length,
    completionRate: completed.length / graded.length,
    byDuration,
    bestDuration,
    avoidDurations,
    realisticCapacity: median(perDayCompleted),
    typicalPlanned: median(perDayPlanned),
    peakHours,
    chronicCarryRate: chronic / graded.length,
    strongOpeners: rankedOpeners.filter((o) => o.rate >= 0.7).slice(0, 3).map((o) => o.word),
    weakOpeners: rankedOpeners.filter((o) => o.rate <= 0.35).slice(-3).map((o) => o.word),
  };
}

/**
 * Render the model as instructions for the planner.
 *
 * Deliberately terse and declarative. The model is being told measured facts about
 * a real person, not asked to speculate. Returns an empty string below the
 * confidence threshold so a new user's plan is never shaped by noise.
 */
export function calibrationBrief(c: Calibration): string {
  if (c.confidence === 'none') return '';

  const lines: string[] = [];
  lines.push(`observed over ${c.closedDays} closed days, ${c.totalTasks} tasks (confidence: ${c.confidence}):`);
  lines.push(`- finishes ${Math.round(c.completionRate * 100)}% of what you give them`);

  if (c.realisticCapacity !== null) {
    lines.push(`- actually completes about ${c.realisticCapacity} minutes on a working day`);
    if (c.typicalPlanned !== null && c.typicalPlanned > c.realisticCapacity * 1.25) {
      lines.push(
        `- you have been planning ${c.typicalPlanned} minutes. That is too much for them. Plan closer to ${c.realisticCapacity}.`,
      );
    }
  }

  const solid = c.byDuration.filter((d) => d.trustworthy);
  if (solid.length > 0) {
    const parts = solid.map((d) => `${d.minutes}min ${Math.round(d.rate * 100)}%`);
    lines.push(`- completion by block size: ${parts.join(', ')}`);
  }
  if (c.bestDuration !== null) {
    lines.push(`- ${c.bestDuration} minute blocks work best for them. Favour that size.`);
  }
  if (c.avoidDurations.length > 0) {
    lines.push(`- they abandon ${c.avoidDurations.join(' and ')} minute blocks. Do not use these sizes.`);
  }
  if (c.peakHours.length > 0) {
    const fmt = (h: number) => `${String(h).padStart(2, '0')}:00`;
    lines.push(`- they actually finish work around ${c.peakHours.map(fmt).join(', ')}`);
  }
  if (c.chronicCarryRate > 0.2) {
    lines.push(
      `- ${Math.round(c.chronicCarryRate * 100)}% of their tasks get carried twice or more. You are consistently sizing too big. Cut harder.`,
    );
  }
  if (c.strongOpeners.length > 0) {
    lines.push(`- tasks starting with ${c.strongOpeners.join(', ')} get done`);
  }
  if (c.weakOpeners.length > 0) {
    lines.push(`- tasks starting with ${c.weakOpeners.join(', ')} get abandoned. Phrase differently.`);
  }

  return lines.join('\n');
}

/**
 * The same facts phrased for the user rather than the model. This is the screen
 * that makes the product feel like it is paying attention, so it states what was
 * measured and what Sidq changed as a result. Never a scolding, always a decision
 * the app made on their behalf.
 */
export interface CalibrationInsight {
  headline: string;
  detail: string;
  kind: 'capacity' | 'size' | 'rhythm' | 'carry' | 'phrasing';
}

export function calibrationInsights(c: Calibration): CalibrationInsight[] {
  if (c.confidence === 'none') return [];
  const out: CalibrationInsight[] = [];

  if (c.realisticCapacity !== null && c.typicalPlanned !== null) {
    const over = c.typicalPlanned - c.realisticCapacity;
    if (over > 30) {
      out.push({
        kind: 'capacity',
        headline: `You finish about ${c.realisticCapacity} minutes a day`,
        detail: `Your days were being built at ${c.typicalPlanned} minutes. They are sized to what you actually do now.`,
      });
    } else {
      out.push({
        kind: 'capacity',
        headline: `You finish about ${c.realisticCapacity} minutes a day`,
        detail: 'Your plans are sized to match, which is why they keep getting finished.',
      });
    }
  }

  const solid = c.byDuration.filter((d) => d.trustworthy);
  if (c.bestDuration !== null && solid.length >= 2) {
    const best = solid.find((d) => d.minutes === c.bestDuration)!;
    const worst = solid.reduce((a, b) => (b.rate < a.rate ? b : a));
    if (best.minutes !== worst.minutes) {
      out.push({
        kind: 'size',
        headline: `${best.minutes} minute blocks are your shape`,
        detail: `You finish ${Math.round(best.rate * 100)}% of them, against ${Math.round(worst.rate * 100)}% of ${worst.minutes} minute blocks. Sidq stopped giving you ${worst.minutes}s.`,
      });
    }
  }

  if (c.peakHours.length > 0) {
    const fmt = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
    out.push({
      kind: 'rhythm',
      headline: `You actually work around ${c.peakHours.map(fmt).join(' and ')}`,
      detail: 'The hard thing gets placed there, whatever you told us at signup.',
    });
  }

  if (c.chronicCarryRate > 0.2) {
    out.push({
      kind: 'carry',
      headline: 'Things were being sized too big',
      detail: `${Math.round(c.chronicCarryRate * 100)}% of tasks were rolling over twice or more, so they get cut smaller before you see them.`,
    });
  }

  if (c.weakOpeners.length > 0) {
    out.push({
      kind: 'phrasing',
      headline: `"${c.weakOpeners[0]}" tasks do not get done`,
      detail: 'Same work, different wording. Sidq phrases these another way now.',
    });
  }

  return out;
}
