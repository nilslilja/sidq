import { describe, test, expect } from 'vitest';
import { deriveAttention, attentionLine, toStretches, EMPTY_ATTENTION } from './attention';
import type { ActivitySample } from '@/lib/focus-engine';

const POLL = 5;

/** Build samples from a script of [app, minutes] starting at a given hour. */
function day(spec: [string, number][], hour = 9, dayOffset = 0): ActivitySample[] {
  const out: ActivitySample[] = [];
  const base = new Date(2026, 7, 10 + dayOffset, hour, 0, 0).getTime();
  let t = base;
  for (const [app, minutes] of spec) {
    const ticks = Math.round((minutes * 60) / POLL);
    for (let i = 0; i < ticks; i++) {
      out.push({ app, windowTitle: `${app} window`, at: t });
      t += POLL * 1000;
    }
  }
  return out;
}

describe('toStretches', () => {
  test('collapses consecutive samples of one app into a single stretch', () => {
    const stretches = toStretches(day([['Code', 30], ['Slack', 10]]), POLL);

    expect(stretches).toHaveLength(2);
    expect(stretches[0]).toMatchObject({ app: 'Code', seconds: 1800 });
    expect(stretches[1]).toMatchObject({ app: 'Slack', seconds: 600 });
  });
});

describe('deriveAttention', () => {
  test('says nothing at all with no data', () => {
    expect(deriveAttention([], POLL)).toEqual(EMPTY_ATTENTION);
  });

  test('refuses to report a switch cost from too few interruptions', () => {
    // One interruption is an anecdote.
    const profile = deriveAttention(day([['Code', 30], ['Slack', 8], ['Code', 30]]), POLL);

    expect(profile.switchCostMinutes).toBeNull();
    expect(profile.trustworthy).toBe(false);
  });

  test('measures the real cost of an interruption, not the length of it', () => {
    // Each Slack visit is 8 minutes, but recovery is measured to the next
    // sustained block, which is what the interruption actually cost.
    const samples = [
      ...day([['Code', 20], ['Slack', 8], ['Chrome', 6], ['Code', 20]], 9, 0),
      ...day([['Code', 20], ['Slack', 8], ['Chrome', 6], ['Code', 20]], 9, 1),
      ...day([['Code', 20], ['Slack', 8], ['Chrome', 6], ['Code', 20]], 9, 2),
    ];

    const profile = deriveAttention(samples, POLL);

    // 8 minutes of Slack plus 6 of Chrome before real work resumed.
    expect(profile.switchCostMinutes).toBe(14);
    expect(profile.trustworthy).toBe(true);
  });

  test('does not count going home as a recovery', () => {
    // A long gap is a different session. Without the guard this would report a
    // switch cost of many hours.
    const morning = day([['Code', 30], ['Slack', 6]], 9, 0);
    const evening = day([['Code', 30]], 20, 0);

    const profile = deriveAttention([...morning, ...evening], POLL);

    expect(profile.switchCostMinutes).toBeNull();
  });

  test('measures how long it takes to actually start', () => {
    // Nine minutes of flitting between short things before the first real
    // block. Each warm-up stretch is under the sustained threshold on purpose:
    // seven solid minutes of email IS starting work, and counting it as latency
    // would flatter the number.
    const samples = day([['Mail', 3], ['Slack', 4], ['Chrome', 2], ['Code', 40]], 9);

    const profile = deriveAttention(samples, POLL);

    expect(profile.startLatencyMinutes).toBe(9);
  });

  test('finds the app that precedes drift, not the biggest app', () => {
    // Code is by far the largest, but Slack is what opens the door each time.
    const samples = [
      ...day([['Code', 60], ['Slack', 2], ['YouTube', 25]], 9, 0),
      ...day([['Code', 60], ['Slack', 2], ['YouTube', 25]], 9, 1),
    ];

    const profile = deriveAttention(samples, POLL);

    expect(profile.gatewayApp).toBe('Slack');
  });

  test('does not name a gateway from a single occurrence', () => {
    const profile = deriveAttention(day([['Code', 40], ['Slack', 2], ['YouTube', 20]]), POLL);

    expect(profile.gatewayApp).toBeNull();
  });

  test('measures the hours real work happens in', () => {
    const samples = [
      ...day([['Code', 50]], 14, 0),
      ...day([['Code', 50]], 14, 1),
      ...day([['Mail', 6]], 9, 0),
    ];

    const profile = deriveAttention(samples, POLL);

    expect(profile.goldenHours[0]).toBe(14);
  });

  test('counts the days it is speaking from', () => {
    const samples = [...day([['Code', 30]], 9, 0), ...day([['Code', 30]], 9, 1)];

    expect(deriveAttention(samples, POLL).daysOfEvidence).toBe(2);
  });
});

describe('attentionLine', () => {
  const solid = {
    ...EMPTY_ATTENTION,
    switchCostMinutes: 19,
    startLatencyMinutes: 34,
    goldenHours: [14],
    daysOfEvidence: 5,
    trustworthy: true,
  };

  test('stays silent until the numbers are real', () => {
    expect(attentionLine({ ...solid, trustworthy: false }, 'drift')).toBeNull();
    expect(attentionLine(EMPTY_ATTENTION, 'morning')).toBeNull();
  });

  test('states the number rather than giving advice', () => {
    const line = attentionLine(solid, 'drift')!;

    expect(line).toContain('19 minutes');
    // "Try to avoid distractions" is something people have been told a thousand
    // times. A number about them is not.
    expect(line.toLowerCase()).not.toMatch(/try to|you should|make sure|remember to/);
  });

  test('leads the morning with start latency when it is bad', () => {
    expect(attentionLine(solid, 'morning')).toContain('34 minutes');
  });

  test('falls back to golden hours when starting is not the problem', () => {
    const quickStarter = { ...solid, startLatencyMinutes: 4 };

    expect(attentionLine(quickStarter, 'morning')).toContain('2pm');
  });
});
