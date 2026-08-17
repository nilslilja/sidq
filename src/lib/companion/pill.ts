import type { RankedSession } from './rank-sessions';

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
export function filterSessions(sessions: readonly RankedSession[], query: string): RankedSession[] {
  const q = query.trim().toLowerCase();
  const matches = q
    ? sessions.filter((r) => {
        const { title, projectName, lastPrompt } = r.session;
        return (
          title.toLowerCase().includes(q) ||
          projectName.toLowerCase().includes(q) ||
          lastPrompt.toLowerCase().includes(q)
        );
      })
    : [...sessions];

  return matches.slice(0, MAX_VISIBLE);
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
export function statusLine(shown: number, total: number, query: string): string {
  if (total === 0) return query.trim() ? 'Nothing matches that' : 'No conversations found yet';

  const label = total === 1 ? '1 conversation' : `${total} conversations`;
  // Only mention the slice when there genuinely is one being hidden.
  return shown < total ? `${label}, showing ${shown}` : label;
}
