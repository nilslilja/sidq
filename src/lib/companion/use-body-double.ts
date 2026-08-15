import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isBackendConfigured } from '@/lib/env';
import {
  deriveRoom,
  presencePayload,
  normaliseRoomCode,
  generateRoomCode,
  type MemberState,
  type PresencePayload,
  type RoomView,
} from './body-double';
import { joinRoom, type PresenceHandle } from './presence-channel';

/*
 * The React side of body doubling.
 *
 * Holds the channel, keeps the room view ticking, and remembers the last room so
 * rejoining tomorrow is one click. All the logic worth testing lives in
 * body-double.ts; this is wiring.
 */

const ROOM_KEY = 'sidq.room';
const NAME_KEY = 'sidq.room.name';
/** Elapsed minutes are re-derived on this beat so peers' timers actually move. */
const VIEW_TICK_MS = 15_000;

export interface BodyDouble {
  available: boolean;
  code: string | null;
  name: string;
  setName: (name: string) => void;
  room: RoomView;
  error: string | null;
  join: (code: string) => boolean;
  create: () => string;
  leave: () => void;
}

const EMPTY_ROOM: RoomView = {
  peers: [],
  overflow: 0,
  working: 0,
  headline: '',
  alive: false,
};

export function useBodyDouble(args: {
  state: MemberState;
  /** Unix ms the current state began. */
  since: number;
  task: string | null;
  shareTask: boolean;
}): BodyDouble {
  const [code, setCode] = useState<string | null>(() => read(ROOM_KEY));
  const [name, setNameState] = useState(() => read(NAME_KEY) ?? '');
  const [members, setMembers] = useState<PresencePayload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  const handle = useRef<PresenceHandle | null>(null);
  // A stable id per install so a reconnect does not appear as a second person.
  const selfId = useMemo(() => stableId(), []);

  const payload = useMemo(
    () =>
      presencePayload({
        id: selfId,
        name,
        state: args.state,
        since: args.since,
        now: Date.now(),
        task: args.task,
        shareTask: args.shareTask,
      }),
    [selfId, name, args.state, args.since, args.task, args.shareTask],
  );

  // Latest payload without making it a dependency of the join effect, which would
  // tear down and rebuild the channel every time the timer state changed.
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  useEffect(() => {
    if (!code) {
      setMembers([]);
      return;
    }

    const h = joinRoom({
      code,
      self: payloadRef.current,
      onChange: setMembers,
      onError: setError,
    });

    if (!h) {
      setError('Rooms need an account. Sign in once and this works.');
      return;
    }

    handle.current = h;
    setError(null);
    return () => {
      h.leave();
      handle.current = null;
    };
  }, [code]);

  // Push our own state up whenever it changes, without rejoining.
  useEffect(() => {
    handle.current?.update(payload);
  }, [payload]);

  // Peers' elapsed minutes are computed from `since`, so the view needs a beat of
  // its own or a room of people would appear frozen at the minute they joined.
  useEffect(() => {
    if (!code) return;
    const id = window.setInterval(() => forceTick((n) => n + 1), VIEW_TICK_MS);
    return () => window.clearInterval(id);
  }, [code]);

  const room = code ? deriveRoom(members, selfId, Date.now()) : EMPTY_ROOM;

  const join = useCallback((raw: string) => {
    const normalised = normaliseRoomCode(raw);
    if (!normalised) {
      setError('Six characters, no vowels. Check the code.');
      return false;
    }
    write(ROOM_KEY, normalised);
    setCode(normalised);
    return true;
  }, []);

  const create = useCallback(() => {
    const fresh = generateRoomCode();
    write(ROOM_KEY, fresh);
    setCode(fresh);
    return fresh;
  }, []);

  const leave = useCallback(() => {
    write(ROOM_KEY, null);
    setCode(null);
    setMembers([]);
    setError(null);
  }, []);

  const setName = useCallback((next: string) => {
    write(NAME_KEY, next);
    setNameState(next);
  }, []);

  return {
    available: isBackendConfigured,
    code,
    name,
    setName,
    room,
    error,
    join,
    create,
    leave,
  };
}

function stableId(): string {
  const existing = read('sidq.room.id');
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  write('sidq.room.id', fresh);
  return fresh;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode; the room simply will not be remembered */
  }
}
