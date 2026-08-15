import type { Day, Task } from '@/types/domain';
import type { Calibration } from '@/lib/calibration';
import { scorePlan, bestBlockSize } from '@/lib/prediction';

/*
 * Rescue the day.
 *
 * It is 3pm and nothing is ticked. Every other planner responds by showing you the
 * same eight-hour plan you have already failed, which is the moment people close
 * the app and do not come back.
 *
 * This rebuilds the remainder around the hours that are actually left. It is the
 * single most important interaction in the product, because it is the one that
 * happens on the worst days, and the worst days decide retention.
 *
 * Rules it follows, in order:
 *   1. Never show more work than fits in the time remaining.
 *   2. Keep the thing most likely to get done, not the thing that was most
 *      important this morning. A finished small thing beats an unfinished big one.
 *   3. Say what was dropped, so nothing silently disappears.
 *   4. Never imply the person failed. The plan was wrong, not them.
 */

/** Below this there is no meaningful day left to rescue. */
const MIN_USEFUL_MINUTES = 15;
/** Nobody does focused work right up to the wire. */
const REALISM_FACTOR = 0.6;

export interface RescuePlan {
  /** Tasks to keep, in the order they should be attempted. */
  keep: Task[];
  /** Tasks moved to tomorrow. */
  drop: Task[];
  minutesLeft: number;
  /** Shown at the top of the rescued board. */
  message: string;
  /** False when there is nothing worth rescuing and we should say so instead. */
  worthRescuing: boolean;
}

/**
 * Usable minutes between now and the end of the working day.
 *
 * Discounted, because the last hour of a day is never fully productive and a
 * rescue plan that assumes otherwise fails for the same reason the original did.
 */
export function minutesLeftToday(now: Date, endHour = 18): number {
  const end = new Date(now);
  end.setHours(endHour, 0, 0, 0);
  const raw = Math.floor((end.getTime() - now.getTime()) / 60_000);
  return Math.max(0, Math.round(raw * REALISM_FACTOR));
}

export function rescueDay(args: {
  day: Day;
  calibration: Calibration;
  now?: Date;
  endHour?: number;
}): RescuePlan {
  const { day, calibration } = args;
  const now = args.now ?? new Date();
  const minutesLeft = minutesLeftToday(now, args.endHour);

  const outstanding = day.tasks.filter((t) => t.status === 'pending' || t.status === 'active');

  if (outstanding.length === 0) {
    return {
      keep: [],
      drop: [],
      minutesLeft,
      message: 'Nothing outstanding. The day is already closed out.',
      worthRescuing: false,
    };
  }

  if (minutesLeft < MIN_USEFUL_MINUTES) {
    return {
      keep: [],
      drop: outstanding,
      minutesLeft,
      message: `Not enough left today to start anything honestly. ${outstanding.length} ${outstanding.length === 1 ? 'thing moves' : 'things move'} to tomorrow.`,
      worthRescuing: false,
    };
  }

  /*
   * Order by likelihood of completion, not by this morning's priority.
   *
   * This is the deliberate inversion. At 3pm on a bad day the useful question is
   * "what will actually get done", and the top priority is frequently the largest
   * item, which is precisely why nothing has been done yet.
   */
  const forecast = scorePlan(
    outstanding.map((t) => ({
      title: t.title,
      estMinutes: t.estMinutes,
      carryCount: t.carryCount,
    })),
    calibration,
  );

  const ranked = outstanding
    .map((task, i) => ({ task, probability: forecast.tasks[i]?.probability ?? 0 }))
    .sort((a, b) => b.probability - a.probability);

  const keep: Task[] = [];
  const drop: Task[] = [];
  let budget = minutesLeft;

  for (const { task } of ranked) {
    if (task.estMinutes <= budget) {
      keep.push(task);
      budget -= task.estMinutes;
    } else {
      drop.push(task);
    }
  }

  // Everything left is too big for the time available. Rather than show an empty
  // board, shrink the most likely item into whatever time is actually left.
  if (keep.length === 0 && ranked.length > 0) {
    const shrunk = shrinkToFit(ranked[0].task, minutesLeft, calibration);
    keep.push(shrunk);
    drop.splice(drop.indexOf(ranked[0].task), 1);
  }

  return {
    keep,
    drop,
    minutesLeft,
    message: buildMessage(keep.length, drop.length, minutesLeft),
    worthRescuing: true,
  };
}

/**
 * Cut a task down to the time available.
 *
 * The title is rewritten to a first slice rather than silently reducing the
 * estimate, because a 90 minute task labelled 25 minutes is a lie that produces
 * another unfinished item tonight.
 */
function shrinkToFit(task: Task, minutesLeft: number, calibration: Calibration): Task {
  const target = Math.min(minutesLeft, bestBlockSize(calibration));
  return {
    ...task,
    title: `Start "${task.title}" and stop after ${target} minutes`,
    estMinutes: target,
  };
}

function buildMessage(kept: number, dropped: number, minutesLeft: number): string {
  const hours = minutesLeft >= 60 ? `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m` : `${minutesLeft} min`;

  if (dropped === 0) {
    return `${hours} of usable time left, and everything still fits.`;
  }

  // Never "you didn't finish". The plan was wrong for the day that happened.
  return `Rebuilt around the ${hours} you actually have. ${kept} ${kept === 1 ? 'thing' : 'things'} left today, ${dropped} moved to tomorrow.`;
}
