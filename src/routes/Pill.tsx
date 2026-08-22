import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { rankSessions } from '@/lib/companion/rank-sessions';
import { filterSessions, moveSelection, statusLine } from '@/lib/companion/pill';
import { playCue } from '@/lib/companion/sound';
import { desktopBridge } from '@/lib/onboarding/bridge';
import type { PillState } from '@/lib/onboarding/bridge';
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
 * ── Two sizes, one window ───────────────────────────────────────────────────
 * Collapsed it is a bar near the bottom of the screen that is always there.
 * Expanded it is the picker above. Nothing dismisses it: Esc, a finished
 * handover and the link into the window all shrink it back to the bar.
 *
 * It used to vanish after every use, on the reasoning that a companion which
 * stays on screen is one you quit within a week. That was half right. What it
 * actually produced was a product with no surface at all — the only way back in
 * was a keystroke you had to remember from setup, and forgetting it meant Sidq
 * was running and unreachable at the same time.
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

/** The index only moves on a sweep, and a sweep is every 90 seconds. */
const INDEX_POLL_MS = 60_000;

/**
 * Wider than this and Rust has expanded us into the picker.
 *
 * The component works out which of the two it is by measuring its own window,
 * not by being told. Rust used to announce the change and it never arrived:
 * `emit_to` reaches no JS listener at all, and the global `emit` sat behind a
 * chain of `?` where one earlier failure skipped it. Neither raised anything
 * anywhere. Both looked identical on screen — a window at the picker's size
 * still drawing the bar.
 *
 * The width is the fact this actually needs, the DOM reports it changing
 * without being asked, and it is already true by the time any message could
 * have been sent. Kept in step with `EXPANDED_THRESHOLD` in pill_window.rs by a
 * test on the Rust side that reads this file.
 */
const EXPANDED_THRESHOLD = 396;

/** Which of the two sizes the window is currently at. */
function modeForWidth(width: number): PillState {
  return width > EXPANDED_THRESHOLD ? 'expanded' : 'collapsed';
}

type Phase =
  | { kind: 'browsing' }
  | { kind: 'working' }
  | { kind: 'done' }
  | { kind: 'saved'; path: string }
  | { kind: 'limited'; used: number; cap: number }
  | { kind: 'failed' };

export function Pill() {
  const bridge = useMemo(() => desktopBridge(), []);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: 'browsing' });
  // Measured, never announced. Launch shows the bar.
  const [mode, setMode] = useState<PillState>(() => modeForWidth(window.innerWidth));
  const [indexed, setIndexed] = useState(0);
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

  /*
   * Reload every time it opens, not once at launch.
   *
   * The window now outlives every use of it, so a list fetched at startup would
   * still be yesterday's by the afternoon — and the conversation you most want
   * to hand over is almost always the one you just finished.
   */
  useEffect(() => {
    if (!bridge || mode !== 'expanded') return;
    void bridge.recentWork(50).then((rows) => setSessions(rows as WorkSession[]));
  }, [bridge, mode]);

  /*
   * How much it has read, shown on the bar.
   *
   * From the index rather than the picker's list, because the index is the
   * thing that is actually complete: the picker loads the most recent fifty.
   * Polled slowly, since the only thing that moves it is a sweep every 90s.
   */
  useEffect(() => {
    if (!bridge || mode !== 'collapsed') return;

    const read = () => void bridge.indexStats().then(([count]) => setIndexed(count));
    read();
    const timer = setInterval(read, INDEX_POLL_MS);
    return () => clearInterval(timer);
  }, [bridge, mode]);

  /*
   * Follow the window.
   *
   * Rust owns the resize — the shortcut that triggers it is global, and the
   * tray reaches it too — so this cannot be driven from a click handler. It is
   * driven by the resize itself, which is the one signal that is guaranteed to
   * have already happened by the time anyone could react to it.
   */
  useEffect(() => {
    const follow = () => setMode(modeForWidth(window.innerWidth));
    follow();
    window.addEventListener('resize', follow);
    return () => window.removeEventListener('resize', follow);
  }, []);

  /*
   * Opening is the moment worth marking, not mounting.
   *
   * Reset as well as focus: an expanded picker still showing last night's
   * success card, with last night's search still typed into it, is the state
   * this window would otherwise open in every time.
   */
  useEffect(() => {
    if (mode !== 'expanded') return;
    playCue('summon');
    setPhase({ kind: 'browsing' });
    setQuery('');
    setIndex(0);
    inputRef.current?.focus();
  }, [mode]);

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
      const result = await bridge?.saveTranscript({
        sessionId: target.session.sessionId,
        title: target.session.title || 'sidq-conversation',
        source: target.session.source ?? 'claude-code',
        // Where it stopped. The last prompt is sharper than the title: an
        // unanswered question is a better starting instruction than a topic.
        resumePoint: target.session.lastPrompt || target.session.title || '',
        when: target.reason,
        project: target.session.projectName ?? '',
      });

      /*
       * Running out and failing are different, and they say different things.
       *
       * Rust refuses past the weekly limit, so this is the app reporting a
       * decision it already made rather than the page choosing to stop. Telling
       * somebody "could not read that one" when they have simply used the week
       * up sends them to look for a bug that is not there.
       */
      if (result?.limited) {
        setPhase({ kind: 'limited', used: result.used, cap: result.cap ?? result.used });
        return;
      }
      if (!result?.path) {
        setPhase({ kind: 'failed' });
        return;
      }
      playCue('done');
      setPhase({ kind: 'saved', path: result.path });
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
      /*
       * The compiled handover, not the raw transcript.
       *
       * Copying used to send the conversation with no framing at all: no
       * explanation of what it was, who it came from, or what to do with it.
       * A fresh assistant receiving that has a wall of dialogue and no brief,
       * and answers accordingly.
       */
      const id = target.session.sessionId;
      const text = id
        ? await bridge?.handoverText({
            sessionId: id,
            source: target.session.source ?? 'claude-code',
            resumePoint: target.session.lastPrompt || target.session.title || '',
            when: target.reason,
            project: target.session.projectName ?? '',
          })
        : null;
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

  /*
   * The bar.
   *
   * Everything it says is either true or absent: the count comes from the index
   * and simply is not drawn until there is one, rather than sitting at zero
   * while the first sweep runs and reading as an app that found nothing.
   */
  if (mode === 'collapsed') {
    return (
      <div
        data-transparent-window
        className="flex h-[100dvh] w-full items-start justify-center bg-transparent"
      >
        <button
          onClick={() => void bridge?.expandPill()}
          aria-label="Open Sidq and pick up a conversation"
          className={cn(
            'group flex h-full w-full items-center gap-2.5 px-3.5',
            /*
             * Squared at the top, deeply rounded at the bottom.
             *
             * That silhouette is a notch. Hung flush under the menu bar it
             * reads as the hardware continuing downward rather than as a window
             * somebody left open, and on a MacBook it lines up with the real
             * one. It is the whole reason this does not look like every other
             * floating dark capsule.
             */
            'rounded-b-[14px] border-x border-b border-white/[0.08]',
            // Near-black rather than a tinted surface: it has to belong to the
            // bezel it is hanging off, not to the window behind it.
            'bg-[#08080B]/95 backdrop-blur-xl',
            'shadow-[0_10px_24px_-12px_rgba(0,0,0,0.75)]',
            // No scale on hover. Anything that moves it breaks the seam with
            // the menu bar, which is the one thing holding the illusion up.
            'transition-colors duration-150 hover:bg-[#131319]/95',
            'cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#B8A6FF]/70',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'size-1.5 shrink-0 rounded-full bg-[#B8A6FF] transition-opacity duration-150',
              'opacity-60 group-hover:opacity-100',
            )}
          />
          <span className="min-w-0 flex-1 truncate text-left text-[0.6875rem] tracking-wide text-white/50">
            {indexed > 0 ? `${indexed} conversation${indexed === 1 ? '' : 's'}` : 'Sidq'}
          </span>
          <span
            className={cn(
              'shrink-0 rounded-[4px] bg-white/[0.06] px-1.5 py-0.5 text-[0.625rem]',
              'text-white/30 transition-colors duration-150 group-hover:text-white/60',
            )}
          >
            ⌘⇧K
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      // Marks the window as transparent so global.css stops painting a
      // background behind it. Without this the page colour shows as a white
      // border around every edge of the card.
      data-transparent-window
      className="flex h-[100dvh] w-full items-start justify-center bg-transparent"
      onKeyDown={onKeyDown}
    >
      <div
        className={cn(
          // Same silhouette as the lip it grew out of: squared where it meets
          // the menu bar, rounded where it ends. A card that rounded all four
          // corners would detach from the top of the screen and become an
          // ordinary floating panel the moment it opened.
          'w-full overflow-hidden rounded-b-[18px]',
          'border-x border-b border-white/[0.08]',
          'bg-[#0C0C10]/96 backdrop-blur-xl',
          'shadow-[0_24px_64px_-24px_rgba(0,0,0,0.8)]',
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
            {statusLine(visible.length, ranked.length, query)}
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

        {phase.kind === 'limited' && (
          <div className="border-t border-white/[0.07] px-4 py-5">
            <p className="text-[0.9375rem] font-medium text-white">
              That is {phase.cap} handovers this week
            </p>
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-white/45">
              The count rolls, so the oldest one frees up seven days after you made
              it. Pro removes the limit and the seven-day reach on search.
            </p>
            {/*
              * The plans, in a browser, not the app window.
              *
              * This called openHome, which shows search and a source list and
              * no pricing anywhere. The one moment somebody has a reason to pay
              * sent them to a search box.
              */}
            <button
              onClick={() => {
                void bridge?.openUpgrade();
                void bridge?.hidePill();
              }}
              className={cn(
                'mt-3 rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium',
                'bg-[#B8A6FF] text-[#141319] transition-opacity duration-150',
                'cursor-pointer hover:opacity-90',
              )}
            >
              See the plans
            </button>
          </div>
        )}

        {phase.kind !== 'saved' && phase.kind !== 'limited' && visible.length > 0 && (
          <div className="h-px bg-white/[0.07]" />
        )}

        {/* ── Results ───────────────────────────────────────────────────── */}
        {phase.kind !== 'saved' && phase.kind !== 'limited' && (
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
        <div className="flex items-center gap-3 border-t border-white/[0.07] px-4 py-2">
          {/*
            * Status and the way out share the left, in one group.
            *
            * They were three children under `justify-between` with `mr-auto` on
            * the middle one, which clumped the first two together with no gap:
            * "⌘↵ copy insteadSearch all history ›" ran as one string.
            */}
          <span className="min-w-0 truncate text-[0.6875rem] text-white/30">
            {phase.kind === 'working' && 'Reading the conversation…'}
            {phase.kind === 'done' && 'Copied. Paste it anywhere.'}
            {phase.kind === 'saved' && 'Ready to attach'}
            {phase.kind === 'limited' && `${phase.used} of ${phase.cap} used this week`}
            {phase.kind === 'failed' && 'Could not read that one.'}
            {phase.kind === 'browsing' && '↵ file to attach · ⌘↵ copy'}
          </span>
          <button
            onClick={() => {
              void bridge?.openHome();
              void bridge?.hidePill();
            }}
            className={cn(
              'shrink-0 text-[0.6875rem] whitespace-nowrap text-white/30',
              'cursor-pointer transition-colors duration-100 hover:text-white/70',
            )}
          >
            Search all history ›
          </button>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[0.625rem] text-white/25">
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
