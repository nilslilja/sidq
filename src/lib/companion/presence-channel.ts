import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { HEARTBEAT_SECONDS, type PresencePayload } from './body-double';

/*
 * The transport for body doubling.
 *
 * Supabase Realtime presence rather than a table: presence is ephemeral by nature,
 * so there is nothing to write, nothing to clean up, and nothing left behind when
 * someone shuts the lid. No migration, no RLS policy, no storage cost.
 *
 * ── What a room actually is ───────────────────────────────────────────────────
 * A channel name derived from a six character code. Anyone holding that code and
 * the public anon key can join, so the code IS the secret. That is a deliberate
 * trade: rooms are shared with friends over a chat message, and making them
 * accounts-and-invites would kill the only thing that makes this usable.
 *
 * It is also why body-double.ts keeps the payload down to a name, a state and a
 * timestamp. The threat model assumes a room may contain someone you did not
 * expect, and nothing in the payload should matter if it does.
 */

export interface PresenceHandle {
  update: (payload: PresencePayload) => void;
  leave: () => void;
}

/**
 * Join a room and stay joined.
 *
 * Returns null when no backend is configured, which the caller must treat as
 * "the feature is off" rather than "the room is empty". Presenting an empty room
 * to someone whose peers are actually there is worse than saying it is unavailable.
 */
export function joinRoom(args: {
  code: string;
  self: PresencePayload;
  onChange: (members: PresencePayload[]) => void;
  onError?: (message: string) => void;
}): PresenceHandle | null {
  const supabase = getSupabase();
  if (!supabase) return null;

  const channel: RealtimeChannel = supabase.channel(`room:${args.code}`, {
    config: { presence: { key: args.self.id } },
  });

  const emit = () => args.onChange(readMembers(channel));

  let latest = args.self;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  channel
    .on('presence', { event: 'sync' }, emit)
    .on('presence', { event: 'join' }, emit)
    .on('presence', { event: 'leave' }, emit)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.track(latest);

        // Re-track on a timer so `seenAt` keeps moving. Without this a client that
        // silently drops off the network stays in everyone's room forever, and a
        // room full of ghosts is worse than an empty one.
        heartbeat = setInterval(() => {
          void channel.track({ ...latest, seenAt: Date.now() });
        }, HEARTBEAT_SECONDS * 1000);
        return;
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        args.onError?.('Lost the room. Reconnecting.');
      }
    });

  return {
    update: (payload) => {
      latest = payload;
      void channel.track(payload);
    },
    leave: () => {
      if (heartbeat) clearInterval(heartbeat);
      void channel.untrack();
      void supabase.removeChannel(channel);
    },
  };
}

/**
 * Flatten Supabase's presence state into our own shape.
 *
 * Every field is checked. This is data from other people's machines arriving over
 * a public channel, so it is validated exactly as strictly as any other untrusted
 * input, and anything malformed is dropped rather than rendered.
 */
function readMembers(channel: RealtimeChannel): PresencePayload[] {
  const state = channel.presenceState<Record<string, unknown>>();

  return Object.values(state)
    .flat()
    .map(toPayload)
    .filter((m): m is PresencePayload => m !== null);
}

function toPayload(raw: Record<string, unknown>): PresencePayload | null {
  const { id, name, state, since, seenAt, task } = raw;

  if (typeof id !== 'string' || typeof name !== 'string') return null;
  if (state !== 'working' && state !== 'break' && state !== 'idle') return null;
  if (typeof since !== 'number' || typeof seenAt !== 'number') return null;

  return {
    id,
    name: name.slice(0, 24),
    state,
    since,
    seenAt,
    ...(typeof task === 'string' ? { task: task.slice(0, 48) } : {}),
  };
}
