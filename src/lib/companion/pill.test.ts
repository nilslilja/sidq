import { describe, test, expect } from 'vitest';
import { filterSessions, moveSelection, statusLine, MAX_VISIBLE } from './pill';
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
    expect(statusLine(1, '')).toBe('1 conversation');
    expect(statusLine(4, '')).toBe('4 conversations');
  });

  test('distinguishes an empty history from a query that matched nothing', () => {
    expect(statusLine(0, '')).toBe('No conversations found yet');
    expect(statusLine(0, 'xyz')).toBe('Nothing matches that');
  });
});
