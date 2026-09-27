import { describe, test, expect } from 'vitest';
import { findResumePoint, projectLabel, titleOf, type WorkSession } from './work-history';

const NOW = new Date(2026, 7, 15, 9, 0, 0).getTime();
const hoursAgo = (h: number) => NOW - h * 3_600_000;

function session(over: Partial<WorkSession> = {}): WorkSession {
  return {
    project: '/Users/x/Sidq',
    projectName: 'Sidq',
    title: 'Stripe webhook retries',
    lastPrompt: 'the retry still drops the second event, can you look',
    branch: 'main',
    endedAt: hoursAgo(14),
    ...over,
  };
}

describe('findResumePoint', () => {
  test('says nothing when there is nothing to resume', () => {
    expect(findResumePoint([], NOW)).toBeNull();
  });

  test('ignores work old enough that the context is gone', () => {
    expect(findResumePoint([session({ endedAt: hoursAgo(100) })], NOW)).toBeNull();
  });

  test('picks the most recent, not the longest', () => {
    const point = findResumePoint(
      [
        session({ title: 'Older but bigger', endedAt: hoursAgo(30) }),
        session({ title: 'Most recent', endedAt: hoursAgo(2) }),
      ],
      NOW,
    );

    expect(point?.session.title).toBe('Most recent');
  });

  test('names the thing, the project and when', () => {
    const point = findResumePoint([session({ endedAt: hoursAgo(14) })], NOW);

    expect(point?.line).toContain('Sidq');
    expect(point?.line).toContain('Stripe webhook retries');
    expect(point?.line).toContain('Earlier today');
  });

  test('describes the gap in words a person would use', () => {
    const gap = (h: number) => findResumePoint([session({ endedAt: hoursAgo(h) })], NOW)?.line ?? '';

    expect(gap(0.5)).toContain('Just now');
    expect(gap(3)).toContain('3h ago');
    expect(gap(30)).toContain('Yesterday');
    expect(gap(60)).toContain('A couple of days ago');
  });

  test('turns the open thread into a task, not the topic', () => {
    // The unanswered question is a sharper restart than the session title.
    const point = findResumePoint([session()], NOW);

    expect(point?.suggestedTask).toContain('Sidq:');
    expect(point?.suggestedTask).toContain('retry still drops');
  });

  test('falls back to the title when there is no open thread', () => {
    const point = findResumePoint([session({ lastPrompt: '' })], NOW);

    expect(point?.suggestedTask).toContain('Stripe webhook retries');
  });

  test('keeps only the first sentence of a rambling prompt', () => {
    const point = findResumePoint(
      [
        session({
          lastPrompt:
            'fix the retry logic. also I was thinking about the pricing page and whether we should ' +
            'restructure the whole thing, and then there is the onboarding which needs work too',
        }),
      ],
      NOW,
    );

    expect(point!.suggestedTask).toContain('fix the retry logic');
    expect(point!.suggestedTask).not.toContain('pricing page');
  });

  test('never emits a runaway line from a very long prompt', () => {
    const point = findResumePoint([session({ lastPrompt: 'x'.repeat(500) })], NOW);

    expect(point!.suggestedTask.length).toBeLessThan(120);
  });

  test('survives a session with no project name', () => {
    const point = findResumePoint([session({ projectName: '' })], NOW);

    expect(point?.line).not.toContain('undefined');
    expect(point?.suggestedTask).not.toContain('undefined');
  });

  test('skips entries carrying neither a title nor a prompt', () => {
    const empty = session({ title: '', lastPrompt: '', endedAt: hoursAgo(1) });
    const real = session({ title: 'Real work', endedAt: hoursAgo(5) });

    expect(findResumePoint([empty, real], NOW)?.session.title).toBe('Real work');
  });
});

/*
 * What a row calls a conversation and its folder, on screen.
 *
 * Seen on a real index on 27 Sep: rows reading "scratch-2026-09-25-3610db"
 * and "Untitled conversation". The first is a folder Claude Code makes for a
 * session with no project, which names nothing a person would recognise; the
 * second threw away the one line that did say what the conversation was.
 */
describe('projectLabel', () => {
  test("hides the throwaway folders Claude Code makes for a session with no project", () => {
    expect(projectLabel('scratch-2026-09-25-3610db')).toBe('');
    expect(projectLabel('scratch-2026-09-14-dec166')).toBe('');
  });

  test('keeps a real project, including one that merely starts with the word', () => {
    expect(projectLabel('Sidq')).toBe('Sidq');
    expect(projectLabel('scratchpad')).toBe('scratchpad');
    expect(projectLabel('scratch-notes')).toBe('scratch-notes');
  });
});

describe('titleOf', () => {
  test('a titled conversation is called by its title', () => {
    expect(titleOf(session())).toBe('Stripe webhook retries');
  });

  test('an untitled one is called by what was last asked in it', () => {
    expect(titleOf(session({ title: '' }))).toBe('the retry still drops the second event, can you look');
  });

  test('a long prompt is cut at a word, not mid-word', () => {
    const long = 'please rewrite the whole onboarding flow so that it has fewer steps and more motion in it';
    const out = titleOf(session({ title: '', lastPrompt: long }));
    expect(out.length).toBeLessThanOrEqual(61);
    expect(out.endsWith('…')).toBe(true);
    expect(long.startsWith(out.slice(0, -1).trimEnd())).toBe(true);
  });

  test('with neither, it still says something', () => {
    expect(titleOf(session({ title: '', lastPrompt: '' }))).toBe('Untitled conversation');
  });
});
