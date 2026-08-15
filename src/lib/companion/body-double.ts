/*
 * Body doubling.
 *
 * Working alongside someone, even silently, even remotely, measurably raises the
 * chance a task gets started and finished. It is the one intervention people with
 * attention problems consistently report as working when nothing else does, and
 * Focusmate has built a business on it alone. But Focusmate costs money, requires
 * scheduling a 50 minute video call with a stranger, and lives in a browser tab.
 *
 * This is the version that costs nothing and asks for nothing: a room code, and
 * two or three other timers ticking on the corner of your screen.
 *
 * ── The privacy floor, which is not negotiable ────────────────────────────────
 * This app reads window titles. Those must never leave the machine, and they
 * certainly must never be broadcast to a room. What goes over the wire is the
 * smallest thing that produces the effect: a name, whether they are working, and
 * for how long. The task title is opt-in per session and off by default, because
 * "Reply to the lawyer about the settlement" is not something to leak to a room
 * because someone once ticked a box in settings.
 *
 * Everything here is pure. The realtime transport lives in presence-channel.ts so
 * this can be tested without a network.
 */

/** Presence goes stale fast, so a closed laptop empties out rather than lying. */
export const STALE_AFTER_SECONDS = 75;
/** Heartbeat interval. Comfortably inside the stale window. */
export const HEARTBEAT_SECONDS = 25;
/** Above this the card is a crowd, not a room, and the effect inverts. */
export const MAX_VISIBLE_PEERS = 5;

export type MemberState = 'working' | 'break' | 'idle';

/** Exactly what crosses the network. Nothing may be added here casually. */
export interface PresencePayload {
  id: string;
  /** First name or handle. Never an email. */
  name: string;
  state: MemberState;
  /** Unix ms the current state began, so elapsed time survives a reconnect. */
  since: number;
  /** Last heartbeat, unix ms. Used only to prune the dead. */
  seenAt: number;
  /** Opt-in per session, absent by default. */
  task?: string;
}

export interface Peer {
  id: string;
  name: string;
  state: MemberState;
  /** Whole minutes in the current state. */
  minutes: number;
  task: string | null;
}

export interface RoomView {
  peers: Peer[];
  /** Peers beyond MAX_VISIBLE_PEERS, shown as a count rather than a list. */
  overflow: number;
  working: number;
  /** One line for the card. Empty string when the room is empty. */
  headline: string;
  /** True when at least one other person is working right now. */
  alive: boolean;
}

/**
 * Build the payload for this machine.
 *
 * `shareTask` is a per-session decision rather than a stored preference, because a
 * setting toggled once in January should not still be broadcasting titles in June.
 */
export function presencePayload(args: {
  id: string;
  name: string;
  state: MemberState;
  since: number;
  now: number;
  task?: string | null;
  shareTask: boolean;
}): PresencePayload {
  const name = args.name.trim() || 'Someone';
  const payload: PresencePayload = {
    id: args.id,
    // Emails leak identity into a room of strangers. Take the local part only.
    name: name.includes('@') ? name.split('@')[0] : name,
    state: args.state,
    since: args.since,
    seenAt: args.now,
  };

  if (args.shareTask && args.task) {
    payload.task = truncate(args.task, 48);
  }

  return payload;
}

/**
 * Turn raw presence into what the card shows.
 *
 * Self is excluded: the point is seeing other people, and your own timer is
 * already six pixels away.
 */
export function deriveRoom(
  members: PresencePayload[],
  selfId: string,
  now: number,
): RoomView {
  const live = members
    .filter((m) => m.id !== selfId)
    .filter((m) => now - m.seenAt <= STALE_AFTER_SECONDS * 1000)
    // Longest-running first: the person an hour deep is the useful one to see.
    .sort((a, b) => a.since - b.since);

  const peers: Peer[] = live.slice(0, MAX_VISIBLE_PEERS).map((m) => ({
    id: m.id,
    name: m.name,
    state: m.state,
    minutes: Math.max(0, Math.floor((now - m.since) / 60_000)),
    task: m.task ?? null,
  }));

  const working = live.filter((m) => m.state === 'working').length;

  return {
    peers,
    overflow: Math.max(0, live.length - MAX_VISIBLE_PEERS),
    working,
    headline: buildHeadline(peers, working, live.length),
    alive: working > 0,
  };
}

/**
 * The line above the list.
 *
 * Names one person rather than reporting a number, because "Sara is 40 minutes in"
 * is a person and "3 online" is a dashboard. Only the count survives past two,
 * where naming everyone turns into noise.
 */
function buildHeadline(peers: Peer[], working: number, total: number): string {
  if (total === 0) return '';
  if (working === 0) return `${total} here, nobody working yet.`;

  const first = peers.find((p) => p.state === 'working');
  if (!first) return `${working} working.`;

  if (working === 1) {
    return first.minutes < 1
      ? `${first.name} just started.`
      : `${first.name} is ${first.minutes} min in.`;
  }

  return `${first.name} and ${working - 1} ${working === 2 ? 'other' : 'others'} working.`;
}

/*
 * Room codes.
 *
 * Read aloud over a call or dropped in a group chat, so: no vowels, which keeps
 * accidental words out, and no 0/O/1/I/L, which are the characters people get
 * wrong every single time.
 */
const CODE_ALPHABET = '23456789BCDFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 6;

export function generateRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

/** Accepts what people actually type: lowercase, spaces, dashes. */
export function normaliseRoomCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length !== CODE_LENGTH) return null;
  if (![...cleaned].every((c) => CODE_ALPHABET.includes(c))) return null;
  return cleaned;
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}
