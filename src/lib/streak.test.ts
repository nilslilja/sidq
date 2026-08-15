import { describe, test, expect } from 'vitest';
import {
  initialStreak,
  recordActiveDay,
  viewStreak,
  streakMessage,
  dayCountsAsActive,
  MAX_GRACE,
  STARTING_GRACE,
  type StreakState,
} from './streak';

const at = (count: number, lastActive: string, grace = STARTING_GRACE): StreakState => ({
  count,
  lastActive,
  grace,
});

describe('recordActiveDay', () => {
  test('starts at one on the very first day', () => {
    const { state, outcome } = recordActiveDay(initialStreak(), '2026-08-12');

    expect(state.count).toBe(1);
    expect(state.lastActive).toBe('2026-08-12');
    expect(outcome).toBe('first-day');
  });

  test('increments on a consecutive day', () => {
    const { state, outcome } = recordActiveDay(at(4, '2026-08-11'), '2026-08-12');

    expect(state.count).toBe(5);
    expect(outcome).toBe('continued');
  });

  test('is idempotent when the same day is recorded twice', () => {
    const before = at(5, '2026-08-12');

    const { state, outcome } = recordActiveDay(before, '2026-08-12');

    expect(state).toEqual(before);
    expect(outcome).toBe('already-counted');
  });

  test('ignores a clock that jumped backwards', () => {
    const before = at(5, '2026-08-12');

    const { outcome } = recordActiveDay(before, '2026-08-10');

    expect(outcome).toBe('already-counted');
  });
});

describe('forgiveness', () => {
  test('spends one grace to cover a single missed day and keeps counting', () => {
    const { state, outcome, graceSpent } = recordActiveDay(at(6, '2026-08-10', 2), '2026-08-12');

    expect(outcome).toBe('grace-used');
    expect(graceSpent).toBe(1);
    expect(state.count).toBe(7);
    expect(state.grace).toBe(1 + 1); // one spent, one earned at the 7-day mark
  });

  test('spends two grace to cover a two-day gap', () => {
    const { state, outcome, graceSpent } = recordActiveDay(at(3, '2026-08-09', 2), '2026-08-12');

    expect(outcome).toBe('grace-used');
    expect(graceSpent).toBe(2);
    expect(state.count).toBe(4);
    expect(state.grace).toBe(0);
  });

  test('restarts at one, never at zero, once grace runs out', () => {
    const { state, outcome } = recordActiveDay(at(12, '2026-08-01', 1), '2026-08-12');

    expect(outcome).toBe('restarted');
    expect(state.count).toBe(1);
    expect(state.count).not.toBe(0);
  });

  test('hands back a full grace balance after a restart so the next run is not fragile', () => {
    const { state } = recordActiveDay(at(12, '2026-08-01', 0), '2026-08-12');

    expect(state.grace).toBe(STARTING_GRACE);
  });

  test('cannot cover a gap wider than the grace balance', () => {
    const { outcome } = recordActiveDay(at(9, '2026-08-08', 1), '2026-08-12');

    expect(outcome).toBe('restarted');
  });
});

describe('grace regeneration', () => {
  test('earns one grace on completing a full week', () => {
    const { state } = recordActiveDay(at(6, '2026-08-11', 0), '2026-08-12');

    expect(state.count).toBe(7);
    expect(state.grace).toBe(1);
  });

  test('does not earn grace mid-week', () => {
    const { state } = recordActiveDay(at(4, '2026-08-11', 0), '2026-08-12');

    expect(state.count).toBe(5);
    expect(state.grace).toBe(0);
  });

  test('never exceeds the cap', () => {
    const { state } = recordActiveDay(at(13, '2026-08-11', MAX_GRACE), '2026-08-12');

    expect(state.count).toBe(14);
    expect(state.grace).toBe(MAX_GRACE);
  });

  test('a long consistent run stays capped and never goes negative', () => {
    let state = initialStreak();
    let day = new Date(2026, 0, 1);

    for (let i = 0; i < 60; i++) {
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      state = recordActiveDay(state, key).state;
      day.setDate(day.getDate() + 1);
    }

    expect(state.count).toBe(60);
    expect(state.grace).toBeLessThanOrEqual(MAX_GRACE);
    expect(state.grace).toBeGreaterThanOrEqual(0);
  });
});

describe('viewStreak', () => {
  test('marks the streak at risk on the day after the last active one', () => {
    const view = viewStreak(at(5, '2026-08-11'), '2026-08-12');

    expect(view.atRisk).toBe(true);
    expect(view.claimedToday).toBe(false);
  });

  test('is not at risk once today is claimed', () => {
    const view = viewStreak(at(5, '2026-08-12'), '2026-08-12');

    expect(view.atRisk).toBe(false);
    expect(view.claimedToday).toBe(true);
  });

  test('is not at risk for a brand new user with nothing to lose', () => {
    const view = viewStreak(initialStreak(), '2026-08-12');

    expect(view.atRisk).toBe(false);
  });
});

describe('streakMessage', () => {
  test('never blames the user on a restart', () => {
    const result = recordActiveDay(at(20, '2026-07-01', 0), '2026-08-12');

    const message = streakMessage(result).toLowerCase();

    expect(message).not.toMatch(/lost|broke|failed|missed|sorry|oops/);
    expect(message).toContain('back on');
  });

  test('tells the user grace absorbed the gap', () => {
    const result = recordActiveDay(at(2, '2026-08-10', 2), '2026-08-12');

    expect(streakMessage(result)).toContain('covered');
  });

  test('says day rather than days at one', () => {
    const result = recordActiveDay(initialStreak(), '2026-08-12');

    expect(streakMessage(result)).not.toContain('1 days');
  });
});

describe('dayCountsAsActive', () => {
  test('one finished task is enough', () => {
    expect(dayCountsAsActive(1)).toBe(true);
  });

  test('a day with nothing finished does not count', () => {
    expect(dayCountsAsActive(0)).toBe(false);
  });
});
