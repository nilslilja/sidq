import { describe, test, expect } from 'vitest';
import { scorePlan, completionRateFor, bestBlockSize, revisionBrief, POPULATION_PRIORS } from './prediction';
import { EMPTY_CALIBRATION, type Calibration } from './calibration';

function calibrated(over: Partial<Calibration> = {}): Calibration {
  return {
    ...EMPTY_CALIBRATION,
    confidence: 'high',
    closedDays: 24,
    totalTasks: 90,
    completionRate: 0.6,
    byDuration: [
      { minutes: 15, planned: 20, completed: 18, rate: 0.9, trustworthy: true },
      { minutes: 25, planned: 30, completed: 24, rate: 0.8, trustworthy: true },
      { minutes: 45, planned: 20, completed: 8, rate: 0.4, trustworthy: true },
      { minutes: 50, planned: 0, completed: 0, rate: 0, trustworthy: false },
      { minutes: 90, planned: 20, completed: 2, rate: 0.1, trustworthy: true },
    ],
    bestDuration: 15,
    avoidDurations: [90],
    realisticCapacity: 95,
    typicalPlanned: 190,
    ...over,
  };
}

describe('completionRateFor', () => {
  test('returns the population prior when nothing is known', () => {
    expect(completionRateFor(25, EMPTY_CALIBRATION)).toBe(POPULATION_PRIORS[25]);
  });

  test('shrinks toward the prior when the sample is small', () => {
    // Two out of two is not evidence of a 100% completion rate.
    const thin = calibrated({
      byDuration: [{ minutes: 25, planned: 2, completed: 2, rate: 1, trustworthy: false }],
    });

    const p = completionRateFor(25, thin);

    expect(p).toBeGreaterThan(POPULATION_PRIORS[25]);
    expect(p).toBeLessThan(0.85);
  });

  test('converges on the observed rate once the sample is large', () => {
    const heavy = calibrated({
      byDuration: [{ minutes: 25, planned: 200, completed: 20, rate: 0.1, trustworthy: true }],
    });

    expect(completionRateFor(25, heavy)).toBeLessThan(0.16);
  });

  test('never returns an impossible probability', () => {
    for (const m of [15, 25, 45, 50, 90]) {
      const p = completionRateFor(m, calibrated());
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    }
  });
});

describe('scorePlan', () => {
  test('scores a plan built to the person as strong', () => {
    const plan = [
      { title: 'Send the invoice', estMinutes: 15 },
      { title: 'Fix the redirect bug', estMinutes: 25 },
      { title: 'Reply to the three oldest emails', estMinutes: 15 },
      { title: 'Draft the intro paragraph', estMinutes: 25 },
    ];

    const f = scorePlan(plan, calibrated());

    expect(f.verdict).toBe('strong');
    expect(f.expectedCompletion).toBeGreaterThan(0.7);
  });

  test('scores an overloaded plan of abandoned sizes as likely to fail', () => {
    const plan = [
      { title: 'Write the whole report', estMinutes: 90 },
      { title: 'Rebuild the deck', estMinutes: 90 },
      { title: 'Clear the backlog', estMinutes: 90 },
    ];

    const f = scorePlan(plan, calibrated());

    expect(f.verdict).toBe('likely-to-fail');
    expect(f.risks.some((r) => r.code === 'overloaded')).toBe(true);
    expect(f.risks.some((r) => r.code === 'bad-size')).toBe(true);
  });

  test('expected minutes is lower than planned minutes for a stretched plan', () => {
    const plan = [
      { title: 'Big one', estMinutes: 90 },
      { title: 'Another big one', estMinutes: 90 },
    ];

    const f = scorePlan(plan, calibrated());

    expect(f.plannedMinutes).toBe(180);
    expect(f.expectedMinutes).toBeLessThan(60);
  });

  test('penalises a task the person keeps carrying', () => {
    const fresh = scorePlan([{ title: 'Fix the bug', estMinutes: 25 }], calibrated());
    const dodged = scorePlan(
      [{ title: 'Fix the bug', estMinutes: 25, carryCount: 4 }],
      calibrated(),
    );

    expect(dodged.tasks[0].probability).toBeLessThan(fresh.tasks[0].probability);
    expect(dodged.tasks[0].factors.join(' ')).toMatch(/avoidance/);
  });

  test('later tasks in a day are less likely than the same task placed first', () => {
    const same = { title: 'Fix the bug', estMinutes: 25 };
    const f = scorePlan([same, same, same, same, same], calibrated());

    expect(f.tasks[4].probability).toBeLessThan(f.tasks[0].probability);
  });

  test('applies the phrasing signal in both directions', () => {
    const c = calibrated({ strongOpeners: ['send'], weakOpeners: ['organise'] });

    const strong = scorePlan([{ title: 'Send the invoice', estMinutes: 25 }], c);
    const weak = scorePlan([{ title: 'Organise the archive', estMinutes: 25 }], c);

    expect(strong.tasks[0].probability).toBeGreaterThan(weak.tasks[0].probability);
  });

  test('flags a top priority that is the least likely thing to happen', () => {
    const c = calibrated();
    const plan = [
      { title: 'Write the whole report', estMinutes: 90 },
      { title: 'Send the invoice', estMinutes: 15 },
      { title: 'Reply to Sam', estMinutes: 15 },
    ];

    const f = scorePlan(plan, c);

    expect(f.risks.some((r) => r.code === 'front-loaded')).toBe(true);
  });

  test('marks the forecast as not personalised when there is no history', () => {
    const f = scorePlan([{ title: 'Do the thing', estMinutes: 25 }], EMPTY_CALIBRATION);

    expect(f.personalised).toBe(false);
    // It still scores, using population priors, rather than refusing.
    expect(f.expectedCompletion).toBeGreaterThan(0);
  });

  test('handles an empty plan without dividing by zero', () => {
    const f = scorePlan([], calibrated());

    expect(f.expectedCompletion).toBe(0);
    expect(f.expectedMinutes).toBe(0);
    expect(Number.isNaN(f.expectedCompletion)).toBe(false);
  });
});

describe('bestBlockSize', () => {
  test('picks the size with the best posterior, not the best raw rate', () => {
    // 50 has one lucky success and no real evidence; 15 has twenty observations.
    const c = calibrated({
      byDuration: [
        { minutes: 15, planned: 20, completed: 18, rate: 0.9, trustworthy: true },
        { minutes: 50, planned: 1, completed: 1, rate: 1, trustworthy: false },
      ],
    });

    expect(bestBlockSize(c)).toBe(15);
  });

  test('falls back sensibly with no history at all', () => {
    expect(bestBlockSize(EMPTY_CALIBRATION)).toBe(15);
  });
});

describe('revisionBrief', () => {
  test('is empty when the plan is fine, so no repair call is made', () => {
    const f = scorePlan(
      [
        { title: 'Send the invoice', estMinutes: 15 },
        { title: 'Fix the bug', estMinutes: 25 },
        { title: 'Reply to Sam', estMinutes: 15 },
      ],
      calibrated(),
    );

    expect(revisionBrief(f)).toBe('');
  });

  test('names concrete instructions rather than asking for a retry', () => {
    const f = scorePlan(
      [
        { title: 'Write the whole report', estMinutes: 90 },
        { title: 'Rebuild the deck', estMinutes: 90 },
        { title: 'Clear the backlog', estMinutes: 90 },
      ],
      calibrated(),
    );

    const brief = revisionBrief(f);

    expect(brief).toMatch(/Cut the plan to about 95 minutes/);
    expect(brief).not.toMatch(/try again/i);
  });
});
