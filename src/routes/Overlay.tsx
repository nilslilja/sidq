import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pause,
  Play,
  Coffee,
  Volume2,
  VolumeX,
  CornerDownLeft,
  Inbox,
  History,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatClock } from '@/lib/date';
import { matchAnswer, FALLBACK_REPLY } from '@/lib/companion/answers';
import { createSpeaker, DEFAULT_VOICE_SETTINGS, type VoiceSettings } from '@/lib/companion/voice';
import { useOverlaySession } from '@/lib/companion/use-overlay-session';
import { attentionLine } from '@/lib/companion/attention';
import { buildFirstPlan } from '@/lib/onboarding/first-plan';
import { findResumePoint, type ResumePoint, type WorkSession } from '@/lib/companion/work-history';
import { loadImported } from '@/lib/companion/import-history';
import { DayReplay } from '@/components/companion/DayReplay';
import { RescueDay } from '@/components/companion/RescueDay';
import { TodayPlan } from '@/components/companion/TodayPlan';
import { saveOverlayDay } from '@/lib/companion/overlay-data';
import {
  adviseBreak,
  assessAlignment,
  decideNudge,
  DEFAULT_NUDGE_POLICY,
  type ActivitySample,
} from '@/lib/focus-engine';
import type { Task } from '@/types/domain';

/*
 * The desktop companion card.
 *
 * Deliberately dark, unlike the rest of the product. This floats over arbitrary
 * other applications, so it cannot be translucent to whatever is behind it: light
 * glass over a light editor is invisible, and an overlay you cannot read is worse
 * than no overlay. It carries its own surface.
 *
 * Everything about it is built to be ignorable. One line of text, no chrome, no
 * badge, no notification dot. It speaks when the focus engine says to and is
 * otherwise a small dark rectangle that does not move.
 */

interface TauriBridge {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  listen: (event: string, cb: (e: { payload: unknown }) => void) => Promise<() => void>;
}

/** Null in a normal browser tab, which is how this is developed and tested. */
function bridge(): TauriBridge | null {
  const w = window as unknown as {
    __TAURI__?: {
      core?: { invoke: TauriBridge['invoke'] };
      event?: { listen: TauriBridge['listen'] };
    };
  };
  const core = w.__TAURI__?.core;
  const event = w.__TAURI__?.event;
  if (!core || !event) return null;
  return { invoke: core.invoke, listen: event.listen };
}

/** Rust sends snake_case; the app speaks camelCase. Mapped at the boundary. */
interface RawWorkSession {
  project: string;
  project_name: string;
  title: string;
  last_prompt: string;
  branch: string;
  ended_at: number;
}

interface ActivityPayload {
  app: string;
  window_title: string;
  has_permission: boolean;
}

const TICK_MS = 1000;
/** Must match the poll interval in src-tauri/src/main.rs, or replay durations lie. */
const ACTIVITY_POLL_SECONDS = 5;

/** One panel open at a time. Two stacked panels make the card a window. */
type Panel = 'plan' | 'replay' | null;

/** Default too, so App can lazy-import it and keep it out of the landing chunk. */
export default function Overlay() {
  const tauri = useMemo(bridge, []);

  const session = useOverlaySession(ACTIVITY_POLL_SECONDS);
  const { data, record } = session;

  /*
   * The one thing to be doing right now.
   *
   * The fallback is a label rather than an invented task: a made-up title would
   * be nudged against, and being told to get back to work you never agreed to is
   * how an overlay gets dragged to the trash.
   *
   * But a label alone was a dead end. "No plan yet today" told people the card
   * was broken, because nothing on it could fix that. The empty state now
   * carries the action that resolves it.
   */
  const nextTask =
    data.today?.tasks.find((t) => t.status === 'active') ??
    data.today?.tasks.find((t) => t.status === 'pending') ??
    null;

  const hasPlan = Boolean(nextTask);
  const task = nextTask?.title ?? 'No plan yet today';
  const dayTasks = data.today?.tasks ?? [];
  const doneCount = dayTasks.filter((t) => t.status === 'completed').length;
  const remaining = dayTasks.filter(
    (t) => t.status === 'pending' || t.status === 'active',
  ).length;
  const calibration = data.calibration;

  /*
   * The measured line, shown rather than only spoken.
   *
   * The switch-cost number is the most interesting thing this product knows and
   * it only ever appeared as a spoken nudge, which means anyone with sound off
   * never saw it at all. It sits on the card the moment it is real.
   */
  const measured = attentionLine(session.attention, 'drift');

  /*
   * Where you stopped last time.
   *
   * Read once on mount, on a blocking thread in Rust, from Claude Code's own
   * transcripts. Only a title, a last prompt, a project and a branch come back;
   * nothing else is extracted and nothing is uploaded.
   *
   * This is the line the whole product is actually for. Deciding what to do is
   * a solved problem with a hundred competitors; remembering what "halfway
   * through" meant is not, and it is the thing that stops a day before it starts.
   */
  const [resume, setResume] = useState<ResumePoint | null>(null);
  const [resumeDismissed, setResumeDismissed] = useState(false);
  /*
   * Imported ChatGPT and Gemini history, held in state so a fresh drop updates
   * the resume line without a reload.
   */
  const [liveSessions, setLiveSessions] = useState<WorkSession[]>([]);

  useEffect(() => {
    if (!tauri) return;
    void tauri
      .invoke('recent_work', { limit: 20 })
      .then((raw) => {
        setLiveSessions(
          (raw as RawWorkSession[]).map((s) => ({
            project: s.project,
            projectName: s.project_name,
            title: s.title,
            lastPrompt: s.last_prompt,
            branch: s.branch,
            endedAt: s.ended_at,
          })),
        );
      })
      // No Claude Code installed, or no permission to read it. Not an error,
      // just a product with one fewer source.
      .catch(() => undefined);
  }, [tauri]);

  /*
   * The whole picture, across every assistant.
   *
   * This is the thing no vendor can do: ChatGPT cannot see what you asked
   * Claude, and Gemini cannot see either. Merging them here and picking the
   * single most recent is the entire point of reading three sources.
   */
  /*
   * Anything imported during setup still counts.
   *
   * Read once rather than held in state: the card no longer offers the import
   * itself, so this can only change in onboarding, and re-reading it on every
   * render would be work for an event that cannot happen while the card is up.
   */
  const imported = useMemo(() => loadImported(), []);

  useEffect(() => {
    setResume(findResumePoint([...liveSessions, ...imported]));
  }, [liveSessions, imported]);

  // Building the day from the card, so the empty state is not a dead end.
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  const buildToday = useCallback(async () => {
    setBuilding(true);
    setBuildError(null);
    try {
      await buildFirstPlan({ focus: [], blockers: [], rhythm: null });
      session.refresh();
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : 'Could not build a plan.');
    } finally {
      setBuilding(false);
    }
  }, [session]);

  /*
   * Editing the plan from the card.
   *
   * Whole-day writes through the same store the web app uses, then a refresh so
   * the card reflects what was actually saved rather than what it hoped.
   */
  const updateTask = useCallback(
    async (taskId: string, change: (task: Task) => Task) => {
      const today = data.today;
      if (!today) return;

      await saveOverlayDay({
        ...today,
        tasks: today.tasks.map((t) => (t.id === taskId ? change(t) : t)),
      });
      session.refresh();
    },
    [data.today, session],
  );

  const toggleTask = useCallback(
    (taskId: string) =>
      void updateTask(taskId, (t) => ({
        ...t,
        status: t.status === 'completed' ? 'pending' : 'completed',
        completedAt: t.status === 'completed' ? null : new Date().toISOString(),
      })),
    [updateTask],
  );

  const focusTask = useCallback(
    (taskId: string) =>
      void updateTask(taskId, (t) => ({ ...t, status: 'active' })),
    [updateTask],
  );

  const [running, setRunning] = useState(true);
  const [focusedSeconds, setFocusedSeconds] = useState(0);
  const [activity, setActivity] = useState<ActivityPayload | null>(null);
  const [nudge, setNudge] = useState<string | null>(null);
  const [onBreak, setOnBreak] = useState(false);

  const driftRun = useRef(0);
  const lastNudgeAt = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  /*
   * Make the document itself transparent.
   *
   * The window is declared transparent in tauri.conf.json, but html and body still
   * paint the app's paper background on top of it, which is the white box the card
   * was sitting in. Scoped to this route so the web app is untouched.
   */
  useEffect(() => {
    const html = document.documentElement;
    const prevHtml = html.style.background;
    const prevBody = document.body.style.background;
    html.style.background = 'transparent';
    document.body.style.background = 'transparent';
    return () => {
      html.style.background = prevHtml;
      document.body.style.background = prevBody;
    };
  }, []);

  /*
   * Grow and shrink the window to fit the card.
   *
   * Without this the window stays at its declared height, so opening the ask box
   * either clips the content or leaves dead space below it. Measuring the card and
   * telling Rust is the only way the OS window can track content it does not know
   * about.
   */
  useEffect(() => {
    const node = cardRef.current;
    if (!node || !tauri) return;

    const observer = new ResizeObserver(() => {
      // getBoundingClientRect, NOT entry.contentRect. contentRect is the content
      // box and excludes the card's own padding and border, so measuring it told
      // the window to be ~28px shorter than the card actually is, which is exactly
      // the slice that was getting cut off the bottom.
      const rect = node.getBoundingClientRect();
      // +8 for the 4px wrapper padding on each side, which keeps the rounded
      // corners and the shadow inside the window instead of clipped at the edge.
      const height = Math.ceil(rect.height) + 8;
      void tauri.invoke('resize_overlay', { height }).catch(() => {
        /* window gone mid-resize; nothing useful to do */
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [tauri]);

  /*
   * Arrow keys nudge the card, while it has focus.
   *
   * Local, not global, and that distinction is the whole point. A GLOBAL ⌘+arrow
   * would hijack "move to end of line" in every text field on the system. A
   * local one only fires while this card has focus, which is precisely when you
   * are not typing anywhere else, so it collides with nothing.
   *
   * Both work: bare arrows, and ⌘+arrows for anyone who reached for that first.
   */
  useEffect(() => {
    if (!tauri) return;

    const STEP = 24;
    const FINE = 4;

    const onKeyDown = (e: KeyboardEvent) => {
      // Never while typing into capture or the ask box.
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.isContentEditable) return;

      const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
        e.key
      ];
      if (!delta) return;

      e.preventDefault();
      // Hold shift for precision, the way every design tool works. ⌘ jumps
      // further, since anyone holding it is repositioning rather than nudging.
      const size = e.shiftKey ? FINE : e.metaKey ? STEP * 4 : STEP;
      void tauri
        .invoke('move_overlay', { dx: delta[0] * size, dy: delta[1] * size })
        .catch(() => undefined);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tauri]);

  const [voice, setVoice] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  // One speaker for the lifetime of the card, so voice loading happens once.
  const speaker = useMemo(() => createSpeaker(() => voiceRef.current), []);

  const [panel, setPanel] = useState<Panel>(null);
  const togglePanel = (next: Exclude<Panel, null>) =>
    setPanel((current) => (current === next ? null : next));

  // Always on. The nudge policy itself is what keeps it quiet, not a switch.
  const nudgesEnabled = true;
  const [firstRun, setFirstRun] = useState(() => {
    try {
      return localStorage.getItem('sidq.companion.seen') !== '1';
    } catch {
      return false;
    }
  });

  // Quick capture. Separate from the ask box: this never answers, it only catches.
  const [capturing, setCapturing] = useState(false);
  const [capture, setCapture] = useState('');
  const [captured, setCaptured] = useState<string[]>([]);
  const captureRef = useRef<HTMLInputElement>(null);

  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clock. Wall-clock derived rather than tick-counting, because a backgrounded
  // webview throttles timers and a focus timer that silently runs slow is useless.
  const startedAt = useRef(Date.now());
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setFocusedSeconds(Math.round((Date.now() - startedAt.current) / 1000));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [running]);

  /**
   * Answer locally first. A match returns in under a millisecond, which is the
   * entire point: by the time a hosted model has responded the moment is gone.
   */
  const ask = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const match = matchAnswer(trimmed);
      const answer = match?.answer.reply ?? FALLBACK_REPLY;

      setReply(answer);
      setQuestion('');
      speaker.speak(answer);

      if (match?.answer.action === 'take-break') setOnBreak(true);
      if (match?.answer.action === 'start-timer') {
        startedAt.current = Date.now();
        setFocusedSeconds(0);
        setRunning(true);
      }

      window.setTimeout(() => setReply(null), 14000);
    },
    [speaker],
  );



  // Quick capture, fired by the global shortcut from inside any other app.
  useEffect(() => {
    if (!tauri) return;
    let unlisten: (() => void) | undefined;
    void tauri
      .listen('quick-capture', () => {
        setCapturing(true);
        setPanel(null);
        window.setTimeout(() => captureRef.current?.focus(), 40);
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, [tauri]);

  // Activity events from Rust. Only fire on an actual change.
  useEffect(() => {
    if (!tauri) return;
    let unlisten: (() => void) | undefined;
    void tauri.listen('activity', (e) => setActivity(e.payload as ActivityPayload)).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [tauri]);

  // Relevance runs here, in the shared engine, not in Rust. One definition of
  // "on task", unit tested, identical in the web app.
  useEffect(() => {
    if (!activity) return;

    const sample: ActivitySample = {
      app: activity.app,
      windowTitle: activity.window_title,
      at: Date.now(),
    };

    // Logged before the nudge guards below, so turning nudges off silences the
    // voice without also blanking the end-of-day summary.
    record(sample);

    if (onBreak || !nudgesEnabled) return;

    const verdict = assessAlignment(sample, task);

    driftRun.current = verdict.alignment === 'drifting' ? driftRun.current + 1 : 0;

    const minutesSince =
      lastNudgeAt.current === null ? null : (Date.now() - lastNudgeAt.current) / 60000;

    const decision = decideNudge({
      consecutiveDrifting: driftRun.current,
      confidence: verdict.confidence,
      minutesSinceLastNudge: minutesSince,
      taskTitle: task,
      policy: DEFAULT_NUDGE_POLICY,
    });

    if (decision.shouldNudge) {
      /*
       * Their number, not a generic reminder.
       *
       * "You have drifted" is something people have been told a thousand times
       * and never once acted on. "That switch costs you 19 minutes" is about
       * them, it is true, and it was measured from their own week. It only
       * appears once there is real evidence; until then the plain line stands.
       */
      const measured = attentionLine(session.attention, 'drift');
      const message = measured ?? decision.message;

      setNudge(message);
      speaker.speak(message);
      lastNudgeAt.current = Date.now();
      driftRun.current = 0;
      window.setTimeout(() => setNudge(null), 8000);
    }
  }, [activity, task, onBreak, speaker, nudgesEnabled, record, session.attention]);

  const focusedMinutes = Math.floor(focusedSeconds / 60);
  const advice = adviseBreak({ focusedMinutes, calibration, minutesSinceBreak: null });


  const takeBreak = useCallback(() => {
    setOnBreak(true);
    setRunning(false);
    window.setTimeout(
      () => {
        setOnBreak(false);
        startedAt.current = Date.now();
        setFocusedSeconds(0);
        setRunning(true);
      },
      advice.breakMinutes * 60_000,
    );
  }, [advice.breakMinutes]);

  /**
   * Catch a thought and get out of the way.
   *
   * Deliberately does not answer, categorise, or ask a follow-up question. The
   * entire value is that it takes under two seconds and returns you to what you
   * were doing, so anything that prolongs it defeats the point.
   */
  const commitCapture = () => {
    const text = capture.trim();
    if (!text) {
      setCapturing(false);
      return;
    }
    setCaptured((prev) => [text, ...prev].slice(0, 20));
    setCapture('');
    setCapturing(false);
    // Deliberately silent. Speaking here would be an interruption caused by the
    // feature whose purpose is to avoid interruptions.
  };

  const toggleTimer = () => {
    if (running) {
      setRunning(false);
    } else {
      // Resume from where it stopped rather than restarting the stretch.
      startedAt.current = Date.now() - focusedSeconds * 1000;
      setRunning(true);
    }
  };

  // The single line the card is showing right now, in priority order.
  /*
   * The status line, in priority order.
   *
   * Sidq is filtered out of its own reporting. Showing "sidq" as your current
   * activity is both useless and slightly absurd: it is the one app you are
   * definitionally not working in when you glance at this card.
   */
  const foreground =
    activity?.app && activity.app.toLowerCase() !== 'sidq' ? activity.app : null;

  const status = onBreak
    ? { text: `On a break. ${advice.breakMinutes} minutes.`, tone: 'calm' as const }
    : nudge
      ? { text: nudge, tone: 'alert' as const }
      : advice.urgency !== 'none'
        ? { text: advice.message, tone: 'alert' as const }
        : !hasPlan
          ? { text: 'Nothing planned. Build one below.', tone: 'quiet' as const }
          : foreground
            ? { text: `In ${foreground}`, tone: 'quiet' as const }
            : { text: 'Watching', tone: 'quiet' as const };

  return (
    <div className="bg-transparent p-1">
      <div
        ref={cardRef}
        // Tauri's drag region: the whole card is the handle, so there is no title
        // bar to find and nothing to aim at.
        data-tauri-drag-region
        /*
         * Right-click opens today's plan.
         *
         * Settings used to live here and no longer exist on the card at all.
         * They were a thing touched once a month occupying a gesture on a
         * surface used every few minutes; the plan is the opposite.
         */
        onContextMenu={(e) => {
          e.preventDefault();
          togglePanel('plan');
          setAsking(false);
        }}
        /*
         * Take focus on click, so the arrow keys have somewhere to land.
         *
         * The window is declared with focus:false and the whole card is a Tauri
         * drag region, so clicking it moved the window without ever focusing the
         * webview. The keydown handler was correct and simply never ran, which
         * is why "click it once and use the arrows" was not true.
         */
        onMouseDown={() => {
          void tauri?.invoke('focus_overlay').catch(() => undefined);
        }}
        className={cn(
          'group/card relative select-none overflow-hidden rounded-[16px] px-4 py-3.5',
          // Layered material rather than one flat fill. A vertical gradient gives
          // the surface a light source, and the hairline border keeps the edge
          // crisp against whatever is behind it.
          // Noticeably more see-through than before, and tinted toward the brand
          // indigo rather than neutral grey. Blur carries legibility so the fill
          // does not have to, which is what lets the opacity come down this far.
          'bg-[linear-gradient(155deg,rgba(38,36,64,0.62)_0%,rgba(16,16,26,0.72)_60%,rgba(20,16,34,0.68)_100%)]',
          'backdrop-blur-[28px] backdrop-saturate-[1.7]',
          'border border-white/[0.13]',
          // Two shadows: a tight contact shadow and a wide ambient one. A single
          // shadow is what makes an overlay read as a flat sticker.
          'shadow-[0_2px_8px_-2px_rgba(0,0,0,0.45),0_28px_64px_-20px_rgba(10,8,30,0.75)]',
        )}
      >
        {/* Specular highlight along the top edge, the way real glass catches light.
            This one line does most of the work of making it feel like a material. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.28)_28%,rgba(255,255,255,0.28)_72%,transparent)]"
        />
        {/* A single soft indigo bloom. One colour, low opacity, bottom-right so it
            never sits behind the task title. This is what stops it reading grey. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-12 -right-8 size-40 rounded-full bg-[#6366F1] opacity-[0.20] blur-3xl"
        />
        {/* Fine grain. Stops the large dark area reading as flat digital grey. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.035] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />
        {/*
         * The day, as a row of segments.
         *
         * The single most useful thing this card can show and it was missing:
         * one mark per task, filled as they close. It answers "what is this
         * thing" and "how am I doing" in one glance and costs four pixels of
         * height. A number alone ("2 of 5") is read; a bar is seen.
         */}
        {hasPlan && dayTasks.length > 1 && (
          <div
            className="mb-2.5 flex gap-1"
            role="img"
            aria-label={`${doneCount} of ${dayTasks.length} tasks done`}
          >
            {dayTasks.map((t) => (
              <span
                key={t.id}
                className={cn(
                  'h-[3px] flex-1 rounded-full transition-colors duration-500',
                  t.status === 'completed'
                    ? 'bg-[#A9E5C3]'
                    : t.id === nextTask?.id
                      ? 'bg-[#6366F1]'
                      : 'bg-white/12',
                )}
              />
            ))}
          </div>
        )}

        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.9375rem] font-medium leading-snug tracking-[-0.01em] text-white">
              {task}
            </p>
            <p
              className={cn(
                'mt-1 flex items-center gap-1.5 truncate text-[0.75rem] leading-relaxed',
                status.tone === 'alert'
                  ? 'text-[#FFB4A2]'
                  : status.tone === 'calm'
                    ? 'text-[#A9E5C3]'
                    : 'text-white/50',
              )}
            >
              {/* Breathes only while the timer runs, so at a glance you know it is
                  actually counting without reading the digits. */}
              <span
                aria-hidden="true"
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  status.tone === 'alert'
                    ? 'bg-[#FFB4A2]'
                    : status.tone === 'calm'
                      ? 'bg-[#A9E5C3]'
                      : 'bg-white/35',
                  running && status.tone === 'quiet' && 'animate-pulse',
                )}
              />
              <span className="truncate">{status.text}</span>
              {/* How much of the day is left, in the quietest possible form.
                  Without it the card never answers "am I nearly done", which is
                  the question people actually glance down to ask. */}
              {hasPlan && remaining > 0 && status.tone === 'quiet' && (
                <span className="ml-auto shrink-0 tabular-nums text-white/30">
                  {doneCount}/{dayTasks.length}
                </span>
              )}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            {/* The timer is the one piece of data on the card, so it is set as an
                instrument: tabular, tracked tight, and the brightest thing here. */}
            <span
              className={cn(
                'tabular text-[1.0625rem] leading-none tracking-[-0.02em] tabular-nums',
                running ? 'text-white' : 'text-white/40',
              )}
            >
              {formatClock(focusedSeconds)}
            </span>

            {/* Break is the only control promoted to always-visible, and only when
                it is actually being suggested. Everything else waits for hover. */}
            {advice.urgency !== 'none' && !onBreak && (
              <button
                onClick={takeBreak}
                aria-label={`Take a ${advice.breakMinutes} minute break`}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded-full px-2.5',
                  'bg-white/[0.08] text-[0.6875rem] text-white/80',
                  'transition-colors duration-150 hover:bg-white/[0.16] hover:text-white',
                )}
              >
                <Coffee className="size-3" />
                {advice.breakMinutes}m
              </button>
            )}

            {/* Dimmed rather than hidden. Fully hiding them until hover reserves
                the width anyway (so the timer floats mid-card) and makes the
                controls undiscoverable, which is the same mistake as a hover-only
                button. Quiet and always there is the better trade. */}
            <div
              className={cn(
                'flex items-center gap-0.5 opacity-40 transition-opacity duration-200',
                'group-hover/card:opacity-100 focus-within:opacity-100',
              )}
            >
              <IconButton label={running ? 'Pause timer' : 'Resume timer'} onClick={toggleTimer}>
                {running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              </IconButton>

              <IconButton
                label={voice.enabled ? 'Mute the voice' : 'Unmute the voice'}
                onClick={() => {
                  speaker.stop();
                  setVoice((v) => ({ ...v, enabled: !v.enabled }));
                }}
              >
                {voice.enabled ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
              </IconButton>

              <IconButton
                label="Ask something"
                onClick={() => {
                  setAsking((v) => !v);
                  window.setTimeout(() => inputRef.current?.focus(), 30);
                }}
              >
                <CornerDownLeft className="size-3.5" />
              </IconButton>

              {/* Only offered once there is a day to describe, so it is never a
                  button that opens an empty panel. */}
              {session.replay && (
                <IconButton label="Where today went" onClick={() => togglePanel('replay')}>
                  <History className="size-3.5" />
                </IconButton>
              )}
            </div>
          </div>
        </div>

        {/*
         * The empty state, with the fix attached.
         *
         * This used to say "No plan yet today" and stop, which reads as broken
         * software: the card names a problem and offers nothing. The button is
         * the whole difference between a status display and a tool.
         */}
        {/*
         * Pick up where you left off.
         *
         * Shown above the plan button because it is the better offer: resuming
         * something with context beats starting something new, and this is the
         * one thing on the card no web app could ever know.
         */}
        {resume && !resumeDismissed && !capturing && panel === null && (
          <div className="mt-3 border-t border-white/10 pt-3">
            <p className="text-[0.75rem] leading-relaxed text-white/70">{resume.line}</p>
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={() => {
                  startedAt.current = Date.now();
                  setFocusedSeconds(0);
                  setRunning(true);
                  setResumeDismissed(true);
                }}
                className="rounded-md bg-white/[0.09] px-3 py-1.5 text-[0.6875rem] text-white/85 transition-colors duration-150 hover:bg-white/[0.16] hover:text-white"
              >
                Pick this back up
              </button>
              <button
                onClick={() => setResumeDismissed(true)}
                className="text-[0.6875rem] uppercase tracking-[0.16em] text-white/35 transition-colors duration-150 hover:text-white"
              >
                Not this
              </button>
            </div>
          </div>
        )}

        {/*
         * No import on the card.
         *
         * Bringing in ChatGPT or Gemini means requesting an export, waiting days
         * for OpenAI to mail a link, and walking through Takeout for Google.
         * That is a setup task at best and it has no business interrupting
         * somebody mid-work. It lives in onboarding, once, and the sources that
         * need no export at all now cover the common case.
         */}
        {!hasPlan && !capturing && panel === null && (
          <div className="mt-3 border-t border-white/10 pt-3">
            <button
              onClick={() => void buildToday()}
              disabled={building}
              className={cn(
                'btn-soft flex min-h-[2.5rem] w-full items-center justify-center gap-2',
                'rounded-[10px] px-4 text-[0.8125rem] font-medium disabled:opacity-60',
              )}
            >
              {building ? 'Building your day…' : 'Build today’s plan'}
            </button>
            {buildError && (
              <p role="alert" className="mt-2 text-[0.6875rem] text-[#FFB4A2]">
                {buildError}
              </p>
            )}
          </div>
        )}

        {/*
         * What Sidq has learned about you, on the card.
         *
         * This is the one thing here no other software can say, and it was
         * invisible unless the voice happened to speak it. Shown only once the
         * numbers are real, and only when nothing more urgent is on screen.
         */}
        {measured && !nudge && !capturing && panel === null && (
          <p className="mt-3 border-t border-white/10 pt-3 text-[0.75rem] leading-relaxed text-[#A9B0FF]">
            {measured}
          </p>
        )}

        {/* One line, not a wall. It used to print the shortcuts and the
            permission warning as two separate blocks on a card three lines tall. */}
        {/* Compact. This is a hint, not the content, and at three lines of body
            text it was dominating the card it was meant to explain. */}
        {firstRun && (
          <div className="mt-2.5 flex items-center gap-3 border-t border-white/10 pt-2.5">
            <p className="min-w-0 flex-1 text-[0.6875rem] leading-relaxed text-white/45">
              <span className="text-white/70">⌘⇧N</span> capture ·{' '}
              <span className="text-white/70">⌘⇧S</span> hide ·{' '}
              {/* Right-click stopped opening settings when settings left the
                  card. Copy promising a thing that no longer exists is worse
                  than no copy. */}
              <span className="text-white/70">right-click</span> for today’s plan
            </p>
            <button
              onClick={() => {
                setFirstRun(false);
                try {
                  localStorage.setItem('sidq.companion.seen', '1');
                } catch {
                  /* private mode, it will just show once more */
                }
              }}
              className="shrink-0 text-[0.6875rem] uppercase tracking-[0.16em] text-white/40 transition-colors duration-150 hover:text-white"
            >
              Got it
            </button>
          </div>
        )}

        {capturing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commitCapture();
            }}
            className="mt-3"
          >
            <div className="mb-1.5 flex items-center gap-1.5 text-[0.625rem] uppercase tracking-[0.18em] text-white/40">
              <Inbox className="size-3" />
              Catch it, keep working
            </div>
            <input
              ref={captureRef}
              value={capture}
              onChange={(e) => setCapture(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setCapturing(false);
              }}
              placeholder="Thought, task, anything"
              className={cn(
                'w-full rounded-md border border-white/10 bg-black/30 px-3 py-2',
                'text-[0.8125rem] text-white placeholder:text-white/35',
                'outline-none focus:border-white/25',
              )}
            />
          </form>
        )}

        {captured.length > 0 && !capturing && panel === null && (
          <p className="mt-2 text-[0.6875rem] text-white/35">
            {captured.length} caught for tomorrow
          </p>
        )}



        {panel === 'plan' && (
          <TodayPlan
            tasks={dayTasks}
            activeId={nextTask?.id ?? null}
            onToggle={toggleTask}
            onFocus={focusTask}
            onClose={() => setPanel(null)}
          />
        )}

        {panel === 'replay' && session.replay && (
          <DayReplay replay={session.replay} onClose={() => setPanel(null)} />
        )}

        {/* Not behind a button. This is the one thing the card raises on its own,
            and only when the plan genuinely no longer fits the hours left. */}
        {session.rescue && panel === null && !capturing && (
          <RescueDay
            plan={session.rescue}
            onAccept={() => {
              startedAt.current = Date.now();
              setFocusedSeconds(0);
              setRunning(true);
              setOnBreak(false);
              session.dismissRescue();
            }}
            onDismiss={session.dismissRescue}
          />
        )}

        {reply && (
          <p
            aria-live="polite"
            className="mt-3 border-t border-white/10 pt-3 text-[0.8125rem] leading-relaxed text-white/80"
          >
            {reply}
          </p>
        )}

        {asking && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
            className="mt-3"
          >
            {/*
             * Say what this is for.
             *
             * "Stuck? Overwhelmed? Ask." described a mood, not a use, and people
             * correctly could not tell what the box did. Three real examples
             * teach it in one glance, and tapping one is faster than typing.
             */}
            <div className="mb-2 flex flex-wrap gap-1.5">
              {["I'm stuck", "Too much to do", 'Should I take a break?'].map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => ask(example)}
                  className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[0.6875rem] text-white/60 transition-colors duration-150 hover:bg-white/[0.14] hover:text-white"
                >
                  {example}
                </button>
              ))}
            </div>
            <input
              ref={inputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setAsking(false);
              }}
              placeholder="Ask about your day, or what to do next"
              // Not a drag region, or you cannot place the caret.
              data-tauri-drag-region={false}
              className={cn(
                'w-full rounded-md border border-white/10 bg-black/30 px-3 py-2',
                'text-[0.8125rem] text-white placeholder:text-white/35',
                'outline-none focus:border-white/25',
              )}
            />
          </form>
        )}

        {/* Honest about running blind rather than quietly doing nothing. */}
        {activity && !activity.has_permission && (
          <button
            // Takes you to Apple's own Accessibility pane rather than only firing
            // the prompt, which someone at this point has already dismissed once.
            onClick={() => void tauri?.invoke('open_accessibility_settings')}
            className="mt-3 w-full rounded-md border border-white/10 px-3 py-2 text-left text-[0.6875rem] leading-relaxed text-white/55 transition-colors duration-150 hover:text-white/85"
          >
            Only seeing app names. Grant Accessibility to see what you are working on.
          </button>
        )}
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      // Not the 44px web minimum: this is a pointer-only desktop overlay, and a
      // 44px control bar would make the card twice as tall as it needs to be.
      className={cn(
        'grid size-7 place-items-center rounded-md text-white/50',
        'transition-colors duration-150 hover:bg-white/10 hover:text-white',
      )}
    >
      {children}
    </button>
  );
}
