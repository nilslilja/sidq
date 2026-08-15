import { useState } from 'react';
import { Users, Copy, Check, LogOut } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { BodyDouble as BodyDoubleState } from '@/lib/companion/use-body-double';

/*
 * The room, on the card.
 *
 * Deliberately not a list of avatars. Faces and profile photos turn this into a
 * social feed, and a social feed is the thing being escaped. What is shown is the
 * minimum that produces the accountability effect: a name and a running clock.
 */

export function BodyDouble({ state, onClose }: { state: BodyDoubleState; onClose: () => void }) {
  const [entry, setEntry] = useState('');
  const [copied, setCopied] = useState(false);

  if (!state.available) {
    return (
      <Panel onClose={onClose}>
        <p className="text-[0.75rem] leading-relaxed text-white/60">
          Working alongside someone needs an account, because there has to be a room to
          be in. Everything else on this card works without one.
        </p>
      </Panel>
    );
  }

  if (!state.code) {
    return (
      <Panel onClose={onClose}>
        <p className="text-[0.75rem] leading-relaxed text-white/60">
          Start a room and send the code to someone. You will see their timer, they
          will see yours. Nothing else is shared.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (state.join(entry)) setEntry('');
          }}
          className="mt-2.5 flex gap-1.5"
        >
          <input
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            placeholder="Room code"
            data-tauri-drag-region={false}
            className={cn(
              'min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5',
              'text-[0.75rem] uppercase tracking-[0.14em] text-white placeholder:normal-case',
              'placeholder:tracking-normal placeholder:text-white/35',
              'outline-none focus:border-white/25',
            )}
          />
          <button
            type="submit"
            className="rounded-md bg-white/[0.09] px-3 text-[0.6875rem] text-white/80 transition-colors duration-150 hover:bg-white/[0.16] hover:text-white"
          >
            Join
          </button>
        </form>

        <button
          onClick={() => state.create()}
          className="mt-2 text-[0.6875rem] uppercase tracking-[0.16em] text-white/45 transition-colors duration-150 hover:text-white"
        >
          Or start one
        </button>

        {state.error && <p className="mt-2 text-[0.6875rem] text-[#FFB4A2]">{state.error}</p>}
      </Panel>
    );
  }

  return (
    <Panel onClose={onClose}>
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(state.code!);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }}
          className="flex items-center gap-1.5 rounded-md bg-white/[0.07] px-2 py-1 text-[0.75rem] tracking-[0.2em] text-white transition-colors duration-150 hover:bg-white/[0.14]"
          aria-label="Copy the room code"
        >
          {state.code}
          {copied ? <Check className="size-3" /> : <Copy className="size-3 opacity-60" />}
        </button>

        <button
          onClick={state.leave}
          aria-label="Leave the room"
          className="ml-auto grid size-6 place-items-center rounded-md text-white/40 transition-colors duration-150 hover:bg-white/10 hover:text-white"
        >
          <LogOut className="size-3" />
        </button>
      </div>

      {!state.name && (
        <input
          defaultValue=""
          onBlur={(e) => state.setName(e.target.value)}
          placeholder="Your first name"
          data-tauri-drag-region={false}
          className={cn(
            'mt-2 w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5',
            'text-[0.75rem] text-white placeholder:text-white/35',
            'outline-none focus:border-white/25',
          )}
        />
      )}

      {state.room.peers.length === 0 ? (
        <p className="mt-2.5 text-[0.75rem] leading-relaxed text-white/50">
          Nobody else here yet. The room stays open.
        </p>
      ) : (
        <ul className="mt-2.5 space-y-1.5">
          {state.room.peers.map((peer) => (
            <li key={peer.id} className="flex items-center gap-2 text-[0.75rem]">
              <span
                aria-hidden="true"
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  peer.state === 'working'
                    ? 'bg-[#A9E5C3]'
                    : peer.state === 'break'
                      ? 'bg-white/40'
                      : 'bg-white/20',
                )}
              />
              <span className="truncate text-white/85">{peer.name}</span>
              {peer.task && <span className="truncate text-white/35">{peer.task}</span>}
              <span className="tabular ml-auto shrink-0 tabular-nums text-white/50">
                {peer.state === 'working' ? `${peer.minutes}m` : 'break'}
              </span>
            </li>
          ))}
          {state.room.overflow > 0 && (
            <li className="text-[0.6875rem] text-white/35">
              and {state.room.overflow} more
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}

function Panel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <section className="mt-3 border-t border-white/10 pt-3">
      <div className="mb-2 flex items-center gap-1.5 text-[0.625rem] uppercase tracking-[0.18em] text-white/40">
        <Users className="size-3" />
        Working together
        <button
          onClick={onClose}
          className="ml-auto tracking-[0.16em] transition-colors duration-150 hover:text-white"
        >
          Close
        </button>
      </div>
      {children}
    </section>
  );
}
