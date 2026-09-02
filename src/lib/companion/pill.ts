import type { RankedSession } from './rank-sessions';
import { sourceLabel } from './sources';

/*
 * The picker's logic, without the picker.
 *
 * Filtering and selection are the two things that make a keyboard list feel
 * either instant or broken, and both are pure functions of (list, query, index).
 * Keeping them out of the component means they can be checked directly, which
 * matters here because the failures are all small and silent: an off-by-one on
 * the arrow keys, a selection that survives a filter and points at the wrong
 * conversation, a query that matches nothing because of a capital letter.
 */

/**
 * How many rows the list shows at once.
 *
 * This was 5, and it was wrong in a way that read as a much worse bug than it
 * was: the picker loaded 50 conversations, showed five, and then labelled that
 * "5 conversations" — so somebody with twenty-nine of them was told they had
 * five. The cap was for glanceability and it silently became a claim about how
 * much history existed.
 *
 * Twelve fits the expanded card without scrolling, and the count now reports the
 * total rather than the slice.
 */
export const MAX_VISIBLE = 12;

/**
 * Sessions matching what has been typed.
 *
 * Substring, not fuzzy. Fuzzy matching is the obvious reach here and it is wrong
 * for this list: the person is typing a word they already remember, and fuzzy
 * ranking would reorder results under their fingers between one keystroke and
 * the next.
 *
 * Matches the project as well as the title, because "sidq" is what someone types
 * when they mean "the thing I was doing in that folder".
 */
export function filterSessions(
  sessions: readonly RankedSession[],
  query: string,
  source: string = ANY_SOURCE,
): RankedSession[] {
  const withinSource =
    source === ANY_SOURCE ? sessions : sessions.filter((r) => sourceOf(r) === source);

  const q = query.trim().toLowerCase();
  const matches = q
    ? withinSource.filter((r) => {
        const { title, projectName, lastPrompt } = r.session;
        return (
          title.toLowerCase().includes(q) ||
          projectName.toLowerCase().includes(q) ||
          lastPrompt.toLowerCase().includes(q)
        );
      })
    : [...withinSource];

  return matches.slice(0, MAX_VISIBLE);
}

/**
 * The id of the "no filter" option.
 *
 * A named constant rather than an empty string, because empty is also what an
 * unset field looks like and the two must not be confused when one means "show
 * everything" and the other means "this row has no source".
 */
export const ANY_SOURCE = 'all';

/**
 * Which AI a session came from.
 *
 * Defaults to Claude Code, matching Rust: the field was added after the first
 * reader shipped, and every row written before it is one of its transcripts.
 */
export function sourceOf(ranked: RankedSession): string {
  return ranked.session.source ?? 'claude-code';
}

export interface SourceTally {
  id: string;
  label: string;
  count: number;
}

/**
 * The sources actually present, with how many each has.
 *
 * Only what is in the list. Offering a filter for an AI somebody has never
 * opened gives them ten options, nine of which lead to an empty picker — the
 * menu would be longer than the thing it filters.
 *
 * Ordered by count, so the one they use most is the first one under the cursor.
 */
export function sourcesIn(sessions: readonly RankedSession[]): SourceTally[] {
  const counts = new Map<string, number>();
  for (const ranked of sessions) {
    const id = sourceOf(ranked);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([id, count]) => ({ id, label: sourceLabel(id, true), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Where the selection lands after an arrow key.
 *
 * Wraps, because a five-item list where Down stops dead at the bottom makes
 * people press it again harder rather than reach for Up. Returns 0 for an empty
 * list so callers never hold -1 and index into nothing.
 */
export function moveSelection(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}

/**
 * The header count.
 *
 * Takes the total, not the number of visible rows. Reporting the slice told
 * people they had five conversations when they had twenty-nine, which is the
 * kind of wrong that makes someone distrust everything else on the screen.
 */
export function statusLine(
  shown: number,
  total: number,
  query: string,
  source: string = ANY_SOURCE,
  settled: boolean = true,
): string {
  if (total === 0) {
    if (query.trim()) return 'Nothing matches that';
    // A filtered source with nothing in it is not the same as an empty index,
    // and telling somebody they have no conversations because they picked
    // Gemini is the kind of wrong that makes them stop trusting the count.
    if (source !== ANY_SOURCE) return `Nothing from ${sourceLabel(source, true)}`;

    /*
     * ── Empty because it has not looked yet, versus empty because there is
     *    nothing there ────────────────────────────────────────────────────────
     *
     * These were the same sentence and they are not the same fact. Opening the
     * picker reads every transcript on the machine, and on a large history that
     * is a beat or two — measured at 186MB, 21 sessions, about 20ms warm but
     * noticeably longer on the first open after an install, when nothing is
     * cached and the whole disk is cold.
     *
     * "No conversations found yet" during that beat is a verdict delivered
     * before the evidence is in, and the reasonable conclusion is that the
     * product is broken. It was reported as exactly that.
     *
     * So the first moments say what is happening instead of what was found.
     */
    return settled ? 'No conversations found yet' : 'Reading your conversations…';
  }

  const label = total === 1 ? '1 conversation' : `${total} conversations`;
  // Only mention the slice when there genuinely is one being hidden.
  return shown < total ? `${label}, showing ${shown}` : label;
}
