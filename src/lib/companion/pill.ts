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

/** More than this on screen and it stops being a glance. */
export const MAX_VISIBLE = 5;

/**
 * Sessions matching what has been typed.
 *
 * Substring, not fuzzy. Fuzzy matching is the obvious reach here and it is wrong
 * for this list: it is five items long, the person is typing a word they already
 * remember, and fuzzy ranking would reorder results under their fingers between
 * one keystroke and the next.
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
 * The header line, which is the only status the pill shows.
 *
 * Says what is about to happen rather than what the app is doing. "Copying…" is
 * about us; "Ready to paste" is about them.
 */
export function statusLine(count: number, query: string): string {
  if (count > 0) return count === 1 ? '1 conversation' : `${count} conversations`;
  return query.trim() ? 'Nothing matches that' : 'No conversations found yet';
}
