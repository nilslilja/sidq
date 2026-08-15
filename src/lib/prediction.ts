import type { Calibration } from './calibration';
import { ALLOWED_MINUTES } from '@shared/plan';

/*
 * The completion model.
 *
 * Calibration measures what happened. This predicts what will happen: for a
 * candidate plan, how much of it this specific person is actually going to finish.
 *
 * That turns the generator from "ask a model, render the answer" into a real
 * optimisation loop. A plan is generated, scored against the person's own history,
 * and sent back for revision with named risks if the forecast is poor. The model
 * is no longer the whole product, it is one component inside a system that has an
 * opinion about its output.
 *
 * The statistics are deliberately simple and honest. A Beta-Binomial posterior over
 * per-duration completion, shrunk toward population priors, plus a small set of
 * multiplicative adjustments with defensible causal stories. Anything fancier would
 * be fitting noise: the per-user sample is a few hundred tasks at best, and a model
 * nobody can reason about is a model nobody can debug at 7am when a plan looks wrong.
 */

/**
 * Population priors: completion rate by block size before we know anything about
 * a specific person. These are the cold-start beliefs, and every user's estimate is
 * pulled toward them until their own evidence outweighs it.
 */
export const POPULATION_PRIORS: Record<number, number> = {
  15: 0.84,
  25: 0.76,
  45: 0.58,
  50: 0.54,
  90: 0.33,
};

/**
 * Strength of the prior, in pseudo-observations. At 8, a user needs roughly eight
 * attempts at a size before their own rate dominates. Low enough to adapt inside a
 * fortnight, high enough that three unlucky mornings do not rewrite the model.
 */
const PRIOR_STRENGTH = 8;

/** Each successive task in a day is a little less likely to be reached. */
const POSITION_DECAY = 0.06;
const MAX_POSITION_PENALTY = 0.3;

/** A task carried repeatedly is being avoided, not merely postponed. */
const CARRY_PENALTY = 0.72;

const STRONG_OPENER_BOOST = 1.12;
const WEAK_OPENER_PENALTY = 0.74;

/** Probabilities never reach 0 or 1. Certainty about a human is always wrong. */
const FLOOR = 0.02;
const CEILING = 0.97;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export interface ScorableTask {
  title: string;
  estMinutes: number;
  carryCount?: number;
}

export interface TaskForecast {
  title: string;
  estMinutes: number;
  /** 0..1 probability this person finishes this task today. */
  probability: number;
  /** Plain-language reasons the probability moved off the base rate. */
  factors: string[];
}

export type PlanVerdict = 'strong' | 'workable' | 'likely-to-fail';

export interface PlanRisk {
  code: 'overloaded' | 'weak-task' | 'bad-size' | 'chronic-carry' | 'front-loaded';
  detail: string;
  /** Phrased as an instruction, so it can be handed straight to the revise pass. */
  instruction: string;
}

export interface PlanForecast {
  tasks: TaskForecast[];
  /** Expected share of the plan that gets completed. */
  expectedCompletion: number;
  /** Expected minutes actually finished, which is the number that matters. */
  expectedMinutes: number;
  plannedMinutes: number;
  verdict: PlanVerdict;
  risks: PlanRisk[];
  /** False when calibration is too thin to say anything useful. */
  personalised: boolean;
}

/**
 * Posterior completion rate for a block size.
 *
 * Beta-Binomial with the population rate as the prior mean. With no observations
 * this returns the prior exactly; with many it converges on the observed rate.
 */
export function completionRateFor(minutes: number, calibration: Calibration): number {
  const prior = POPULATION_PRIORS[minutes] ?? 0.55;
  const bucket = calibration.byDuration.find((d) => d.minutes === minutes);
  if (!bucket || bucket.planned === 0) return prior;

  const successes = bucket.completed;
  const attempts = bucket.planned;
  return (successes + PRIOR_STRENGTH * prior) / (attempts + PRIOR_STRENGTH);
}

function opener(title: string): string {
  return title.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
}

interface PlanContext {
  calibration: Calibration;
  /** Total planned minutes, used for the overload adjustment. */
  plannedMinutes: number;
}

function predictTask(task: ScorableTask, index: number, ctx: PlanContext): TaskForecast {
  const { calibration, plannedMinutes } = ctx;
  const factors: string[] = [];

  let p = completionRateFor(task.estMinutes, calibration);

  // Position. Reaching the sixth task of a day is materially less likely than the
  // first, independent of what the task is.
  const positionPenalty = Math.min(MAX_POSITION_PENALTY, index * POSITION_DECAY);
  if (positionPenalty > 0) {
    p *= 1 - positionPenalty;
    if (index >= 3) factors.push('late in the day');
  }

  // Overload. When a plan exceeds what this person actually completes, the whole
  // plan degrades rather than politely truncating at the capacity line.
  const capacity = calibration.realisticCapacity;
  if (capacity !== null && capacity > 0 && plannedMinutes > capacity) {
    const overloadRatio = plannedMinutes / capacity;
    const penalty = clamp(1 - 0.38 * (overloadRatio - 1), 0.35, 1);
    p *= penalty;
    if (overloadRatio > 1.2) factors.push('plan exceeds their real capacity');
  }

  // Avoidance. Something carried twice is not waiting for time, it is being dodged.
  if ((task.carryCount ?? 0) >= 2) {
    p *= CARRY_PENALTY;
    factors.push('carried repeatedly, likely avoidance');
  }

  // Phrasing. Same work, different verb, measurably different outcome.
  const verb = opener(task.title);
  if (calibration.strongOpeners.includes(verb)) {
    p *= STRONG_OPENER_BOOST;
    factors.push(`"${verb}" tasks get done`);
  } else if (calibration.weakOpeners.includes(verb)) {
    p *= WEAK_OPENER_PENALTY;
    factors.push(`"${verb}" tasks get abandoned`);
  }

  // A size this person demonstrably abandons.
  if (calibration.avoidDurations.includes(task.estMinutes)) {
    factors.push(`${task.estMinutes} minute blocks do not get finished`);
  }

  return {
    title: task.title,
    estMinutes: task.estMinutes,
    probability: clamp(p, FLOOR, CEILING),
    factors,
  };
}

function verdictFor(expectedCompletion: number): PlanVerdict {
  if (expectedCompletion >= 0.7) return 'strong';
  if (expectedCompletion >= 0.5) return 'workable';
  return 'likely-to-fail';
}

function findRisks(forecasts: TaskForecast[], ctx: PlanContext): PlanRisk[] {
  const { calibration, plannedMinutes } = ctx;
  const risks: PlanRisk[] = [];
  const capacity = calibration.realisticCapacity;

  if (capacity !== null && plannedMinutes > capacity * 1.2) {
    risks.push({
      code: 'overloaded',
      detail: `${plannedMinutes} minutes planned against a measured capacity of ${capacity}.`,
      instruction: `Cut the plan to about ${capacity} minutes total. Drop whole tasks rather than shrinking every task.`,
    });
  }

  for (const f of forecasts) {
    if (calibration.avoidDurations.includes(f.estMinutes)) {
      risks.push({
        code: 'bad-size',
        detail: `"${f.title}" is a ${f.estMinutes} minute block, a size they abandon.`,
        instruction: `Re-cut "${f.title}" into a ${calibration.bestDuration ?? 25} minute piece, or drop it.`,
      });
    } else if (f.probability < 0.35) {
      risks.push({
        code: 'weak-task',
        detail: `"${f.title}" has a ${Math.round(f.probability * 100)}% chance of getting done${f.factors.length ? ` (${f.factors.join(', ')})` : ''}.`,
        instruction: `Make "${f.title}" smaller and more concrete, or replace it.`,
      });
    }
  }

  const chronic = forecasts.filter((f) => f.factors.some((x) => x.includes('avoidance')));
  if (chronic.length >= 2) {
    risks.push({
      code: 'chronic-carry',
      detail: `${chronic.length} tasks are being carried repeatedly.`,
      instruction: 'Keep at most one avoided task, shrunk hard. Drop the rest from today.',
    });
  }

  // The single most important task should not be the least likely to happen.
  if (forecasts.length >= 2) {
    const top = forecasts[0];
    const bestElsewhere = Math.max(...forecasts.slice(1).map((f) => f.probability));
    if (top.probability < bestElsewhere - 0.25) {
      risks.push({
        code: 'front-loaded',
        detail: `The top priority is the least likely task to get done (${Math.round(top.probability * 100)}%).`,
        instruction:
          'Re-cut the top priority into a smaller first move. It must be the task most likely to happen, not the biggest one.',
      });
    }
  }

  return risks;
}

/**
 * Score a candidate plan against this person's measured history.
 *
 * Returns the expected outcome plus named, instruction-shaped risks, which is what
 * makes the revise pass targeted instead of a blind retry.
 */
export function scorePlan(tasks: ScorableTask[], calibration: Calibration): PlanForecast {
  const plannedMinutes = tasks.reduce((s, t) => s + t.estMinutes, 0);
  const ctx: PlanContext = { calibration, plannedMinutes };

  const forecasts = tasks.map((t, i) => predictTask(t, i, ctx));
  const expectedCompletion =
    forecasts.length === 0
      ? 0
      : forecasts.reduce((s, f) => s + f.probability, 0) / forecasts.length;
  const expectedMinutes = Math.round(
    forecasts.reduce((s, f) => s + f.probability * f.estMinutes, 0),
  );

  return {
    tasks: forecasts,
    expectedCompletion,
    expectedMinutes,
    plannedMinutes,
    verdict: verdictFor(expectedCompletion),
    risks: findRisks(forecasts, ctx),
    personalised: calibration.confidence !== 'none',
  };
}

/**
 * Best block size for this person right now, by posterior rate rather than raw
 * observed rate. Used when a task has to be re-cut and we need a size to aim at.
 */
export function bestBlockSize(calibration: Calibration): number {
  let best = 25;
  let bestRate = -1;
  for (const minutes of ALLOWED_MINUTES) {
    const rate = completionRateFor(minutes, calibration);
    // Prefer the larger size on a tie: more work per block for the same odds.
    if (rate > bestRate || (rate === bestRate && minutes > best)) {
      best = minutes;
      bestRate = rate;
    }
  }
  return best;
}

/** Renders the forecast as revision instructions for the model. */
export function revisionBrief(forecast: PlanForecast): string {
  if (forecast.risks.length === 0) return '';
  return [
    `This plan is forecast at ${Math.round(forecast.expectedCompletion * 100)}% completion for this specific person, which is not good enough.`,
    '',
    'Fix these, and change nothing else:',
    ...forecast.risks.map((r) => `- ${r.detail} ${r.instruction}`),
  ].join('\n');
}
