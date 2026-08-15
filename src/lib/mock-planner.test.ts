import { describe, test, expect } from 'vitest';
import { mockPlan } from './mock-planner';
import { gradePlan, totalMinutes, isMetaTask, emptyDayPlan } from '@shared/plan';
import type { PlanInput } from '@shared/prompt';

const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  today: '2026-08-12',
  weekday: 'Wednesday',
  goals: [],
  workRhythm: null,
  derailers: null,
  carriedOver: [],
  calendar: [],
  ...over,
});

describe('mockPlan', () => {
  test('produces a plan that passes the same grader as the real model', () => {
    const plan = mockPlan(
      input({ goals: ['ship the beta', 'reply to the landlord', 'get back to the gym'] }),
    );

    expect(gradePlan(plan).filter((v) => v.severity === 'error')).toEqual([]);
  });

  test('never repeats a task stem when two goals match the same rule', () => {
    // Both goals hit the ship/launch rule. Reusing it produced two tasks with an
    // identical opening, which reads as a bug rather than a plan.
    const plan = mockPlan(
      input({ goals: ['ship Sidq to a paying stranger', 'launch the marketing site'] }),
    );

    const stems = plan.tasks.map((t) => t.title.slice(0, 20));

    expect(new Set(stems).size).toBe(stems.length);
  });

  test('does not splice raw goal text into a title', () => {
    const plan = mockPlan(input({ goals: ['ship Sidq to a first paying stranger'] }));

    for (const task of plan.tasks) {
      expect(task.title).not.toContain('sidq');
      expect(task.title.endsWith('…')).toBe(false);
    }
  });

  test('quotes the goal in the why line without mangling its case', () => {
    const plan = mockPlan(input({ goals: ['ship Sidq to a paying stranger'] }));

    expect(plan.tasks[0].why).toContain('Sidq');
  });

  test('clips a very long goal on a word boundary', () => {
    const long = 'finish the enormous quarterly planning document that nobody has read yet at all';
    const plan = mockPlan(input({ goals: [long] }));

    const why = plan.tasks[0].why;
    expect(why).toContain('…');
    // The clip must not land inside a word.
    expect(why).not.toMatch(/\w…\w/);
  });

  test('shrinks a task that has been carried too long instead of reprinting it', () => {
    const plan = mockPlan(
      input({ goals: ['finish the deck'], carriedOver: [{ title: 'Finish the deck', carryCount: 3 }] }),
    );

    expect(plan.tasks[0].title).toContain('15 minutes');
    expect(plan.note).toContain('sitting a while');
  });

  test('brings back recent carryover as-is', () => {
    const plan = mockPlan(
      input({ goals: [], carriedOver: [{ title: 'Email Marcus back', carryCount: 1 }] }),
    );

    expect(plan.tasks[0].title).toBe('Email Marcus back');
  });

  test('terminates and stays in budget with no goals at all', () => {
    const plan = mockPlan(input());

    expect(plan.tasks.length).toBeGreaterThanOrEqual(3);
    expect(totalMinutes(plan)).toBeLessThanOrEqual(240);
  });

  test('stays within the task cap and the minute budget when flooded with goals', () => {
    const plan = mockPlan(
      input({
        goals: Array.from({ length: 20 }, (_, i) => `goal number ${i} that needs doing`),
      }),
    );

    expect(plan.tasks.length).toBeLessThanOrEqual(6);
    expect(totalMinutes(plan)).toBeLessThanOrEqual(240);
    expect(gradePlan(plan).filter((v) => v.severity === 'error')).toEqual([]);
  });

  test('names the top priority as the first task', () => {
    const plan = mockPlan(input({ goals: ['ship the beta', 'go to the gym'] }));

    expect(plan.top_priority).toBe(plan.tasks[0].title);
  });
});

describe('no meta-tasks', () => {
  test('never tells the user to plan instead of planning for them', () => {
    // The product's core failure mode. A task like "Write down the 3 things
    // blocking launch" is the app handing the job back to the person who opened it.
    const plan = mockPlan(
      input({
        goals: ['ship the beta', 'get fit', 'sort out my finances', 'learn german'],
        carriedOver: [{ title: 'Finish the deck', carryCount: 3 }],
      }),
    );

    for (const task of plan.tasks) {
      expect(isMetaTask(task.title), `meta-task leaked: "${task.title}"`).toBe(false);
    }
  });

  test('the emergency fallback day is concrete too', () => {
    const plan = emptyDayPlan();

    for (const task of plan.tasks) {
      expect(isMetaTask(task.title), `meta-task in fallback: "${task.title}"`).toBe(false);
    }
  });

  test('the grader rejects a meta-task as an error', () => {
    const bad = {
      top_priority: 'Write down what matters today',
      tasks: [
        { title: 'Write down what matters today', est_minutes: 25, why: 'x' },
        { title: 'Fix the login bug', est_minutes: 45, why: 'x' },
        { title: 'Email the three leads', est_minutes: 25, why: 'x' },
      ],
      note: 'ok',
    };

    const v = gradePlan(bad).find((x) => x.rule === 'meta-task');

    expect(v?.severity).toBe('error');
  });
});
