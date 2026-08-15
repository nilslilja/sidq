import { describe, test, expect } from 'vitest';
import {
  cycleMinutesFor,
  breakMinutesFor,
  adviseBreak,
  assessAlignment,
  decideNudge,
  DEFAULT_CYCLE_MINUTES,
  MAX_CYCLE_MINUTES,
  MIN_CYCLE_MINUTES,
  type ActivitySample,
} from './focus-engine';
import { EMPTY_CALIBRATION, type Calibration } from './calibration';

const calibrated = (over: Partial<Calibration> = {}): Calibration => ({
  ...EMPTY_CALIBRATION,
  confidence: 'high',
  closedDays: 24,
  totalTasks: 90,
  bestDuration: 25,
  ...over,
});

const sample = (app: string, windowTitle: string): ActivitySample => ({
  app,
  windowTitle,
  at: Date.now(),
});

describe('cycle length', () => {
  test('falls back to a defensible default with no personal history', () => {
    expect(cycleMinutesFor(EMPTY_CALIBRATION)).toBe(DEFAULT_CYCLE_MINUTES);
  });

  test('learns a shorter cycle for someone who only finishes short blocks', () => {
    const short = cycleMinutesFor(calibrated({ bestDuration: 15 }));
    const long = cycleMinutesFor(calibrated({ bestDuration: 50 }));

    expect(short).toBeLessThan(long);
  });

  test('never suggests a burst outside the range the evidence supports', () => {
    for (const best of [15, 25, 45, 50, 90]) {
      const c = cycleMinutesFor(calibrated({ bestDuration: best }));
      expect(c).toBeGreaterThanOrEqual(MIN_CYCLE_MINUTES);
      expect(c).toBeLessThanOrEqual(MAX_CYCLE_MINUTES);
    }
  });

  test('break length scales with the burst and stays humane', () => {
    expect(breakMinutesFor(25)).toBeGreaterThanOrEqual(5);
    expect(breakMinutesFor(110)).toBeLessThanOrEqual(20);
    expect(breakMinutesFor(90)).toBeGreaterThan(breakMinutesFor(30));
  });
});

describe('adviseBreak', () => {
  test('stays silent in the middle of a good stretch', () => {
    const advice = adviseBreak({
      focusedMinutes: 20,
      calibration: calibrated(),
      minutesSinceBreak: null,
    });

    expect(advice.urgency).toBe('none');
    expect(advice.message).toBe('');
  });

  test('suggests once past their own measured limit', () => {
    const cycle = cycleMinutesFor(calibrated());

    const advice = adviseBreak({
      focusedMinutes: cycle + 2,
      calibration: calibrated(),
      minutesSinceBreak: null,
    });

    expect(advice.urgency).toBe('suggested');
    expect(advice.message).toContain('minutes');
  });

  test('escalates only well past the limit', () => {
    const cycle = cycleMinutesFor(calibrated());

    const advice = adviseBreak({
      focusedMinutes: Math.round(cycle * 1.8),
      calibration: calibrated(),
      minutesSinceBreak: null,
    });

    expect(advice.urgency).toBe('overdue');
  });

  test('says the advice is generic while it has no history on you', () => {
    const advice = adviseBreak({
      focusedMinutes: 60,
      calibration: EMPTY_CALIBRATION,
      minutesSinceBreak: null,
    });

    expect(advice.reason).toMatch(/typical|until there is enough/i);
  });

  test('never phrases a break as an instruction', () => {
    const advice = adviseBreak({
      focusedMinutes: 200,
      calibration: calibrated(),
      minutesSinceBreak: null,
    });

    expect(advice.message.toLowerCase()).not.toMatch(/you should|you must|take a break now|stop it/);
  });
});

describe('assessAlignment', () => {
  test('recognises the work from the window title', () => {
    const v = assessAlignment(
      sample('Visual Studio Code', 'checkout.tsx - sidq'),
      'Fix the checkout redirect bug',
    );

    expect(v.alignment).toBe('aligned');
    expect(v.matchedTerms).toContain('checkout');
  });

  test('flags an obvious distraction', () => {
    const v = assessAlignment(
      sample('Google Chrome', 'Cheap flights to Lisbon'),
      'Fix the checkout redirect bug',
    );

    expect(v.alignment).toBe('drifting');
  });

  test('does NOT flag YouTube when the task is actually about YouTube', () => {
    // The false positive that gets a tool switched off on day one.
    const v = assessAlignment(
      sample('Google Chrome', 'How to record a screen demo - YouTube'),
      'Record a screen demo of the app',
    );

    expect(v.alignment).toBe('aligned');
  });

  test('returns neutral rather than guessing on an unrelated work app', () => {
    const v = assessAlignment(sample('Slack', 'general - Acme'), 'Fix the checkout redirect bug');

    expect(v.alignment).toBe('neutral');
    expect(v.confidence).toBeLessThan(0.5);
  });

  test('ignores stopwords so common words cannot fake a match', () => {
    const v = assessAlignment(
      sample('Google Chrome', 'The best of the year and more'),
      'Do the thing for my project',
    );

    expect(v.alignment).not.toBe('aligned');
  });
});

describe('decideNudge', () => {
  const base = {
    consecutiveDrifting: 6,
    confidence: 0.8,
    minutesSinceLastNudge: null,
    taskTitle: 'Fix the checkout redirect bug',
  };

  test('speaks after sustained drift', () => {
    const d = decideNudge(base);

    expect(d.shouldNudge).toBe(true);
    expect(d.message).toContain('Fix the checkout redirect bug');
  });

  test('stays quiet on a single glance away', () => {
    expect(decideNudge({ ...base, consecutiveDrifting: 1 }).shouldNudge).toBe(false);
  });

  test('stays quiet when it is not confident', () => {
    expect(decideNudge({ ...base, confidence: 0.4 }).shouldNudge).toBe(false);
  });

  test('respects the cooldown so it cannot nag', () => {
    expect(decideNudge({ ...base, minutesSinceLastNudge: 3 }).shouldNudge).toBe(false);
    expect(decideNudge({ ...base, minutesSinceLastNudge: 30 }).shouldNudge).toBe(true);
  });

  test('names the task, never the distraction', () => {
    const d = decideNudge(base);

    expect(d.message).not.toMatch(/youtube|reddit|wasting|distract/i);
  });
});
