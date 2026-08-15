import type { WorkSession } from './work-history';

/*
 * Which of your past sessions is worth resuming.
 *
 * The thing this replaces picked the most recent session and called it "where
 * you stopped". That is wrong in the most ordinary way possible: the last thing
 * you typed into an assistant is very often the *least* substantial thing you
 * did all day. You spend eight hours on a branch, then at midnight you ask what
 * the average colour of a mango is, and go to bed. "Most recent" hands you the
 * mango and buries the eight hours.
 *
 * Once that happens to someone they stop trusting the feature, and a resume
 * feature nobody trusts is worse than none, because they now have to check it.
 *
 * So recency is a tiebreaker here, not the ranking. Sessions are scored on how
 * much real work is in them, and recency only bends that score. The floor on
 * the recency weight is the whole point: it guarantees a substantial session
 * from days ago can still outrank a throwaway from ten minutes ago.
 */

/** Turn count at which a session counts as fully "worked in". */
const TURNS_FULL = 40;

/** Minutes of *active* session time that count as a full working block. */
const SPAN_FULL_MINUTES = 120;

/**
 * How fast recency decays. Long, deliberately: work you abandoned on Friday is
 * still the work you want back on Monday.
 */
const RECENCY_HALF_LIFE_HOURS = 72;

/**
 * The lowest the recency multiplier can go.
 *
 * This is what makes substance able to beat recency. At 0.45 an old but real
 * session keeps just under half its score forever, so it stays reachable
 * instead of being pushed below every trivial thing typed since.
 */
const RECENCY_FLOOR = 0.45;

/** Sessions scoring below this are noise and are not offered at all. */
const NOISE_THRESHOLD = 0.08;

const WEIGHT_TURNS = 0.35;
const WEIGHT_SPAN = 0.35;
const WEIGHT_ANCHOR = 0.3;

export interface RankedSession {
  session: WorkSession;
  /** Final ranking score. Only meaningful relative to other scores. */
  score: number;
  /** How much real work the session contains, before recency is applied. */
  substance: number;
  /** Why it placed here, in words. Shown in the picker so ranking is legible. */
  reason: string;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > 1 ? 1 : n;
}

/**
 * How much genuine work a session represents, 0..1.
 *
 * Three independent signals, because any one of them alone is gameable by an
 * ordinary usage pattern: a long session can have few turns, a busy session can
 * be short, and plenty of real work happens outside a git repo.
 */
function substanceOf(session: WorkSession): number {
  const { turns, activeMinutes, project, branch } = session;

  const anchor = (project ? 0.5 : 0) + (branch ? 0.5 : 0);

  /*
   * Older builds of the extractor did not record turns or a start time. Rather
   * than scoring those sessions at zero and hiding a user's entire history
   * behind a version mismatch, fall back to what is always present.
   */
  const hasDepthSignals = typeof turns === 'number' || typeof activeMinutes === 'number';
  if (!hasDepthSignals) {
    // A neutral baseline plus whatever the anchors say. Ranks sensibly among
    // itself, which is all that can honestly be claimed without the signals.
    return clamp01(0.5 * 0.6 + anchor * 0.4);
  }

  /*
   * A single-turn session is the mango. One question, one answer, nothing to
   * resume. Scored at zero outright rather than smoothly, because there is no
   * amount of recency that should surface it above real work.
   */
  const turnScore =
    typeof turns !== 'number' || turns <= 1
      ? 0
      : clamp01(Math.log(turns) / Math.log(TURNS_FULL));

  const spanScore = clamp01((activeMinutes ?? 0) / SPAN_FULL_MINUTES);

  return clamp01(turnScore * WEIGHT_TURNS + spanScore * WEIGHT_SPAN + anchor * WEIGHT_ANCHOR);
}

/**
 * Recency as a multiplier in [RECENCY_FLOOR, 1], never as a sort key.
 */
function recencyWeight(endedAt: number, now: number): number {
  const ageHours = Math.max(0, (now - endedAt) / 3_600_000);
  const decay = Math.exp(-ageHours / RECENCY_HALF_LIFE_HOURS);
  return RECENCY_FLOOR + (1 - RECENCY_FLOOR) * decay;
}

/** The strongest reason this session ranks where it does, for the picker. */
function reasonFor(session: WorkSession, now: number): string {
  const { turns, activeMinutes, endedAt, branch, projectName } = session;

  if ((activeMinutes ?? 0) >= 90) {
    const hours = Math.round((activeMinutes ?? 0) / 60);
    return `${hours}h session${branch ? ` on ${branch}` : ''}`;
  }
  if (typeof turns === 'number' && turns >= 10) {
    return `${turns} exchanges${projectName ? ` in ${projectName}` : ''}`;
  }
  if (branch) return `on ${branch}`;
  if (projectName) return `in ${projectName}`;

  const hoursAgo = Math.round((now - endedAt) / 3_600_000);
  return hoursAgo < 1 ? 'just now' : `${hoursAgo}h ago`;
}

/**
 * Rank sessions best-first.
 *
 * Noise is dropped rather than ranked last: a picker that always shows five
 * things trains people to read all five, and four of them being junk is how the
 * list stops being read at all.
 */
export function rankSessions(
  sessions: readonly WorkSession[],
  now: number = Date.now(),
): RankedSession[] {
  return sessions
    .map((session) => {
      const substance = substanceOf(session);
      return {
        session,
        substance,
        score: substance * recencyWeight(session.endedAt, now),
        reason: reasonFor(session, now),
      };
    })
    .filter((ranked) => ranked.score >= NOISE_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}
