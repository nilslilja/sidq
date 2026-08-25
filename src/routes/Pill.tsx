import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { rankSessions } from '@/lib/companion/rank-sessions';
import {
  ANY_SOURCE,
  filterSessions,
  moveSelection,
  sourceOf,
  sourcesIn,
  statusLine,
} from '@/lib/companion/pill';
import { sourceLabel } from '@/lib/companion/sources';
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

/** How long the bar shows what just landed before returning to the count. */
const SAVED_BANNER_MS = 4200;

/**
 * The name a person would use, from the id Sidq records.
 *
 * Kept here rather than sent by Rust because it is presentation: the same
 * mapping decides what the notification says, and a name that differs between
 * the two would read as two different products talking.
 */
function labelFor(source: string): string {
  const names: Record<string, string> = {
    chatgpt: 'ChatGPT',
    'claude.ai': 'Claude',
    gemini: 'Gemini',
    grok: 'Grok',
    deepseek: 'DeepSeek',
  };
  return names[source] ?? 'an AI';
}

export function Pill() {
  const bridge = useMemo(() => desktopBridge(), []);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: 'browsing' });
  // Measured, never announced. Launch shows the bar.
  const [mode, setMode] = useState<PillState>(() => modeForWidth(window.innerWidth));
  const [indexed, setIndexed] = useState(0);
  /** The assistant a conversation just arrived from, while the bar says so. */
  const [saved, setSaved] = useState<string | null>(null);
  /*
   * Bumped whenever the count changes, and used as a React key so the pulse
   * restarts. Re-adding the same class does not replay a CSS animation; a new
   * key remounts the element, which does.
   */
  const [beat, setBeat] = useState(0);
  const [source, setSource] = useState(ANY_SOURCE);
  const [picking, setPicking] = useState(false);
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
  /*
   * Everything from the chosen AI, before the query narrows it.
   *
   * This is what the count reports. `visible` is capped at twelve rows, and
   * reporting that cap once told somebody with twenty-nine conversations that
   * they had five.
   */
  const inSource = useMemo(
    () => (source === ANY_SOURCE ? ranked : ranked.filter((r) => sourceOf(r) === source)),
    [ranked, source],
  );
  const visible = useMemo(() => filterSessions(ranked, query, source), [ranked, query, source]);

  /*
   * The filter, built from the list rather than from the list of AIs we support.
   *
   * Ten fixed options would mean nine dead ones for almost everybody. What is
   * here is what they actually have.
   */
  const tallies = useMemo(() => sourcesIn(ranked), [ranked]);

  /*
   * A source that empties out is not a filter, it is a trap.
   *
   * The list reloads every time the picker opens, and a source with nothing in
   * it any more would leave the picker permanently empty with the reason hidden
   * behind a closed menu.
   */
  useEffect(() => {
    if (source !== ANY_SOURCE && !tallies.some((t) => t.id === source)) setSource(ANY_SOURCE);
  }, [tallies, source]);

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

    const read = () =>
      void bridge.indexStats().then(([count]) =>
        setIndexed((was) => {
          if (count !== was) setBeat((n) => n + 1);
          return count;
        }),
      );
    read();

    /*
     * Polled and announced. The poll is the floor — the count must never be
     * wrong for longer than one interval — and the announcement is what makes a
     * capture show up the moment it lands rather than up to a minute later.
     */
    const timer = setInterval(read, INDEX_POLL_MS);

    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void bridge.onChanged(read).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
      clearInterval(timer);
    };
  }, [bridge, mode]);

  /*
   * ── The banner clears itself ─────────────────────────────────────────────
   *
   * Long enough to be read by somebody whose eyes are elsewhere, short enough
   * that the bar is not lying about the count a minute later. Re-armed on every
   * find, so two arriving together do not leave a stuck label.
   */
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(null), SAVED_BANNER_MS);
    return () => clearTimeout(timer);
  }, [saved]);

  /*
   * ── The tone for a conversation arriving ─────────────────────────────────
   *
   * Deliberately not folded into the effect above, which returns early unless
   * the bar is collapsed. That gate is right for the count — an expanded picker
   * is not showing it — and wrong for this: reading a browser assistant needs
   * that browser in front, so a find can perfectly well land while the picker
   * happens to be open behind it.
   *
   * The pill is the window that is always alive, which is why the sound lives
   * here rather than in the main window somebody may have minimised. The
   * notification is raised by Rust and reaches them either way.
   */
  useEffect(() => {
    if (!bridge) return;

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void bridge
      .onFound((one) => {
        playCue('found');
        setSaved(labelFor(one.source));
      })
      .then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [bridge]);

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
   * Clicking anywhere else closes the picker.
   *
   * It opened on a click and closed only on Esc or ⌘⇧K, which is a
   * keyboard-shaped exit on something people reach for with a mouse. Nobody
   * presses the key, so it sat open over whatever they went back to.
   *
   * The webview's own blur rather than a Tauri window event: the same class of
   * plumbing already failed silently once on this window, and a DOM event that
   * the browser engine raises directly has nothing in between to go wrong.
   * Collapsed the window is non-focusable, so this never fires then.
   */
  useEffect(() => {
    if (mode !== 'expanded') return;

    const away = () => void bridge?.hidePill();
    window.addEventListener('blur', away);
    return () => window.removeEventListener('blur', away);
  }, [bridge, mode]);

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
        resumePoint: target.session.lastPrompt || '',
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
            resumePoint: target.session.lastPrompt || '',
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
    /*
     * While the menu is open it owns the keyboard.
     *
     * Escape shuts the menu rather than the whole picker — closing everything
     * because somebody backed out of a dropdown loses the query they typed to
     * get there. Arrows are swallowed for the same reason: moving the selection
     * behind an open menu changes what Enter does without showing it.
     */
    if (picking) {
      if (e.key === 'Escape' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (e.key === 'Escape') setPicking(false);
        return;
      }
    }

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
    /*
     * ⌘O opens the window.
     *
     * The link in the footer was the only visible route to it from the thing
     * that is always on screen, and it read "Search all history", which names a
     * feature rather than the window. A shortcut is learnable; a small grey
     * link is findable at best.
     */
    if (e.key === 'o' && e.metaKey) {
      e.preventDefault();
      void bridge?.openHome();
      void bridge?.hidePill();
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
        className="flex h-[100dvh] w-full items-center justify-center bg-transparent"
      >
        <button
          onClick={() => void bridge?.expandPill()}
          aria-label="Open Sidq and pick up a conversation"
          className={cn(
            'group flex h-full w-full items-center justify-center gap-2 px-3',
            /*
             * Rounded at the bottom only, and no top border.
             *
             * It sits inside the menu bar now rather than hanging below it,
             * because below the menu bar is where a browser draws its tabs and
             * the old bar covered three of them in every window. The menu bar's
             * middle belongs to nobody, so this covers nothing.
             *
             * Which means it has to read as part of that strip rather than as a
             * card resting on it: no shadow, no ring, and a background close
             * enough to the menu bar's own that the seam disappears.
             */
            'rounded-b-[9px] bg-black/25 backdrop-blur-md',
            'transition-colors duration-150 hover:bg-black/45',
            'cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#B8A6FF]/70',
          )}
        >
          {/*
            * The dot beats when the count changes.
            *
            * The reader captures a conversation every fifteen seconds and said
            * nothing about it, so the one always-visible piece of the product
            * gave no sign it was working. Keyed on the change so the animation
            * replays — re-adding a class does not restart one.
            */}
          <span
            key={beat}
            aria-hidden="true"
            className={cn(
              'size-1.5 shrink-0 rounded-full bg-[#B8A6FF] transition-opacity duration-150',
              'opacity-80 group-hover:opacity-100',
              (beat > 0 || saved) && 'animate-pulse-once',
            )}
          />
          {/*
            * The bar says what just happened, then goes back to the count.
            *
            * This is the only surface Sidq has that is guaranteed to be on
            * screen at the moment a conversation is found: reading a browser
            * assistant needs that browser in front, so the main window is
            * behind something and the notification may be a banner that has
            * already gone. The bar floats above everything, including another
            * app's fullscreen Space.
            *
            * 152 points is not room for a conversation title, so it carries the
            * assistant's name and the notification carries the title.
            */}
          <span
            className={cn(
              'truncate text-[0.6875rem] leading-none transition-colors duration-200',
              saved ? 'text-[#D8CCFF]' : 'text-white/70',
            )}
          >
            {saved ? `Saved · ${saved}` : indexed > 0 ? indexed.toLocaleString() : 'Sidq'}
          </span>
          {/*
            * The shortcut only on hover. At this size it is the difference
            * between a label and a cluttered one, and anybody who has not
            * hovered has not needed it yet.
            */}
          <span className="text-[0.625rem] leading-none text-white/0 transition-colors duration-150 group-hover:text-white/40">
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
          {/*
            * The source filter.
            *
            * Everything arrived in one pile: fifty rows from six different AIs
            * ordered only by when they ended, so finding the ChatGPT thread
            * from this morning meant reading past everything else.
            *
            * Drawn rather than a `<select>`. A native menu on macOS takes the
            * arrow keys as soon as it has focus, and those belong to the list —
            * a picker where Down moves an invisible dropdown selection instead
            * of the highlighted conversation is broken in a way nobody would
            * guess at.
            */}
          {tallies.length > 1 && (
            <div className="relative shrink-0">
              <button
                onClick={() => setPicking((open) => !open)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2 py-1',
                  'text-[0.75rem] transition-colors duration-100',
                  source === ANY_SOURCE
                    ? 'text-white/45 hover:bg-white/[0.06] hover:text-white/75'
                    : 'bg-[#B8A6FF]/15 text-[#B8A6FF]',
                )}
              >
                {source === ANY_SOURCE ? 'All AIs' : sourceLabel(source, true)}
                <svg width="8" height="5" viewBox="0 0 8 5" aria-hidden="true">
                  <path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>

              {picking && (
                <div
                  className={cn(
                    'absolute right-0 top-[calc(100%+6px)] z-20 min-w-[11rem] overflow-hidden',
                    'rounded-[10px] border border-white/[0.09] bg-[#141419] py-1',
                    'shadow-[0_16px_40px_-12px_rgba(0,0,0,0.9)]',
                  )}
                >
                  <SourceRow
                    label="All AIs"
                    count={ranked.length}
                    on={source === ANY_SOURCE}
                    onPick={() => {
                      setSource(ANY_SOURCE);
                      setIndex(0);
                      setPicking(false);
                      inputRef.current?.focus();
                    }}
                  />
                  {tallies.map((t) => (
                    <SourceRow
                      key={t.id}
                      label={t.label}
                      count={t.count}
                      on={source === t.id}
                      onPick={() => {
                        setSource(t.id);
                        setIndex(0);
                        setPicking(false);
                        inputRef.current?.focus();
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <span className="shrink-0 text-[0.6875rem] tabular-nums text-white/30">
            {statusLine(visible.length, inSource.length, query, source)}
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
                  Attach it to any AI. It already tells them to read it and carry
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
            {phase.kind === 'browsing' && '↵ file to attach · ⌘↵ copy · ⌘O the window'}
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
            Open Sidq ›
          </button>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[0.625rem] text-white/25">
            <Key>↑↓</Key>
            <Key>↵</Key>
            <Key>⌘↵</Key>
            {/*
              * Clickable, because the rest of this window is.
              *
              * The picker opened on a click and closed only on a keystroke,
              * which is a keyboard-shaped exit on a thing people reach for with
              * a mouse. Clicking away closes it too, and this is the one that
              * is visible while you are looking for it.
              */}
            <button
              onClick={dismiss}
              aria-label="Close"
              className="cursor-pointer rounded-[5px] bg-white/[0.07] px-1.5 py-0.5 text-white/40 transition-colors duration-100 hover:bg-white/[0.14] hover:text-white/80"
            >
              esc
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * One line of the source menu.
 *
 * The count is the point of it: "ChatGPT 3" tells you whether narrowing to it
 * is worth the click before you make it, which a bare list of names does not.
 */
function SourceRow({
  label,
  count,
  on,
  onPick,
}: {
  label: string;
  count: number;
  on: boolean;
  onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      className={cn(
        'flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left',
        'text-[0.8125rem] transition-colors duration-100',
        on ? 'text-[#B8A6FF]' : 'text-white/70 hover:bg-white/[0.06] hover:text-white',
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 text-[0.75rem] tabular-nums text-white/30">{count}</span>
    </button>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[5px] bg-white/[0.07] px-1.5 py-0.5 text-white/40">{children}</span>
  );
}
