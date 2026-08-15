import { describe, test, expect } from 'vitest';
import { parsePlan, gradePlan, totalMinutes } from '../supabase/functions/_shared/plan.ts';

const validPlan = {
  top_priority: 'Write the signup success state',
  tasks: [
    { title: 'Write the signup success state', est_minutes: 45, why: 'Last thing blocking beta.' },
    { title: 'Reply to Marcus with two dates', est_minutes: 15, why: 'Costs you nothing.' },
    { title: 'List 10 people who would pay', est_minutes: 25, why: 'Has to start as names.' },
    { title: 'Record a 2 minute demo', est_minutes: 45, why: 'Needed for all 10.' },
  ],
  note: 'Onboarding got shrunk to the one screen actually blocking beta.',
};

describe('parsePlan', () => {
  test('parses clean JSON without reporting a recovery', () => {
    const { plan, recovered, repairs } = parsePlan(JSON.stringify(validPlan));

    expect(plan.tasks).toHaveLength(4);
    expect(plan.top_priority).toBe('Write the signup success state');
    expect(recovered).toBe(false);
    expect(repairs).toEqual([]);
  });

  test('strips markdown fences the model was told not to emit', () => {
    const raw = '```json\n' + JSON.stringify(validPlan) + '\n```';

    const { plan, repairs } = parsePlan(raw);

    expect(plan.tasks).toHaveLength(4);
    expect(repairs).toContain('stripped-wrapper');
  });

  test('strips conversational preamble and trailing prose', () => {
    const raw = `Here's your plan for today:\n\n${JSON.stringify(validPlan)}\n\nLet me know if you want changes.`;

    const { plan, recovered } = parsePlan(raw);

    expect(plan.tasks).toHaveLength(4);
    expect(recovered).toBe(true);
  });

  test('does not stop at a brace inside a string value', () => {
    const withBrace = {
      ...validPlan,
      note: 'Use the {placeholder} syntax in the template.',
    };

    const { plan } = parsePlan(JSON.stringify(withBrace));

    expect(plan.note).toBe('Use the {placeholder} syntax in the template.');
    expect(plan.tasks).toHaveLength(4);
  });

  test('snaps off-spec minutes to the nearest allowed size', () => {
    const raw = JSON.stringify({
      ...validPlan,
      tasks: [
        { title: 'A task', est_minutes: 30, why: '' },
        { title: 'B task', est_minutes: 60, why: '' },
        { title: 'C task', est_minutes: 5, why: '' },
      ],
      top_priority: 'A task',
    });

    const { plan } = parsePlan(raw);

    expect(plan.tasks[0].est_minutes).toBe(25);
    expect(plan.tasks[1].est_minutes).toBe(50);
    expect(plan.tasks[2].est_minutes).toBe(15);
  });

  test('breaks an exact tie upward, since these users underestimate', () => {
    // 35 sits exactly between 25 and 45; 70 exactly between 50 and 90.
    const raw = JSON.stringify({
      top_priority: 'Tie at 35',
      note: '',
      tasks: [
        { title: 'Tie at 35', est_minutes: 35, why: '' },
        { title: 'Tie at 70', est_minutes: 70, why: '' },
        { title: 'Tie at 20', est_minutes: 20, why: '' },
      ],
    });

    const { plan } = parsePlan(raw);

    expect(plan.tasks[0].est_minutes).toBe(45);
    expect(plan.tasks[1].est_minutes).toBe(90);
    expect(plan.tasks[2].est_minutes).toBe(25);
  });

  test('replaces a missing or nonsense duration with a workable default', () => {
    const raw = JSON.stringify({
      top_priority: 'No duration',
      note: '',
      tasks: [
        { title: 'No duration', why: '' },
        { title: 'Negative duration', est_minutes: -10, why: '' },
        { title: 'String duration', est_minutes: '45 minutes', why: '' },
      ],
    });

    const { plan } = parsePlan(raw);

    expect(plan.tasks[0].est_minutes).toBe(25);
    expect(plan.tasks[1].est_minutes).toBe(25);
    expect(plan.tasks[2].est_minutes).toBe(45);
  });

  test('reorders so the named priority is the first row on the board', () => {
    const raw = JSON.stringify({ ...validPlan, top_priority: 'Record a 2 minute demo' });

    const { plan, repairs } = parsePlan(raw);

    expect(plan.tasks[0].title).toBe('Record a 2 minute demo');
    expect(plan.top_priority).toBe('Record a 2 minute demo');
    expect(repairs).toContain('reordered-top-priority');
    expect(plan.tasks).toHaveLength(4);
  });

  test('realigns to tasks[0] when the named priority is not in the list at all', () => {
    const raw = JSON.stringify({ ...validPlan, top_priority: 'Something never listed' });

    const { plan, repairs } = parsePlan(raw);

    expect(plan.top_priority).toBe(plan.tasks[0].title);
    expect(repairs).toContain('realigned-top-priority');
  });

  test('derives a priority when the field is missing', () => {
    const { top_priority, ...withoutPriority } = validPlan;
    void top_priority;

    const { plan, repairs } = parsePlan(JSON.stringify(withoutPriority));

    expect(plan.top_priority).toBe('Write the signup success state');
    expect(repairs).toContain('derived-top-priority');
  });

  test('truncates an over-long list rather than showing a wall', () => {
    const raw = JSON.stringify({
      top_priority: 'Task 1',
      note: '',
      tasks: Array.from({ length: 11 }, (_, i) => ({
        title: `Task ${i + 1}`,
        est_minutes: 25,
        why: '',
      })),
    });

    const { plan, repairs } = parsePlan(raw);

    expect(plan.tasks).toHaveLength(6);
    expect(repairs).toContain('truncated-tasks');
  });

  test('falls back to an ordered list when the model returns prose', () => {
    const raw = [
      'Here is what I would do today:',
      '1. Draft the launch post opening',
      '2. Email the three warm leads',
      '3. Fix the mobile nav overflow',
    ].join('\n');

    const { plan, recovered, repairs } = parsePlan(raw);

    expect(recovered).toBe(true);
    expect(repairs).toContain('prose-fallback');
    expect(plan.tasks.length).toBeGreaterThanOrEqual(3);
    expect(plan.tasks.some((t) => t.title.includes('launch post'))).toBe(true);
  });

  test('returns a usable day rather than throwing on garbage', () => {
    for (const raw of ['', '   ', 'null', '<html>502 Bad Gateway</html>']) {
      const { plan } = parsePlan(raw);

      expect(plan.tasks.length).toBeGreaterThanOrEqual(3);
      expect(plan.top_priority).toBe(plan.tasks[0].title);
    }
  });

  test('drops tasks with empty titles instead of rendering blank rows', () => {
    const raw = JSON.stringify({
      top_priority: 'Real task',
      note: '',
      tasks: [
        { title: 'Real task', est_minutes: 45, why: '' },
        { title: '', est_minutes: 25, why: 'orphan' },
        { title: '   ', est_minutes: 25, why: 'orphan' },
        { title: 'Another real task', est_minutes: 50, why: '' },
      ],
    });

    const { plan } = parsePlan(raw);

    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks.every((t) => t.title.trim().length > 0)).toBe(true);
  });
});

describe('gradePlan', () => {
  test('passes a well-formed plan with no violations', () => {
    expect(gradePlan(validPlan)).toEqual([]);
  });

  test('flags a task list that would cause paralysis', () => {
    const tooMany = {
      ...validPlan,
      tasks: Array.from({ length: 8 }, (_, i) => ({
        title: `Do thing ${i}`,
        est_minutes: 15,
        why: 'x',
      })),
      top_priority: 'Do thing 0',
    };

    expect(gradePlan(tooMany).some((v) => v.rule === 'task-count')).toBe(true);
  });

  test('flags a day that busts the focus budget', () => {
    const overloaded = {
      ...validPlan,
      tasks: [
        { title: 'Big block one', est_minutes: 90, why: 'x' },
        { title: 'Big block two', est_minutes: 90, why: 'x' },
        { title: 'Big block three', est_minutes: 90, why: 'x' },
      ],
      top_priority: 'Big block one',
    };

    expect(totalMinutes(overloaded)).toBe(270);
    expect(gradePlan(overloaded).some((v) => v.rule === 'total-budget')).toBe(true);
  });

  test('flags a day too thin to be worth opening', () => {
    const thin = {
      top_priority: 'Send one email',
      tasks: [
        { title: 'Send one email', est_minutes: 15, why: 'x' },
        { title: 'Tidy the desk', est_minutes: 15, why: 'x' },
        { title: 'Water the plants', est_minutes: 15, why: 'x' },
      ],
      note: 'Light one.',
    };

    expect(gradePlan(thin).some((v) => v.rule === 'total-budget')).toBe(true);
  });

  test('catches the voice regressions the prompt bans', () => {
    const offBrand = {
      ...validPlan,
      note: "Let's crush this productivity journey!",
    };

    const rules = gradePlan(offBrand).map((v) => `${v.rule}:${v.detail}`);

    expect(rules.some((r) => r.includes('crush'))).toBe(true);
    expect(rules.some((r) => r.includes('productivity'))).toBe(true);
    expect(rules.some((r) => r.includes('exclamation'))).toBe(true);
  });

  test('flags duplicate tasks as an error, not a warning', () => {
    const dupes = {
      top_priority: 'Write the post',
      tasks: [
        { title: 'Write the post', est_minutes: 45, why: 'x' },
        { title: 'Write the post', est_minutes: 45, why: 'x' },
        { title: 'Ship the post', est_minutes: 25, why: 'x' },
      ],
      note: 'ok',
    };

    const violation = gradePlan(dupes).find((v) => v.rule === 'duplicate-tasks');

    expect(violation?.severity).toBe('error');
  });

  test('warns when a title reads as a noun instead of an action', () => {
    const nouny = {
      top_priority: 'The launch post',
      tasks: [
        { title: 'The launch post', est_minutes: 45, why: 'x' },
        { title: 'Email the leads', est_minutes: 25, why: 'x' },
        { title: 'Fix the nav', est_minutes: 25, why: 'x' },
      ],
      note: 'ok',
    };

    expect(gradePlan(nouny).some((v) => v.rule === 'title-verb-first')).toBe(true);
  });
});
