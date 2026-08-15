import { describe, test, expect } from 'vitest';
import { localDateKey, addDays, daysBetween, parseDateKey } from './date';

describe('localDateKey', () => {
  test('uses the local calendar date, not the UTC one', () => {
    // 2026-03-10 23:30 local. In any timezone west of UTC this is already
    // 2026-03-11 in UTC, and slicing an ISO string would report the wrong day.
    const lateEvening = new Date(2026, 2, 10, 23, 30, 0);

    expect(localDateKey(lateEvening)).toBe('2026-03-10');
  });

  test('pads single-digit months and days', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  test('round-trips through parseDateKey', () => {
    const key = '2026-08-12';

    expect(localDateKey(parseDateKey(key))).toBe(key);
  });
});

describe('addDays', () => {
  test('rolls across a month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  test('rolls across a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  test('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  test('goes backwards', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('daysBetween', () => {
  test('counts consecutive days as one', () => {
    expect(daysBetween('2026-08-11', '2026-08-12')).toBe(1);
  });

  test('is zero for the same day', () => {
    expect(daysBetween('2026-08-12', '2026-08-12')).toBe(0);
  });

  test('is negative going backwards', () => {
    expect(daysBetween('2026-08-12', '2026-08-10')).toBe(-2);
  });

  test('stays exact across a spring-forward DST boundary', () => {
    // US DST starts 2026-03-08. A naive millisecond division reports 0.958 days
    // here and floors to 0, which would silently break a streak.
    expect(daysBetween('2026-03-07', '2026-03-08')).toBe(1);
    expect(daysBetween('2026-03-01', '2026-03-31')).toBe(30);
  });

  test('stays exact across an autumn fall-back boundary', () => {
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1);
    expect(daysBetween('2026-11-01', '2026-11-30')).toBe(29);
  });
});
