import { describe, test, expect } from 'vitest';
import { summariseDay } from './session-replay';
import { rescueDay, minutesLeftToday } from './day-rescue';
import { EMPTY_CALIBRATION, type Calibration } from '@/lib/calibration';
import type { ActivitySample } from '@/lib/focus-engine';
import type { Day, Task, TaskStatus } from '@/types/domain';

const POLL = 5;

function samples(spec: [string, number][]): ActivitySample[] {
  const out: ActivitySample[] = [];
  let t = 0;
  for (const [app, count] of spec) {
    for (let i = 0; i < count; i++) {
      out.push({ app, windowTitle: `${app} window`, at: t });
      t += POLL * 1000;
    }
  }
  return out;
}

describe('session replay', () => {
  test('adds up time per app from polls alone', () => {
    // 120 polls x 5s = 600s = 10 min in Code, 5 min in Slack.
    const replay = summariseDay(samples([['Code', 120], ['Slack', 60]]), POLL);

    expect(replay.apps[0]).toMatchObject({ app: 'Code', seconds: 600 });
    expect(replay.apps[1]).toMatchObject({ app: 'Slack', seconds: 300 });
    expect(replay.totalSeconds).toBe(900);
  });

  test('shares sum to one', () => {
    const replay = summariseDay(samples([['Code', 60], ['Slack', 30], ['Chrome', 10]]), POLL);

    const total = replay.apps.reduce((s, a) => s + a.share, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  test('counts switches, not samples', () => {
    const replay = summariseDay(samples([['Code', 10], ['Slack', 10], ['Code', 10]]), POLL);

    expect(replay.switches).toBe(2);
  });

  test('finds the longest unbroken stretch and which app it was', () => {
    const replay = summariseDay(
      samples([['Slack', 12], ['Code', 200], ['Slack', 12]]),
      POLL,
    );

    expect(replay.longestStretchApp).toBe('Code');
    expect(replay.longestStretchSeconds).toBe(1000);
  });

  test('leads with fragmentation when the day was chopped up', () => {
    // Alternating apps every poll: maximum switching. 500 polls x 5s is 41 min,
    // past the half-hour floor below which switch counts mean nothing.
    const alternating: [string, number][] = [];
    for (let i = 0; i < 500; i++) alternating.push([i % 2 === 0 ? 'Code' : 'Slack', 1]);

    const replay = summariseDay(samples(alternating), POLL);

    expect(replay.headline).toMatch(/app switches/);
  });

  test('leads with the deep stretch when there was one', () => {
    const replay = summariseDay(samples([['Code', 700]]), POLL);

    expect(replay.headline).toMatch(/unbroken in Code/);
  });

  test('ignores the machine idling and the app itself', () => {
    const replay = summariseDay(
      samples([['loginWindow', 100], ['Sidq', 100], ['Code', 60]]),
      POLL,
    );

    expect(replay.apps.map((a) => a.app)).toEqual(['Code']);
  });

  test('says nothing rather than inventing a day', () => {
    expect(summariseDay([], POLL).headline).toBe('Nothing tracked today.');
    expect(summariseDay([], POLL).totalSeconds).toBe(0);
  });
});

// ---------------------------------------------------------------------------

let seq = 0;
function task(estMinutes: number, status: TaskStatus = 'pending', over: Partial<Task> = {}): Task {
  seq++;
  return {
    id: `t${seq}`,
    dayId: 'd',
    title: `Task ${seq}`,
    why: '',
    priorityRank: seq,
    estMinutes,
    status,
    carriedFromDayId: null,
    carryCount: 0,
    completedAt: null,
    ...over,
  };
}

const day = (tasks: Task[]): Day => ({
  id: 'd',
  userId: 'u',
  date: '2026-08-13',
  generatedAt: null,
  status: 'ready',
  topPriority: tasks[0]?.title ?? '',
  note: '',
  tasks,
});

const at = (h: number, m = 0) => new Date(2026, 7, 13, h, m, 0);

const calibrated = (over: Partial<Calibration> = {}): Calibration => ({
  ...EMPTY_CALIBRATION,
  confidence: 'high',
  closedDays: 20,
  totalTasks: 80,
  bestDuration: 25,
  byDuration: [
    { minutes: 15, planned: 20, completed: 18, rate: 0.9, trustworthy: true },
    { minutes: 25, planned: 20, completed: 16, rate: 0.8, trustworthy: true },
    { minutes: 90, planned: 20, completed: 2, rate: 0.1, trustworthy: true },
  ],
  ...over,
});

describe('minutesLeftToday', () => {
  test('discounts the remaining time, because nobody works to the wire', () => {
    // 3pm to 6pm is 180 raw minutes; the realistic figure is lower.
    const left = minutesLeftToday(at(15), 18);

    expect(left).toBeLessThan(180);
    expect(left).toBeGreaterThan(90);
  });

  test('is zero once the day is over', () => {
    expect(minutesLeftToday(at(19), 18)).toBe(0);
  });
});

describe('rescueDay', () => {
  test('never keeps more work than fits in the time left', () => {
    const d = day([task(90), task(90), task(25), task(15)]);

    const plan = rescueDay({ day: d, calibration: calibrated(), now: at(16), endHour: 18 });
    const kept = plan.keep.reduce((s, t) => s + t.estMinutes, 0);

    expect(kept).toBeLessThanOrEqual(plan.minutesLeft);
  });

  test('keeps what is most likely to get done, not this morning s priority', () => {
    // Task 1 is the declared priority but a 90 minute block this person abandons.
    const big = task(90, 'pending', { title: 'The big one', priorityRank: 0 });
    const small = task(15, 'pending', { title: 'The small one', priorityRank: 3 });
    const d = day([big, small]);

    const plan = rescueDay({ day: d, calibration: calibrated(), now: at(16, 30), endHour: 18 });

    expect(plan.keep[0].title).toBe('The small one');
  });

  test('shrinks rather than showing an empty board when nothing fits', () => {
    const d = day([task(90), task(90)]);

    const plan = rescueDay({ day: d, calibration: calibrated(), now: at(17, 30), endHour: 18 });

    expect(plan.keep).toHaveLength(1);
    expect(plan.keep[0].title).toMatch(/^Start ".+" and stop after \d+ minutes$/);
    expect(plan.keep[0].estMinutes).toBeLessThanOrEqual(plan.minutesLeft);
  });

  test('accounts for every outstanding task, keeping or dropping each exactly once', () => {
    const d = day([task(90), task(45), task(25), task(15)]);

    const plan = rescueDay({ day: d, calibration: calibrated(), now: at(16), endHour: 18 });

    expect(plan.keep.length + plan.drop.length).toBe(4);
  });

  test('ignores work already finished', () => {
    const d = day([task(25, 'completed'), task(15, 'pending')]);

    const plan = rescueDay({ day: d, calibration: calibrated(), now: at(16), endHour: 18 });

    expect(plan.keep.length + plan.drop.length).toBe(1);
  });

  test('says there is nothing to rescue rather than faking a plan late on', () => {
    const d = day([task(45)]);

    const plan = rescueDay({ day: d, calibration: calibrated(), now: at(17, 55), endHour: 18 });

    expect(plan.worthRescuing).toBe(false);
    expect(plan.keep).toHaveLength(0);
    expect(plan.message).toMatch(/tomorrow/);
  });

  test('handles a day with nothing outstanding', () => {
    const plan = rescueDay({
      day: day([task(25, 'completed')]),
      calibration: calibrated(),
      now: at(16),
    });

    expect(plan.worthRescuing).toBe(false);
    expect(plan.message).toMatch(/already closed out/);
  });

  test('never blames the person for the plan being wrong', () => {
    const d = day([task(90), task(90), task(90)]);

    const plan = rescueDay({ day: d, calibration: calibrated(), now: at(16), endHour: 18 });

    expect(plan.message.toLowerCase()).not.toMatch(
      /you failed|behind|did not|didn't|should have|only managed|fell short/,
    );
  });
});
