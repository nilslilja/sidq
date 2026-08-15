import { describe, test, expect } from 'vitest';
import {
  redactDay,
  summariseClient,
  orderForCoach,
  seatsUsed,
  canInvite,
  type CoachLink,
  type ClientSummary,
  type ShareScope,
} from './coaching';
import type { Day, Task, TaskStatus } from '@/types/domain';

let seq = 0;
function task(estMinutes: number, status: TaskStatus, over: Partial<Task> = {}): Task {
  seq++;
  return {
    id: `t${seq}`,
    dayId: 'd',
    title: over.title ?? `Fix the billing bug ${seq}`,
    why: 'Because you said runway matters more than anything else right now.',
    priorityRank: 0,
    estMinutes,
    status,
    carriedFromDayId: null,
    carryCount: 0,
    completedAt: status === 'completed' ? '2026-08-12T10:00:00.000Z' : null,
    ...over,
  };
}

function day(date: string, tasks: Task[], status: Day['status'] = 'closed'): Day {
  return {
    id: `day-${date}`,
    userId: 'client-1',
    date,
    generatedAt: `${date}T07:00:00Z`,
    status,
    topPriority: tasks[0]?.title ?? '',
    note: 'A private note that quotes their goals back at them.',
    tasks,
  };
}

/** n closed days ending on 2026-08-20, newest last. */
function history(n: number, make: (i: number) => Task[]): Day[] {
  return Array.from({ length: n }, (_, i) =>
    day(`2026-08-${String(i + 1).padStart(2, '0')}`, make(i)),
  );
}

describe('redactDay', () => {
  const d = day('2026-08-12', [
    task(25, 'completed', { title: 'Call the clinic about the prescription' }),
    task(45, 'rolled', { title: 'Draft the divorce settlement response' }),
  ]);

  test('never leaks task titles under the signals scope', () => {
    const out = redactDay(d, 'signals')!;

    expect(out.tasks.every((t) => t.title === undefined)).toBe(true);
    expect(JSON.stringify(out)).not.toContain('clinic');
    expect(JSON.stringify(out)).not.toContain('divorce');
  });

  test('never leaks the why line under ANY scope', () => {
    // `why` quotes the client's own goals back at them. It is the most personal
    // text in the product and no scope exposes it.
    for (const scope of ['signals', 'signals-and-titles'] as ShareScope[]) {
      const out = JSON.stringify(redactDay(d, scope));

      expect(out).not.toContain('runway');
      expect(out).not.toContain('Because you said');
    }
  });

  test('never leaks the plan note under any scope', () => {
    for (const scope of ['signals', 'signals-and-titles'] as ShareScope[]) {
      expect(JSON.stringify(redactDay(d, scope))).not.toContain('quotes their goals');
    }
  });

  test('shares titles when the client opted in', () => {
    const out = redactDay(d, 'signals-and-titles')!;

    expect(out.tasks[0].title).toBe('Call the clinic about the prescription');
  });

  test('shares nothing at all when paused', () => {
    expect(redactDay(d, 'paused')).toBeNull();
  });

  test('still carries the completion signal without any content', () => {
    const out = redactDay(d, 'signals')!;

    expect(out.completed).toBe(1);
    expect(out.completedMinutes).toBe(25);
    expect(out.plannedMinutes).toBe(70);
  });
});

describe('summariseClient', () => {
  const base = {
    clientId: 'c1',
    displayName: 'Sam',
    status: 'active' as const,
    shareScope: 'signals' as ShareScope,
    streakCount: 4,
    today: '2026-08-21',
  };

  test('a paused client exposes no behavioural data whatsoever', () => {
    const days = history(20, () => [task(25, 'completed'), task(90, 'rolled')]);

    const s = summariseClient({ ...base, shareScope: 'paused', days });

    expect(s.calibration).toBeNull();
    expect(s.completionRate).toBeNull();
    expect(s.streakCount).toBe(0);
    expect(s.daysSinceActive).toBeNull();
  });

  test('a paused client reads as paused rather than as silence', () => {
    const s = summariseClient({ ...base, shareScope: 'paused', days: [] });

    expect(s.headline).toMatch(/privacy, not silence/);
    expect(s.needsAttention).toBe(false);
  });

  test('disengagement outranks every other signal', () => {
    // Completion looks fine, but they stopped showing up nine days ago. That is
    // the thing a coach needs, and no statistic should bury it.
    const days = history(6, () => [task(25, 'completed'), task(25, 'completed')]);

    const s = summariseClient({ ...base, days, today: '2026-08-15' });

    expect(s.headline).toMatch(/Nothing closed in 9 days/);
    expect(s.needsAttention).toBe(true);
  });

  test('flags a client who has never closed a day', () => {
    const s = summariseClient({ ...base, days: [] });

    expect(s.headline).toMatch(/not closed a day yet/);
    expect(s.needsAttention).toBe(true);
  });

  test('detects a week-over-week slip', () => {
    // Older week strong, recent week weak.
    const older = Array.from({ length: 7 }, (_, i) =>
      day(`2026-08-0${i + 1}`, [task(25, 'completed'), task(25, 'completed')]),
    );
    const recent = Array.from({ length: 7 }, (_, i) =>
      day(`2026-08-1${i + 4}`, [task(25, 'rolled'), task(25, 'rolled')]),
    );

    const s = summariseClient({ ...base, days: [...older, ...recent], today: '2026-08-21' });

    expect(s.trend).toBe('slipping');
  });

  test('surfaces building avoidance', () => {
    const days = Array.from({ length: 12 }, (_, i) =>
      day(`2026-08-${String(i + 9).padStart(2, '0')}`, [
        task(90, 'rolled', { carryCount: 4 }),
        task(90, 'rolled', { carryCount: 3 }),
        task(15, 'completed'),
      ]),
    );

    const s = summariseClient({ ...base, days, today: '2026-08-21' });

    expect(s.headline).toMatch(/rolling over|Avoidance|avoidance/);
    expect(s.needsAttention).toBe(true);
  });

  test('does not manufacture an opinion from two days of history', () => {
    const days = [
      day('2026-08-20', [task(25, 'completed')]),
      day('2026-08-21', [task(25, 'completed')]),
    ];

    const s = summariseClient({ ...base, days, today: '2026-08-21' });

    expect(s.headline).toMatch(/getting started|Holding steady/);
    expect(s.needsAttention).toBe(false);
  });

  test('never phrases a headline as a judgement of the person', () => {
    const days = Array.from({ length: 12 }, (_, i) =>
      day(`2026-08-${String(i + 9).padStart(2, '0')}`, [
        task(90, 'rolled', { carryCount: 4 }),
        task(90, 'rolled', { carryCount: 4 }),
      ]),
    );

    const s = summariseClient({ ...base, days, today: '2026-08-21' });

    expect(s.headline.toLowerCase()).not.toMatch(/lazy|failing|bad|poor|unmotivated|excuse/);
  });
});

describe('orderForCoach', () => {
  const stub = (over: Partial<ClientSummary>): ClientSummary => ({
    clientId: 'x',
    displayName: 'X',
    status: 'active',
    shareScope: 'signals',
    calibration: null,
    completionRate: 0.6,
    streakCount: 0,
    daysSinceActive: 1,
    trend: 'steady',
    headline: '',
    needsAttention: false,
    ...over,
  });

  test('puts the clients who need attention first and paused ones last', () => {
    const ordered = orderForCoach([
      stub({ clientId: 'steady' }),
      stub({ clientId: 'paused', status: 'paused' }),
      stub({ clientId: 'improving', trend: 'improving' }),
      stub({ clientId: 'atrisk', needsAttention: true, daysSinceActive: 6 }),
    ]);

    expect(ordered.map((c) => c.clientId)).toEqual(['atrisk', 'steady', 'improving', 'paused']);
  });

  test('among at-risk clients, the quietest comes first', () => {
    const ordered = orderForCoach([
      stub({ clientId: 'quiet3', needsAttention: true, daysSinceActive: 3 }),
      stub({ clientId: 'quiet9', needsAttention: true, daysSinceActive: 9 }),
    ]);

    expect(ordered[0].clientId).toBe('quiet9');
  });
});

describe('seats', () => {
  const link = (status: CoachLink['status']): CoachLink => ({
    id: 'l',
    coachId: 'coach',
    clientId: 'c',
    status,
    shareScope: 'signals',
    invitedAt: '2026-08-01',
    acceptedAt: null,
  });

  test('a paused client still occupies a seat', () => {
    expect(seatsUsed([link('active'), link('paused')])).toBe(2);
  });

  test('a pending invite occupies a seat, so seats cannot be oversold', () => {
    expect(seatsUsed([link('active'), link('invited')])).toBe(2);
  });

  test('a revoked client frees their seat', () => {
    expect(seatsUsed([link('active'), link('revoked')])).toBe(1);
  });

  test('blocks inviting past the seat limit', () => {
    const full = Array.from({ length: 15 }, () => link('active'));

    expect(canInvite(full, 15)).toBe(false);
    expect(canInvite(full.slice(0, 14), 15)).toBe(true);
  });
});
