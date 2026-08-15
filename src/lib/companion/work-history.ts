/*
 * Where you stopped.
 *
 * The hardest moment for a distractible brain is not choosing what to do. It is
 * re-entry: sitting down to something you were halfway through and having no
 * idea what "halfway" meant. Every planner in existence helps with the first
 * problem and none of them touch the second, because none of them can see what
 * you were doing.
 *
 * Sidq can, because Claude Code writes it down. Each session leaves a title and
 * the last thing you asked, which is precisely the point you stopped.
 *
 * The resume line needs no model at all. That matters more than it sounds: it
 * means the most valuable thing this product says is derived entirely on the
 * machine, costs nothing per user, works with the wifi off, and never requires
 * a word of your work to be uploaded anywhere.
 */

export interface WorkSession {
  /**
   * Filename stem of the transcript. What sessionTranscript is called with.
   *
   * Optional because not every session has one: history imported from a ChatGPT
   * or Gemini export has no transcript file on this machine to point at. Those
   * sessions are real and worth listing elsewhere, but they cannot be handed
   * over, so the picker leaves them out rather than offering a row that fails.
   */
  sessionId?: string;
  project: string;
  projectName: string;
  title: string;
  lastPrompt: string;
  branch: string;
  endedAt: number;

  /*
   * Depth signals, used to tell real work from a passing question.
   *
   * Optional because they were added after the extractor shipped, and a session
   * recorded by an older build must still rank rather than disappear. See
   * rank-sessions.ts, which degrades to the anchors when both are missing.
   */

  /** User turns in the session. One turn means nothing was worked through. */
  turns?: number;
  /**
   * Minutes actually spent working, not wall-clock from first message to last.
   *
   * Real sessions get resumed across days: measured raw, one of these spans 79
   * hours while holding about 19 hours of work. Gaps longer than a short pause
   * are excluded, so this is time at the keyboard rather than time elapsed.
   */
  activeMinutes?: number;
  /** Which assistant this came from, for the picker's glyph. */
  source?: 'claude-code' | 'cursor' | 'chatgpt' | 'gemini';
}

export interface ResumePoint {
  session: WorkSession;
  /** Whole hours since it was touched. */
  hoursAgo: number;
  /** The line shown on the card. */
  line: string;
  /** A task title the planner can use directly. */
  suggestedTask: string;
}

/** Older than this and "where you stopped" is archaeology, not a resume hint. */
const MAX_AGE_HOURS = 72;

/**
 * Pick the session worth resuming.
 *
 * Simply the most recent one inside the window. Ranking by length or activity
 * was tempting and wrong: the thing you touched last is the thing you have the
 * most context for, and context decays fastest of all.
 */
export function findResumePoint(
  sessions: WorkSession[],
  now: number = Date.now(),
): ResumePoint | null {
  const candidates = sessions
    .filter((s) => s.endedAt > 0)
    .filter((s) => hoursBetween(s.endedAt, now) <= MAX_AGE_HOURS)
    .filter((s) => Boolean(s.title || s.lastPrompt))
    .sort((a, b) => b.endedAt - a.endedAt);

  const session = candidates[0];
  if (!session) return null;

  const hoursAgo = Math.floor(hoursBetween(session.endedAt, now));

  return {
    session,
    hoursAgo,
    line: buildLine(session, hoursAgo),
    suggestedTask: buildTask(session),
  };
}

/**
 * The sentence on the card.
 *
 * Names the thing and when, and stops. No encouragement, no "ready to dive back
 * in?" — the value is entirely in the recall, and anything added dilutes it.
 */
function buildLine(session: WorkSession, hoursAgo: number): string {
  const when = describeGap(hoursAgo);
  const what = session.title || session.lastPrompt;
  const where = session.projectName ? ` in ${session.projectName}` : '';
  return `${when} you were${where}: ${what}`;
}

/**
 * A task the planner can put in a day.
 *
 * The title is the summary of the session; the last prompt is the open thread.
 * The prompt wins when there is one, because an unanswered question is a much
 * sharper starting point than a topic.
 */
function buildTask(session: WorkSession): string {
  const thread = session.lastPrompt || session.title;
  const where = session.projectName ? `${session.projectName}: ` : '';
  return `${where}${firstSentence(thread)}`;
}

function describeGap(hoursAgo: number): string {
  if (hoursAgo < 1) return 'Just now';
  if (hoursAgo < 5) return `${hoursAgo}h ago`;
  if (hoursAgo < 20) return 'Earlier today';
  if (hoursAgo < 44) return 'Yesterday';
  return 'A couple of days ago';
}

/**
 * First sentence only.
 *
 * Last prompts are frequently several sentences of thinking out loud. The first
 * one carries the intent and the rest is context that means nothing tomorrow.
 */
function firstSentence(text: string): string {
  const trimmed = text.trim();
  const end = trimmed.search(/[.!?](\s|$)/);
  const sentence = end > 0 ? trimmed.slice(0, end) : trimmed;
  return sentence.length > 90 ? `${sentence.slice(0, 89).trimEnd()}…` : sentence;
}

function hoursBetween(then: number, now: number): number {
  return (now - then) / 3_600_000;
}
