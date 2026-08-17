import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { rankSessions } from '@/lib/companion/rank-sessions';
import { filterSessions, moveSelection, statusLine } from '@/lib/companion/pill';
import { playCue } from '@/lib/companion/sound';
import { desktopBridge } from '@/lib/onboarding/bridge';
import type { WorkSession } from '@/lib/companion/work-history';
import { cn } from '@/lib/cn';

/*
 * The pill.
 *
 * The whole product, in one window: press the key, see what you were in the
 * middle of, press Enter, and the entire conversation is on your clipboard.
 *
 * ── What it deliberately is not ──────────────────────────────────────────────
 * There is no timer, no settings, no tabs, no second screen and no empty-state
 * illustration. Every one of those was in the thing this replaces, and each of
 * them is a reason for somebody to look at the window rather than through it.
 * The list is at most five rows because five is a glance and ten is reading.
 *
 * It is invisible until summoned and it closes itself the moment it has done the
 * job. A companion that stays on screen after it has finished is a companion you
 * quit within a week.
 */

/** Long enough to read "Copied", short enough that it never feels like waiting. */
const CLOSE_AFTER_COPY_MS = 900;

/**
 * How long the success card stays up.
 *
 * 900ms was too short to read, which is why a handover that worked looked like
 * nothing had happened. This is long enough to take in a filename.
 */
const CLOSE_AFTER_SAVE_MS = 2600;

type Phase =
  | { kind: 'browsing' }
  | { kind: 'working' }
  | { kind: 'done' }
  | { kind: 'saved'; path: string }
  | { kind: 'failed' };

export function Pill() {
  const bridge = useMemo(() => desktopBridge(), []);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: 'browsing' });
  const inputRef = useRef<HTMLInputElement>(null);

  /*
   * Only sessions with a transcript on disk.
   *
   * Imported ChatGPT and Gemini history has no file to read back, so it cannot
   * be handed over. Listing it anyway would put rows in the picker that do
   * nothing when you press Enter, which is worse than not showing them.
   */
  const ranked = useMemo(
    () => rankSessions(sessions.filter((s) => Boolean(s.sessionId))),
    [sessions],
  );
  const visible = useMemo(() => filterSessions(ranked, query), [ranked, query]);

  /*
   * Clamp rather than reset when the list shrinks under a query.
   *
   * Resetting to the top on every keystroke fights the person: they arrow down
   * to the second item, type one more letter to narrow it, and the selection
   * jumps back to the first.
   */
  const selected = Math.min(index, Math.max(0, visible.length - 1));

  useEffect(() => {
    if (!bridge) return;
    void bridge.recentWork(50).then((rows) => setSessions(rows as WorkSession[]));
  }, [bridge]);

  // Summoned. The window is shown by Rust, so the cue and the focus belong here.
  useEffect(() => {
    playCue('summon');
    inputRef.current?.focus();
  }, []);

  const dismiss = useCallback(() => {
    playCue('dismiss');
    void bridge?.hidePill();
  }, [bridge]);

  /*
   * Enter copies. Cmd+Enter writes a file instead.
   *
   * Pasting a long conversation puts every word into the context window of
   * every turn that follows it. Attaching a file sends it to retrieval instead,
   * which is the only change here that meaningfully lowers what a handover
   * costs, and it does it without dropping a single word.
   */
  const saveFile = useCallback(async () => {
    const target = visible[selected];
    if (!target?.session.sessionId || phase.kind === 'working') return;

    setPhase({ kind: 'working' });
    try {
      const path = await bridge?.saveTranscript({
        sessionId: target.session.sessionId,
        title: target.session.title || 'sidq-conversation',
        source: target.session.source ?? 'claude-code',
        // Where it stopped. The last prompt is sharper than the title: an
        // unanswered question is a better starting instruction than a topic.
        resumePoint: target.session.lastPrompt || target.session.title || '',
        when: target.reason,
        project: target.session.projectName ?? '',
      });
      if (!path) {
        setPhase({ kind: 'failed' });
        return;
      }
      playCue('done');
      setPhase({ kind: 'saved', path });
      setTimeout(() => void bridge?.hidePill(), CLOSE_AFTER_SAVE_MS);
    } catch {
      setPhase({ kind: 'failed' });
    }
  }, [bridge, phase.kind, selected, visible]);

  const handOver = useCallback(async () => {
    const target = visible[selected];
    if (!target || phase.kind === 'working') return;

    setPhase({ kind: 'working' });
    try {
      const id = target.session.sessionId;
      const text = id ? await bridge?.sessionTranscript(id) : null;
      if (!text) {
        setPhase({ kind: 'failed' });
        return;
      }

      await navigator.clipboard.writeText(text);
      playCue('done');
      setPhase({ kind: 'done' });

      // Close itself. Requiring a second keystroke to dismiss the thing that has
      // already finished is the difference between a tool and a window.
      setTimeout(() => void bridge?.hidePill(), CLOSE_AFTER_COPY_MS);
    } catch {
      setPhase({ kind: 'failed' });
    }
  }, [bridge, phase.kind, selected, visible]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex(moveSelection(selected, e.key === 'ArrowDown' ? 1 : -1, visible.length));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      /*
       * Enter writes a file. Cmd+Enter copies.
       *
       * The clipboard was the primary action and it was the wrong one: a paste
       * is something anybody can do with two keystrokes and no Sidq, it costs
       * full context on every following turn, and it cannot be reused. A file
       * carries the instruction with it, attaches to any assistant, and is
       * still there tomorrow.
       */
      if (e.metaKey) void handOver();
      else void saveFile();
    }
  };

  return (
    <div
      // Marks the window as transparent so global.css stops painting a
      // background behind it. Without this the page colour shows as a white
      // border around every edge of the card.
      data-transparent-window
      className="flex h-[100dvh] w-full items-start justify-center bg-transparent p-3"
      onKeyDown={onKeyDown}
    >
      <div
        className={cn(
          'w-full overflow-hidden rounded-[18px]',
          'bg-[#141319]/95 ring-1 ring-inset ring-white/10 backdrop-blur-xl',
          'shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5),0_32px_64px_-24px_rgba(0,0,0,0.6)]',
        )}
      >
        {/* ── Query ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3" data-tauri-drag-region>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            placeholder="Pick up where you stopped"
            spellCheck={false}
            className={cn(
              'min-w-0 flex-1 bg-transparent text-[0.9375rem] text-white',
              'placeholder:text-white/30 focus:outline-none',
            )}
          />
          <span className="shrink-0 text-[0.6875rem] tabular-nums text-white/30">
            {statusLine(visible.length, query)}
          </span>
        </div>

        {/*
         * The success state takes over the card.
         *
         * It used to be one grey line in the footer for 900ms, which is why a
         * handover that had worked perfectly looked like nothing happened. The
         * moment it succeeds is the only moment this window has to prove it did
         * something, so it gets the whole card and long enough to read.
         */}
        {phase.kind === 'saved' && (
          <div className="border-t border-white/[0.07] px-4 py-5">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[#B8A6FF]/20 text-[0.75rem] text-[#B8A6FF]"
              >
                ✓
              </span>
              <div className="min-w-0">
                <p className="text-[0.9375rem] font-medium text-white">
                  Saved to Downloads
                </p>
                <p className="mt-1 truncate text-[0.8125rem] text-white/50">
                  {phase.path.split('/').pop()}
                </p>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-white/40">
                  Attach it to any assistant. It already tells them to read it and carry
                  on rather than summarise it back to you.
                </p>
              </div>
            </div>
          </div>
        )}

        {phase.kind !== 'saved' && visible.length > 0 && <div className="h-px bg-white/[0.07]" />}

        {/* ── Results ───────────────────────────────────────────────────── */}
        {phase.kind !== 'saved' && (
        <ul className="max-h-[17rem] overflow-y-auto">
          {visible.map((row, i) => (
            <li key={row.session.sessionId}>
              <button
                onClick={() => {
                  setIndex(i);
                  void saveFile();
                }}
                onMouseEnter={() => setIndex(i)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100',
                  i === selected ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    i === selected ? 'bg-[#B8A6FF]' : 'bg-white/20',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.875rem] text-white/90">
                    {row.session.title || row.session.lastPrompt}
                  </span>
                  <span className="block truncate text-[0.75rem] text-white/35">
                    {row.reason}
                    {row.session.projectName && ` · ${row.session.projectName}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        )}

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-white/[0.07] px-4 py-2">
          <span className="text-[0.6875rem] text-white/30">
            {phase.kind === 'working' && 'Reading the conversation…'}
            {phase.kind === 'done' && 'Copied. Paste it anywhere.'}
            {phase.kind === 'saved' && 'Ready to attach'}
            {phase.kind === 'failed' && 'Could not read that one.'}
            {phase.kind === 'browsing' && '↵ make a file to attach · ⌘↵ copy instead'}
          </span>
          <span className="flex items-center gap-1.5 text-[0.625rem] text-white/25">
            <Key>↑↓</Key>
            <Key>↵</Key>
            <Key>⌘↵</Key>
            <Key>esc</Key>
          </span>
        </div>
      </div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[5px] bg-white/[0.07] px-1.5 py-0.5 text-white/40">{children}</span>
  );
}
