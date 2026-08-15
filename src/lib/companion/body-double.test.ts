import { describe, test, expect } from 'vitest';
import {
  deriveRoom,
  presencePayload,
  generateRoomCode,
  normaliseRoomCode,
  STALE_AFTER_SECONDS,
  MAX_VISIBLE_PEERS,
  type PresencePayload,
  type MemberState,
} from './body-double';

const NOW = 1_770_000_000_000;
const minsAgo = (m: number) => NOW - m * 60_000;

function member(
  id: string,
  over: Partial<PresencePayload> = {},
): PresencePayload {
  return {
    id,
    name: id,
    state: 'working' as MemberState,
    since: minsAgo(10),
    seenAt: NOW,
    ...over,
  };
}

describe('presencePayload', () => {
  test('withholds the task title unless it is shared for this session', () => {
    const p = presencePayload({
      id: 'a',
      name: 'Nils',
      state: 'working',
      since: NOW,
      now: NOW,
      task: 'Reply to the lawyer about the settlement',
      shareTask: false,
    });

    expect(p.task).toBeUndefined();
  });

  test('never puts an email address into a room', () => {
    const p = presencePayload({
      id: 'a',
      name: 'nils@example.com',
      state: 'working',
      since: NOW,
      now: NOW,
      shareTask: false,
    });

    expect(p.name).toBe('nils');
    expect(JSON.stringify(p)).not.toContain('@');
  });

  test('carries nothing beyond name, state and timing', () => {
    const p = presencePayload({
      id: 'a',
      name: 'Nils',
      state: 'working',
      since: NOW,
      now: NOW,
      shareTask: false,
    });

    // A window title or app name reaching this object is the failure this guards.
    expect(Object.keys(p).sort()).toEqual(['id', 'name', 'seenAt', 'since', 'state']);
  });

  test('truncates a shared task rather than broadcasting a paragraph', () => {
    const p = presencePayload({
      id: 'a',
      name: 'Nils',
      state: 'working',
      since: NOW,
      now: NOW,
      task: 'x'.repeat(200),
      shareTask: true,
    });

    expect(p.task!.length).toBeLessThanOrEqual(48);
  });

  test('falls back to a placeholder rather than an empty name', () => {
    const p = presencePayload({
      id: 'a',
      name: '   ',
      state: 'idle',
      since: NOW,
      now: NOW,
      shareTask: false,
    });

    expect(p.name).toBe('Someone');
  });
});

describe('deriveRoom', () => {
  test('excludes you from your own room', () => {
    const view = deriveRoom([member('me'), member('sara')], 'me', NOW);

    expect(view.peers.map((p) => p.id)).toEqual(['sara']);
  });

  test('drops members whose machine stopped reporting', () => {
    const gone = member('gone', { seenAt: NOW - (STALE_AFTER_SECONDS + 5) * 1000 });

    const view = deriveRoom([gone, member('sara')], 'me', NOW);

    expect(view.peers.map((p) => p.id)).toEqual(['sara']);
    expect(view.working).toBe(1);
  });

  test('puts the person who has been at it longest first', () => {
    const view = deriveRoom(
      [
        member('new', { since: minsAgo(2) }),
        member('deep', { since: minsAgo(70) }),
        member('mid', { since: minsAgo(20) }),
      ],
      'me',
      NOW,
    );

    expect(view.peers.map((p) => p.id)).toEqual(['deep', 'mid', 'new']);
    expect(view.peers[0].minutes).toBe(70);
  });

  test('caps the list and reports the rest as a count', () => {
    const many = Array.from({ length: MAX_VISIBLE_PEERS + 3 }, (_, i) =>
      member(`p${i}`, { since: minsAgo(i + 1) }),
    );

    const view = deriveRoom(many, 'me', NOW);

    expect(view.peers).toHaveLength(MAX_VISIBLE_PEERS);
    expect(view.overflow).toBe(3);
  });

  test('is not alive when everyone present is on a break', () => {
    const view = deriveRoom(
      [member('a', { state: 'break' }), member('b', { state: 'idle' })],
      'me',
      NOW,
    );

    expect(view.alive).toBe(false);
    expect(view.working).toBe(0);
    expect(view.headline).toBe('2 here, nobody working yet.');
  });

  test('names the person rather than reporting a number when there is one', () => {
    const view = deriveRoom([member('Sara', { since: minsAgo(40) })], 'me', NOW);

    expect(view.headline).toBe('Sara is 40 min in.');
  });

  test('says just started rather than 0 min in', () => {
    const view = deriveRoom([member('Sara', { since: NOW - 5_000 })], 'me', NOW);

    expect(view.headline).toBe('Sara just started.');
  });

  test('switches to a count once naming everyone would be noise', () => {
    const view = deriveRoom(
      [
        member('Sara', { since: minsAgo(30) }),
        member('Tom', { since: minsAgo(10) }),
        member('Ada', { since: minsAgo(5) }),
      ],
      'me',
      NOW,
    );

    expect(view.headline).toBe('Sara and 2 others working.');
  });

  test('says nothing at all in an empty room', () => {
    const view = deriveRoom([member('me')], 'me', NOW);

    expect(view.headline).toBe('');
    expect(view.alive).toBe(false);
  });

  test('never reports negative time when a clock is skewed ahead', () => {
    const view = deriveRoom([member('sara', { since: NOW + 60_000 })], 'me', NOW);

    expect(view.peers[0].minutes).toBe(0);
  });
});

describe('room codes', () => {
  test('avoids characters people mishear or mistype', () => {
    const random = () => 0.999999;
    for (let i = 0; i < 50; i++) {
      expect(generateRoomCode()).not.toMatch(/[AEIOU01L]/);
    }
    expect(generateRoomCode(random)).toHaveLength(6);
  });

  test('accepts what people actually type', () => {
    expect(normaliseRoomCode('  bc2-3fg ')).toBe('BC23FG');
  });

  test('rejects a code that is the wrong length or has excluded letters', () => {
    expect(normaliseRoomCode('BC23F')).toBeNull();
    expect(normaliseRoomCode('BC23FGH')).toBeNull();
    expect(normaliseRoomCode('BCA3FG')).toBeNull();
  });
});
