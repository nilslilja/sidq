import { describe, test, expect } from 'vitest';
import { deriveCalibration, calibrationBrief, calibrationInsights } from './calibration';
import type { Day, Task, TaskStatus } from '@/types/domain';

let seq = 0;
function task(estMinutes: number, status: TaskStatus, over: Partial<Task> = {}): Task {
  seq++;
  return {
    id: `t${seq}`,
    dayId: 'd',
    title: over.title ?? `Do thing ${seq}`,
    why: '',
    priorityRank: 0,
    estMinutes,
    status,
    carriedFromDayId: null,
    carryCount: 0,
    completedAt: status === 'completed' ? '2026-08-12T10:30:00.000Z' : null,
    ...over,
  };
}

function closedDay(tasks: Task[], date = '2026-08-12'): Day {
  return {
    id: `day-${date}`,
    userId: 'u',
    date,
    generatedAt: `${date}T07:00:00Z`,
    status: 'closed',
    topPriority: tasks[0]?.title ?? '',
    note: '',
    tasks,
  };
}

/** n closed days, each with the same shape. Enough to clear the confidence gate. */
function history(dayCount: number, make: (i: number) => Task[]): Day[] {
  return Array.from({ length: dayCount }, (_, i) =>
    closedDay(make(i), `2026-08-${String(i + 1).padStart(2, '0')}`),
  );
}

describe('confidence gating', () => {
  test('reports none for a brand new user', () => {
    expect(deriveCalibration([]).confidence).toBe('none');
  });

  test('reports none below the closed-day threshold, however many tasks', () => {
    const days = history(2, () => Array.from({ length: 10 }, () => task(25, 'completed')));

    expect(deriveCalibration(days).confidence).toBe('none');
  });

  test('reports none below the task threshold, however many days', () => {
    const days = history(6, () => [task(25, 'completed')]);

    expect(deriveCalibration(days).confidence).toBe('none');
  });

  test('climbs from low to high as history accumulates', () => {
    const shape = () => [task(25, 'completed'), task(45, 'completed'), task(15, 'rolled')];

    expect(deriveCalibration(history(5, shape)).confidence).toBe('low');
    expect(deriveCalibration(history(10, shape)).confidence).toBe('medium');
    expect(deriveCalibration(history(25, shape)).confidence).toBe('high');
  });

  test('produces no brief at all while confidence is none', () => {
    expect(calibrationBrief(deriveCalibration(history(1, () => [task(25, 'completed')])))).toBe('');
  });

  test('ignores days that are still open', () => {
    const open: Day = { ...closedDay([task(25, 'completed')]), status: 'ready' };

    expect(deriveCalibration([open]).closedDays).toBe(0);
  });
});

describe('duration learning', () => {
  test('finds the block size the person actually finishes', () => {
    // 25s land, 90s do not.
    const days = history(8, () => [
      task(25, 'completed'),
      task(25, 'completed'),
      task(90, 'rolled'),
    ]);

    const c = deriveCalibration(days);

    expect(c.bestDuration).toBe(25);
    expect(c.avoidDurations).toContain(90);
  });

  test('will not blacklist a size it has barely seen', () => {
    // A single failed 90 is not evidence.
    const days = history(8, (i) => [
      task(25, 'completed'),
      task(25, 'completed'),
      ...(i === 0 ? [task(90, 'rolled')] : []),
    ]);

    const c = deriveCalibration(days);

    expect(c.avoidDurations).not.toContain(90);
    expect(c.byDuration.find((d) => d.minutes === 90)?.trustworthy).toBe(false);
  });

  test('does not blacklist a size that is merely slightly worse', () => {
    const days = history(10, () => [
      task(25, 'completed'),
      task(45, 'completed'),
      task(45, 'rolled'),
    ]);

    const c = deriveCalibration(days);

    // 45 sits at 50%, clearly usable. Only reliably-abandoned sizes get dropped.
    expect(c.avoidDurations).not.toContain(45);
  });
});

describe('capacity learning', () => {
  test('measures what they complete, not what was planned', () => {
    // 120 planned each day, 50 actually finished.
    const days = history(8, () => [
      task(25, 'completed'),
      task(25, 'completed'),
      task(70 as number, 'rolled'),
    ]);

    const c = deriveCalibration(days);

    expect(c.realisticCapacity).toBe(50);
    expect(c.typicalPlanned).toBe(120);
  });

  test('excludes days with nothing finished, which measure engagement not capacity', () => {
    const days = [
      ...history(6, () => [task(25, 'completed'), task(25, 'completed')]),
      closedDay([task(25, 'rolled'), task(25, 'rolled')], '2026-08-20'),
    ];

    const c = deriveCalibration(days);

    // A zero day must not drag the median to 25.
    expect(c.realisticCapacity).toBe(50);
  });

  test('tells the planner to cut back when plans outrun reality', () => {
    const days = history(8, () => [
      task(25, 'completed'),
      task(90, 'rolled'),
      task(90, 'rolled'),
    ]);

    const brief = calibrationBrief(deriveCalibration(days));

    expect(brief).toMatch(/too much for them/);
    expect(brief).toMatch(/Plan closer to 25/);
  });
});

describe('rhythm learning', () => {
  test('finds the hours where completions actually cluster', () => {
    const at = (iso: string) => task(25, 'completed', { completedAt: iso });
    const days = history(6, () => [
      at('2026-08-12T22:00:00.000Z'),
      at('2026-08-12T22:30:00.000Z'),
      task(25, 'rolled'),
    ]);

    const c = deriveCalibration(days);
    const hour = new Date('2026-08-12T22:00:00.000Z').getHours();

    expect(c.peakHours).toContain(hour);
  });

  test('ignores a single stray completion time', () => {
    const days = history(6, (i) => [
      task(25, 'completed', { completedAt: '2026-08-12T22:00:00.000Z' }),
      task(25, 'completed', {
        completedAt: i === 0 ? '2026-08-12T04:00:00.000Z' : '2026-08-12T22:15:00.000Z',
      }),
    ]);

    const c = deriveCalibration(days);
    const stray = new Date('2026-08-12T04:00:00.000Z').getHours();

    expect(c.peakHours).not.toContain(stray);
  });
});

describe('carry rot detection', () => {
  test('notices when work is being sized too big to ever finish', () => {
    const days = history(8, () => [
      task(90, 'rolled', { carryCount: 3 }),
      task(90, 'rolled', { carryCount: 2 }),
      task(25, 'completed'),
    ]);

    const c = deriveCalibration(days);

    expect(c.chronicCarryRate).toBeGreaterThan(0.2);
    expect(calibrationBrief(c)).toMatch(/sizing too big/);
  });
});

describe('phrasing learning', () => {
  test('separates openers that get done from openers that get abandoned', () => {
    const days = history(8, () => [
      task(25, 'completed', { title: 'Send the invoice' }),
      task(25, 'completed', { title: 'Send the follow up' }),
      task(45, 'rolled', { title: 'Organise the whole archive' }),
      task(45, 'rolled', { title: 'Organise the garage' }),
    ]);

    const c = deriveCalibration(days);

    expect(c.strongOpeners).toContain('send');
    expect(c.weakOpeners).toContain('organise');
    expect(calibrationBrief(c)).toMatch(/get abandoned/);
  });
});

describe('calibrationInsights', () => {
  test('says nothing at all before there is evidence', () => {
    expect(calibrationInsights(deriveCalibration([]))).toEqual([]);
  });

  test('states what was measured and what Sidq changed', () => {
    const days = history(10, () => [
      task(25, 'completed'),
      task(25, 'completed'),
      task(90, 'rolled'),
    ]);

    const insights = calibrationInsights(deriveCalibration(days));
    const text = insights.map((i) => `${i.headline} ${i.detail}`).join(' ');

    expect(insights.length).toBeGreaterThan(0);
    expect(text).toMatch(/25 minute blocks/);
    expect(text).toMatch(/stopped giving you 90/);
  });

  test('never blames the user', () => {
    const days = history(12, () => [
      task(90, 'rolled', { carryCount: 3 }),
      task(90, 'rolled', { carryCount: 4 }),
      task(15, 'completed'),
    ]);

    const text = calibrationInsights(deriveCalibration(days))
      .map((i) => `${i.headline} ${i.detail}`)
      .join(' ')
      .toLowerCase();

    expect(text).not.toMatch(/you failed|you didn't|you should have|poor|lazy|only managed/);
  });
});
