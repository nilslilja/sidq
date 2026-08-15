import { describe, test, expect } from 'vitest';
import {
  gradeCoachBrief,
  thinDataBrief,
  buildCoachBriefMessage,
  type CoachBrief,
} from '@shared/coach-brief';

const good: CoachBrief = {
  headline: 'Closed 4 of the last 14 days, all 4 before the 9th.',
  whats_changed: [
    'Completion fell from 78% in the week to the 8th to 31% after it.',
    'Nothing has been closed since the 9th, 6 days ago.',
  ],
  worth_asking: [
    'What changed around the 9th for you?',
    'Were the days you skipped different in some way?',
  ],
  going_well: ['The 4 days that were closed finished everything planned.'],
  confidence: 'medium',
  data_note: 'Completion data only. Nothing here reflects what the work was.',
};

describe('gradeCoachBrief', () => {
  test('passes a well-formed brief', () => {
    expect(gradeCoachBrief(good, 14)).toEqual([]);
  });

  test('rejects clinical language, which this tool is not licensed to produce', () => {
    const bad = { ...good, headline: 'Symptoms of executive dysfunction are worsening.' };

    const rules = gradeCoachBrief(bad, 14).map((v) => v.rule);

    expect(rules).toContain('clinical-language');
  });

  test('rejects anything that reads as a diagnosis', () => {
    const bad = { ...good, whats_changed: ['This looks like a medication issue after the 9th.'] };

    expect(gradeCoachBrief(bad, 14).some((v) => v.rule === 'clinical-language')).toBe(true);
  });

  test('rejects judgements of character rather than observations of behaviour', () => {
    const bad = { ...good, headline: 'They seem overwhelmed and are clearly unmotivated.' };

    const rules = gradeCoachBrief(bad, 14).map((v) => v.rule);

    expect(rules).toContain('character-judgement');
  });

  test('rejects claims not anchored to a number, which a coach cannot act on', () => {
    const bad = { ...good, whats_changed: ['Engagement has been inconsistent lately.'] };

    expect(gradeCoachBrief(bad, 14).some((v) => v.rule === 'unanchored-claim')).toBe(true);
  });

  test('rejects prompts that are not actually questions', () => {
    const bad = { ...good, worth_asking: ['Explore what changed around the 9th.'] };

    expect(gradeCoachBrief(bad, 14).some((v) => v.rule === 'not-a-question')).toBe(true);
  });

  test('rejects high confidence built on almost no data', () => {
    const bad = { ...good, confidence: 'high' as const };

    expect(gradeCoachBrief(bad, 5).some((v) => v.rule === 'overconfident')).toBe(true);
  });

  test('allows high confidence once there is enough history', () => {
    const fine = { ...good, confidence: 'high' as const };

    expect(gradeCoachBrief(fine, 25).some((v) => v.rule === 'overconfident')).toBe(false);
  });
});

describe('buildCoachBriefMessage', () => {
  const base = {
    clientLabel: 'Client A',
    windowDays: 14,
    closedDays: 2,
    days: [
      { date: '2026-08-10', planned: 4, completed: 3, plannedMinutes: 110, completedMinutes: 65 },
    ],
    calibration: '',
  };

  test('states plainly when titles were not shared, so the model cannot guess', () => {
    const msg = buildCoachBriefMessage({ ...base, shareScope: 'signals' });

    expect(msg).toContain('NO task titles');
    expect(msg).not.toContain('tasks that keep reappearing');
  });

  test('includes recurring titles only when the client opted in', () => {
    const msg = buildCoachBriefMessage({
      ...base,
      shareScope: 'signals-and-titles',
      recurringTitles: [{ title: 'Draft the thesis intro', timesPlanned: 6, timesCompleted: 1 }],
    });

    expect(msg).toContain('Draft the thesis intro');
    expect(msg).toContain('planned 6x, completed 1x');
  });

  test('never carries a why line or a plan note into the model input', () => {
    const msg = buildCoachBriefMessage({ ...base, shareScope: 'signals-and-titles' });

    expect(msg.toLowerCase()).not.toContain('because you said');
    expect(msg.toLowerCase()).not.toContain('note:');
  });
});

describe('thinDataBrief', () => {
  test('refuses to invent a pattern from nothing', () => {
    const brief = thinDataBrief(0);

    expect(brief.confidence).toBe('low');
    expect(brief.whats_changed).toEqual([]);
    expect(brief.going_well).toEqual([]);
  });

  test('its own output passes the guardrail', () => {
    for (const n of [0, 1, 4]) {
      expect(gradeCoachBrief(thinDataBrief(n), n)).toEqual([]);
    }
  });
});
