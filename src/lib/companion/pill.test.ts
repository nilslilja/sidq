import { describe, test, expect } from 'vitest';
import {
  ANY_SOURCE,
  filterSessions,
  moveSelection,
  sourceOf,
  sourcesIn,
  statusLine,
  MAX_VISIBLE,
} from './pill';
import type { RankedSession } from './rank-sessions';

function ranked(over: Partial<RankedSession['session']> = {}, score = 1): RankedSession {
  return {
    score,
    substance: score,
    reason: '3h session',
    session: {
      sessionId: 'abc',
      project: '/Users/x/Sidq',
      projectName: 'Sidq',
      title: 'Pricing page copy',
      lastPrompt: 'carry on with the tiers',
      branch: 'main',
      endedAt: 0,
      ...over,
    } as RankedSession['session'],
  };
}

describe('filterSessions', () => {
  const list = [
    ranked({ title: 'Pricing page copy', projectName: 'Sidq' }),
    ranked({ title: 'Onboarding email sequence', projectName: 'Verdict' }),
    ranked({ title: 'Refund policy wording', projectName: 'Sidq' }),
  ];

  test('shows everything when nothing has been typed', () => {
    expect(filterSessions(list, '')).toHaveLength(3);
  });

  test('matches the title regardless of case', () => {
    expect(filterSessions(list, 'PRICING')).toHaveLength(1);
    expect(filterSessions(list, 'pricing')[0].session.title).toBe('Pricing page copy');
  });

  test('matches the project, because that is what people type', () => {
    // "sidq" is what you type when you mean "the thing in that folder".
    const out = filterSessions(list, 'sidq');

    expect(out).toHaveLength(2);
    expect(out.every((r) => r.session.projectName === 'Sidq')).toBe(true);
  });

  test('matches the last thing asked', () => {
    expect(filterSessions(list, 'tiers')).toHaveLength(3);
  });

  test('ignores surrounding whitespace', () => {
    expect(filterSessions(list, '  refund  ')).toHaveLength(1);
  });

  test('returns nothing rather than everything when there is no match', () => {
    expect(filterSessions(list, 'zzzz')).toEqual([]);
  });

  test('preserves ranking order rather than re-sorting by match', () => {
    // Re-ranking on every keystroke moves items under the person's fingers
    // between one letter and the next, which is how you pick the wrong one.
    const ordered = [
      ranked({ title: 'aaa match' }, 0.9),
      ranked({ title: 'bbb match' }, 0.5),
      ranked({ title: 'ccc match' }, 0.1),
    ];

    expect(filterSessions(ordered, 'match').map((r) => r.score)).toEqual([0.9, 0.5, 0.1]);
  });

  test('never shows more than a glance', () => {
    const many = Array.from({ length: 20 }, (_, i) => ranked({ title: `Session ${i}` }));

    expect(filterSessions(many, '')).toHaveLength(MAX_VISIBLE);
  });
});

describe('moveSelection', () => {
  test('moves down and up', () => {
    expect(moveSelection(0, 1, 5)).toBe(1);
    expect(moveSelection(3, -1, 5)).toBe(2);
  });

  test('wraps at both ends', () => {
    // Stopping dead at the bottom makes people press Down again rather than Up.
    expect(moveSelection(4, 1, 5)).toBe(0);
    expect(moveSelection(0, -1, 5)).toBe(4);
  });

  test('returns a usable index for an empty list', () => {
    // Never -1: callers index straight into the array with this.
    expect(moveSelection(0, 1, 0)).toBe(0);
    expect(moveSelection(3, -1, 0)).toBe(0);
  });

  test('survives an index left over from a longer list', () => {
    // The list shrinks as you type, and the old selection must not point past
    // the end of the new one.
    expect(moveSelection(9, 1, 3)).toBeLessThan(3);
    expect(moveSelection(9, 0, 3)).toBeLessThan(3);
  });
});

describe('statusLine', () => {
  test('counts, and gets the singular right', () => {
    expect(statusLine(1, 1, '')).toBe('1 conversation');
    expect(statusLine(4, 4, '')).toBe('4 conversations');
  });

  test('reports the total, not the number of rows on screen', () => {
    /*
     * The bug this replaces. Twenty-nine conversations were loaded, five were
     * shown, and the header said "5 conversations" — telling somebody their
     * history was a fifth of its real size.
     */
    expect(statusLine(12, 29, '')).toBe('29 conversations, showing 12');
  });

  test('does not mention a slice when nothing is hidden', () => {
    expect(statusLine(3, 3, '')).toBe('3 conversations');
  });

  test('distinguishes an empty history from a query that matched nothing', () => {
    expect(statusLine(0, 0, '')).toBe('No conversations found yet');
    expect(statusLine(0, 0, 'xyz')).toBe('Nothing matches that');
  });
});

/*
 * ── The source filter ────────────────────────────────────────────────────────
 *
 * The picker loaded fifty conversations from every AI on the machine and
 * ordered them only by when they ended, so the ChatGPT thread from this morning
 * sat somewhere in the middle of everything else.
 */
describe('filtering by which AI it came from', () => {
  const mixed = [
    ranked({ title: 'Pricing page copy', source: 'claude-code' }),
    ranked({ title: 'Notch placement', source: 'chatgpt' }),
    ranked({ title: 'Referral schema', source: 'chatgpt' }),
    ranked({ title: 'Colour tokens', source: 'cursor' }),
  ];

  test('narrows to one AI', () => {
    const found = filterSessions(mixed, '', 'chatgpt');
    expect(found.map((r) => r.session.title)).toEqual(['Notch placement', 'Referral schema']);
  });

  test('the default shows everything', () => {
    expect(filterSessions(mixed, '')).toHaveLength(4);
    expect(filterSessions(mixed, '', ANY_SOURCE)).toHaveLength(4);
  });

  test('the query narrows within the chosen AI, not across all of them', () => {
    // "page" matches a Claude Code row. Filtered to ChatGPT it must find
    // nothing, rather than reaching back out to the other source.
    expect(filterSessions(mixed, 'page', 'chatgpt')).toHaveLength(0);
    expect(filterSessions(mixed, 'page', ANY_SOURCE)).toHaveLength(1);
  });

  test('a session with no source counts as Claude Code', () => {
    // The field was added after the first reader shipped, and every row written
    // before it is one of its transcripts. Rust defaults the same way.
    const old = ranked({ title: 'Before the field existed' });
    expect(sourceOf(old)).toBe('claude-code');
    expect(filterSessions([old], '', 'claude-code')).toHaveLength(1);
  });
});

describe('the sources offered', () => {
  test('only the ones actually present, with counts', () => {
    /*
     * Offering all ten supported AIs would give somebody nine options that lead
     * to an empty picker — a menu longer than the list it filters.
     */
    const found = sourcesIn([
      ranked({ source: 'chatgpt' }),
      ranked({ source: 'chatgpt' }),
      ranked({ source: 'cursor' }),
    ]);

    expect(found.map((s) => [s.id, s.count])).toEqual([
      ['chatgpt', 2],
      ['cursor', 1],
    ]);
  });

  test('the most used comes first, so it is under the cursor', () => {
    const found = sourcesIn([
      ranked({ source: 'cursor' }),
      ranked({ source: 'chatgpt' }),
      ranked({ source: 'chatgpt' }),
    ]);
    expect(found[0].id).toBe('chatgpt');
  });

  test('the editors are named after the one people look for', () => {
    // The full label is "Cursor, Windsurf, VS Code", which is right on a
    // settings panel and far too long for a 560 point filter. The short form
    // was "Editors" until someone read the picker, did not see Cursor, and
    // concluded we had dropped it.
    expect(sourcesIn([ranked({ source: 'cursor' })])[0].label).toBe('Cursor');
  });

  test('an empty list offers nothing rather than a row of zeroes', () => {
    expect(sourcesIn([])).toEqual([]);
  });
});

describe('the count under a source filter', () => {
  test('an empty source says which one, not that there is no history', () => {
    /*
     * "No conversations found yet" for somebody with fifty of them, because
     * they picked Gemini, is the kind of wrong that makes the whole count
     * untrustworthy.
     */
    expect(statusLine(0, 0, '', 'gemini')).toBe('Nothing from Gemini');
    expect(statusLine(0, 0, '', ANY_SOURCE)).toBe('No conversations found yet');
  });

  test('a query that matches nothing still blames the query', () => {
    expect(statusLine(0, 0, 'zzz', 'gemini')).toBe('Nothing matches that');
  });
});

/*
 * Reported as "sidq doesn't pick up chats anymore". The backend was fine —
 * measured at 21 sessions from 186MB of transcripts in about 20ms — but the
 * picker said "No conversations found yet" during the read, which is a verdict
 * delivered before the evidence is in.
 */
describe('empty because it is looking, versus empty because it is empty', () => {
  test('says what it is doing until the first read comes back', () => {
    expect(statusLine(0, 0, '', ANY_SOURCE, false)).toBe(
      'Reading your conversations…',
    );
  });

  test('only calls it empty once it has actually looked', () => {
    expect(statusLine(0, 0, '', ANY_SOURCE, true)).toBe(
      'No conversations found yet',
    );
  });

  test('a search with no matches is never mistaken for still loading', () => {
    // The query has already been applied to a list that arrived, so this one is
    // a real answer even when nothing has settled.
    expect(statusLine(0, 0, 'tax', ANY_SOURCE, false)).toBe('Nothing matches that');
  });

  test('settled defaults to true, so existing callers keep their meaning', () => {
    expect(statusLine(0, 0, '')).toBe('No conversations found yet');
  });
});
