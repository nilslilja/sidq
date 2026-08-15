import { describe, test, expect } from 'vitest';
import { rankSessions } from './rank-sessions';
import type { WorkSession } from './work-history';

const NOW = Date.UTC(2026, 7, 15, 9, 0, 0);
const HOUR = 3_600_000;
const MINUTE = 60_000;

function session(over: Partial<WorkSession> = {}): WorkSession {
  return {
    project: '/Users/x/proj',
    projectName: 'proj',
    title: 'Some work',
    lastPrompt: 'carry on',
    branch: 'main',
    endedAt: NOW - HOUR,
    turns: 20,
    activeMinutes: 60,
    ...over,
  };
}

/** One question, no project, no branch, no depth. The thing that must not win. */
function mango(endedAt: number): WorkSession {
  return session({
    projectName: '',
    project: '',
    branch: '',
    title: 'Average colour of mangos in Brazil',
    lastPrompt: 'what is the average colour of mangos in brazil',
    turns: 1,
    activeMinutes: 0.7,
    endedAt,
  });
}

/** Eight hours on a branch. The thing that must win. */
function realWork(endedAt: number): WorkSession {
  return session({
    projectName: 'sidq',
    project: '/Users/x/Sidq',
    branch: 'fix/retry-drops-second-event',
    title: 'Fix the retry that drops the second event',
    turns: 64,
    activeMinutes: 480,
    endedAt,
  });
}

describe('rankSessions', () => {
  test('an eight hour session from yesterday beats a one-line question from minutes ago', () => {
    // Arrange: the exact case that breaks "most recent wins".
    const sessions = [mango(NOW - 10 * MINUTE), realWork(NOW - 20 * HOUR)];

    // Act
    const ranked = rankSessions(sessions, NOW);

    // Assert
    expect(ranked[0].session.branch).toBe('fix/retry-drops-second-event');
  });

  test('drops the throwaway question entirely rather than ranking it second', () => {
    const ranked = rankSessions([mango(NOW - 10 * MINUTE), realWork(NOW - 20 * HOUR)], NOW);

    expect(ranked).toHaveLength(1);
    expect(ranked.every((r) => r.session.turns !== 1)).toBe(true);
  });

  test('a single-turn session scores zero substance however recent it is', () => {
    // Ranked alone so the noise filter is what removes it, not competition.
    expect(rankSessions([mango(NOW - MINUTE)], NOW)).toHaveLength(0);
  });

  test('substantial work stays reachable a week later', () => {
    const ranked = rankSessions([realWork(NOW - 7 * 24 * HOUR)], NOW);

    // The recency floor is the reason this is still here at all.
    expect(ranked).toHaveLength(1);
    expect(ranked[0].score).toBeGreaterThan(0);
  });

  test('between two comparable sessions the more recent one wins', () => {
    const older = realWork(NOW - 30 * HOUR);
    const newer = { ...realWork(NOW - 2 * HOUR), branch: 'feat/newer' };

    const ranked = rankSessions([older, newer], NOW);

    expect(ranked[0].session.branch).toBe('feat/newer');
  });

  test('a long session outranks a short one from the same hour', () => {
    const short = { ...session({ endedAt: NOW - HOUR, activeMinutes: 5, turns: 3 }), branch: 'short' };
    const long = { ...session({ endedAt: NOW - HOUR, activeMinutes: 300, turns: 50 }), branch: 'long' };

    const ranked = rankSessions([short, long], NOW);

    expect(ranked[0].session.branch).toBe('long');
  });

  test('work outside a git repo still ranks when it has real depth', () => {
    const noRepo = session({
      project: '',
      projectName: '',
      branch: '',
      turns: 45,
      activeMinutes: 240,
      endedAt: NOW - HOUR,
    });

    expect(rankSessions([noRepo], NOW)).toHaveLength(1);
  });

  test('sessions from an older extractor still rank instead of vanishing', () => {
    // No turns, no activeMinutes: exactly what a pre-upgrade build recorded.
    const legacy: WorkSession = {
      project: '/Users/x/proj',
      projectName: 'proj',
      title: 'Older session',
      lastPrompt: 'continue',
      branch: 'main',
      endedAt: NOW - 3 * HOUR,
    };

    const ranked = rankSessions([legacy], NOW);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].substance).toBeGreaterThan(0);
  });

  test('explains its ranking in words', () => {
    const ranked = rankSessions([realWork(NOW - 2 * HOUR)], NOW);

    expect(ranked[0].reason).toContain('8h session');
    expect(ranked[0].reason).toContain('fix/retry-drops-second-event');
  });

  test('returns nothing for no sessions rather than throwing', () => {
    expect(rankSessions([], NOW)).toEqual([]);
  });

  test('is ordered strictly best first', () => {
    const sessions = [
      realWork(NOW - 40 * HOUR),
      realWork(NOW - 2 * HOUR),
      session({ turns: 12, activeMinutes: 60, endedAt: NOW - 4 * HOUR }),
    ];

    const scores = rankSessions(sessions, NOW).map((r) => r.score);

    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});
