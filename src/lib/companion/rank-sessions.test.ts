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

  test('says when you stopped, before anything else', () => {
    /*
     * ── What this replaced ───────────────────────────────────────────────────
     *
     * The line used to lead with whichever fact was biggest and never said
     * when, so four sessions on one project read identically on a real
     * machine: "24h session on main · Sidq" four times over, differing only by
     * a number of hours nobody remembers working.
     *
     * In a picker called "pick up where you stopped", when you stopped is the
     * one thing that cannot be left out.
     *
     * The branch went with it. It was "main" on every row it appeared on,
     * which is a column of the same word pretending to be information.
     */
    const ranked = rankSessions([realWork(NOW - 2 * HOUR)], NOW);

    expect(ranked[0].reason.startsWith('2h ago')).toBe(true);
    expect(ranked[0].reason).toContain('8h');
    expect(ranked[0].reason).not.toContain('fix/retry-drops-second-event');
  });

  test('four sessions on one project are told apart by their day', () => {
    // The real case, from a real index: one title, one project, four days.
    const days = [0, 1, 3, 12].map((d) => realWork(NOW - d * 24 * HOUR - 2 * HOUR));
    const reasons = rankSessions(days, NOW).map((r) => r.reason);

    expect(new Set(reasons).size).toBe(4, 'every row has to be distinguishable');
    expect(reasons.some((r) => r.startsWith('yesterday'))).toBe(true);
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

/*
 * ── The AIs that live in a browser ───────────────────────────────────────────
 *
 * They arrive with turns and nothing else: no project folder, no git branch, no
 * measured duration, because a ChatGPT tab has none of those to give. Scoring
 * the absences as zero buried them under week-old editor sessions, so they were
 * in the picker and nowhere near the top of it — which, from the outside, looks
 * exactly like the feature not working.
 */
describe('a conversation read out of a browser', () => {
  const browser = (over: Partial<WorkSession> = {}): WorkSession =>
    ({
      sessionId: 'https-chatgpt-com-c-1',
      project: '',
      projectName: 'ChatGPT',
      title: 'Pricing questions',
      lastPrompt: '',
      branch: '',
      endedAt: Date.now() - 10 * 60_000,
      turns: 21,
      activeMinutes: 0,
      source: 'chatgpt',
      ...over,
    }) as WorkSession;

  const editor = (over: Partial<WorkSession> = {}): WorkSession =>
    ({
      sessionId: 'abc',
      project: '/Users/x/Sidq',
      projectName: 'Sidq',
      title: 'Refactor',
      lastPrompt: '',
      branch: 'main',
      endedAt: Date.now() - 7 * 24 * 3_600_000,
      turns: 30,
      activeMinutes: 240,
      source: 'claude-code',
      ...over,
    }) as WorkSession;

  test('is not scored zero for the folder and branch it cannot have', () => {
    const [ranked] = rankSessions([browser()]);
    expect(ranked.substance).toBeGreaterThan(0.4);
  });

  test('a real one from ten minutes ago beats a week-old editor session', () => {
    const order = rankSessions([editor(), browser()]).map((r) => r.session.source);
    expect(order[0]).toBe('chatgpt');
  });

  test('one exchange is still nothing to resume, wherever it came from', () => {
    // The mango rule holds, and it drops the row rather than scoring it zero:
    // no amount of recency should surface a single question and answer above
    // real work, and a listed row that nobody should pick is worse than none.
    expect(rankSessions([browser({ turns: 1 })])).toHaveLength(0);
  });

  test('an editor session is not made worse by the change', () => {
    // Renormalising must not quietly demote the sources that report everything.
    const [ranked] = rankSessions([editor({ endedAt: Date.now() })]);
    expect(ranked.substance).toBeGreaterThan(0.7);
  });
});
