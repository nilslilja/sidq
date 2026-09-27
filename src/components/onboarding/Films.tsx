import { useEffect, useState } from 'react';
import { SidqDot } from '@/components/SidqDot';
import { SidqMark } from '@/components/SidqMark';
import { cn } from '@/lib/cn';

/*
 * The films on the right of every setup screen.
 *
 * Short loops of the product doing the one thing the screen on the left asks
 * for, drawn in HTML: the same type, the same dot and the same logos as the
 * real thing, so what somebody watches is what they will see. A paragraph
 * explaining a double tap is read by nobody; watching a key go down twice and
 * a conversation land in another window is understood by everybody.
 *
 * Each film is a list of cue times. `useBeat` steps through them with timers
 * and every element is a CSS transition keyed on the beat, so a ten second
 * loop costs a dozen renders rather than one per frame. Under reduced motion
 * the film holds its last frame, which is the whole story in one picture.
 */

const LOOP_GAP_MS = 1400;

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const read = () => setReduce(mq.matches);
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);
  return reduce;
}

/**
 * Which cue the film is on. Loops forever, or holds the last one.
 *
 * -1 is the half second before a loop restarts, when the frame fades out with
 * everything still in place, so the reset happens where nobody can see it.
 */
function useBeat(cues: readonly number[]): number {
  const reduce = useReducedMotion();
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    if (cues.length === 0) return;
    if (reduce) {
      setBeat(cues.length);
      return;
    }
    let timers: number[] = [];
    const run = () => {
      setBeat(0);
      timers = cues.map((at, i) => window.setTimeout(() => setBeat(i + 1), at));
      const end = cues[cues.length - 1] + LOOP_GAP_MS * 2;
      timers.push(window.setTimeout(() => setBeat(-1), end - 500));
      timers.push(window.setTimeout(run, end));
    };
    run();
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [cues, reduce]);

  return beat;
}

/** Text that types itself once `go` is true, and is empty before. */
function useTyped(text: string, go: boolean, perCharMs = 22): string {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!go) {
      setN(0);
      return;
    }
    setN(0);
    const id = window.setInterval(() => {
      setN((was) => {
        if (was >= text.length) {
          window.clearInterval(id);
          return was;
        }
        return was + 1;
      });
    }, perCharMs);
    return () => window.clearInterval(id);
  }, [text, go, perCharMs]);
  return go ? text.slice(0, n) : '';
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function Window({
  app,
  logo,
  className,
  children,
}: {
  app: string;
  logo?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(18,18,26,0.08),0_24px_48px_-24px_rgba(18,18,26,0.35)]',
        className,
      )}
    >
      <div className="flex h-9 items-center gap-2 border-b border-ink/[0.06] px-3.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-ink/10" />
          <span className="size-2.5 rounded-full bg-ink/10" />
          <span className="size-2.5 rounded-full bg-ink/10" />
        </span>
        <span className="ml-2 flex items-center gap-1.5 text-[0.75rem] font-medium text-ink/60">
          {logo ? (
            <img src={logo} alt="" width={14} height={14} className="size-3.5" />
          ) : (
            <span className="grid size-3.5 place-items-center rounded-[4px] bg-ink text-[0.5rem] font-semibold text-paper">
              {app[0]}
            </span>
          )}
          {app}
        </span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Said({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'ml-auto w-fit max-w-[85%] rounded-[12px] bg-[#F1F0EC] px-3 py-2 text-[0.8125rem] leading-snug text-ink',
        'transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
        show ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
      )}
    >
      {children}
    </div>
  );
}

function Lines({ show, widths }: { show: boolean; widths: string[] }) {
  return (
    <div className="mt-3 space-y-1.5">
      {widths.map((w, i) => (
        <div
          key={i}
          className={cn(
            'h-2 origin-left rounded-full bg-ink/[0.08] transition-[opacity,transform] duration-500',
            show ? 'scale-x-100 opacity-100' : 'scale-x-50 opacity-0',
          )}
          style={{ width: w, transitionDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

/**
 * The overlay, as it looks on a screen: the dot, and the paper label beside it
 * when there is news. The same label the real one shows.
 */
function Overlay({ splash, label }: { splash: number; label: string | null }) {
  return (
    <div className="flex h-7 items-center gap-2">
      <span className="grid size-7 place-items-center">
        <SidqDot mood={label ? 'hop' : 'idle'} splash={splash} />
      </span>
      <span
        className={cn(
          'rounded-[6px] bg-paper px-1.5 py-[3px] text-[0.6875rem] font-medium whitespace-nowrap text-ink ring-1 ring-ink/10',
          'transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          label ? 'translate-x-0 opacity-100' : '-translate-x-1 opacity-0',
        )}
      >
        {label ?? ' '}
      </span>
    </div>
  );
}

function Caret({ on }: { on: boolean }) {
  return on ? <span aria-hidden="true" className="film-caret ml-px inline-block h-[1em] w-px translate-y-[2px] bg-ink" /> : null;
}

function Frame({ beat, children }: { beat: number; children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative w-full max-w-[30rem] transition-opacity duration-500',
        beat === -1 ? 'opacity-0' : 'opacity-100',
      )}
    >
      {children}
    </div>
  );
}

/* ── One: the promise ───────────────────────────────────────────────────── */

const SAME_PAGE = [500, 1500, 2600, 3300, 4200, 5000, 7400] as const;
const SAME_PAGE_ANSWER = 'Rounding once on the total, like you decided in ChatGPT.';

/**
 * Tell one AI, and the next one already knows. The film's opening beat and the
 * website's headline, in two windows.
 */
export function SamePageFilm() {
  const beat = useBeat(SAME_PAGE);
  const at = (n: number) => beat === -1 || beat >= n;
  const typed = useTyped(SAME_PAGE_ANSWER, at(6));

  return (
    <Frame beat={beat}>
      <Window app="ChatGPT" logo="/openai-logo.svg" className="relative z-0 w-[82%]">
        <Said show={at(1)}>We&rsquo;ll use Stripe. Round once, on the total.</Said>
        <Lines show={at(2)} widths={['92%', '78%', '54%']} />
      </Window>

      <div className="absolute left-[74%] top-[38%] z-20 -translate-x-1/2">
        <Overlay splash={at(3) ? 1 : 0} label={at(3) ? 'Remembered' : null} />
      </div>

      <Window
        app="Claude"
        logo="/claude-logo.svg"
        className={cn(
          'relative z-10 -mt-6 ml-auto w-[82%] transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]',
          at(4) ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        )}
      >
        <Said show={at(5)}>Fix the checkout rounding.</Said>
        <p className="mt-3 min-h-[2.6em] text-[0.875rem] font-medium leading-snug tracking-[-0.01em] text-ink">
          {typed}
          <Caret on={at(6) && typed.length < SAME_PAGE_ANSWER.length} />
        </p>
        <p
          className={cn(
            'mt-2 flex items-center gap-1.5 text-[0.6875rem] text-[#4F46E5] transition-opacity duration-500',
            at(7) ? 'opacity-100' : 'opacity-0',
          )}
        >
          <SidqMark width={18} height={10} />
          Remembered from ChatGPT, today
        </p>
      </Window>
    </Frame>
  );
}

/* ── Two: reading what is already there ─────────────────────────────────── */

export interface FoundSource {
  id: string;
  label: string;
  logo?: string;
  /** Conversations found for it on this Mac. Zero is shown as waiting. */
  count: number;
}

/**
 * The assistants on this Mac, ticked off one by one as Sidq reads them. Real
 * numbers when there are any: the film on this screen is the person's own disk.
 */
export function ReadingFilm({ sources }: { sources: FoundSource[] }) {
  const cues = useCues(sources.length);
  const beat = useBeat(cues);
  const at = (n: number) => beat === -1 || beat >= n;
  const read = sources.filter((s) => s.count > 0).length;

  return (
    <Frame beat={beat}>
      <div className="rounded-[16px] bg-white p-2 shadow-[0_0_0_1px_rgba(18,18,26,0.08),0_24px_48px_-24px_rgba(18,18,26,0.35)]">
        <ul>
          {sources.map((s, i) => {
            const lit = at(i + 1);
            return (
              <li
                key={s.id}
                className={cn(
                  'flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors duration-300',
                  lit && s.count > 0 ? 'bg-[#EEF1FD]' : 'bg-transparent',
                )}
              >
                {s.logo ? (
                  <img src={s.logo} alt="" width={18} height={18} className="size-[18px]" />
                ) : (
                  <span className="grid size-[18px] place-items-center rounded-[5px] bg-ink text-[0.5625rem] font-semibold text-paper">
                    {s.label[0]}
                  </span>
                )}
                <span className="flex-1 text-[0.875rem] text-ink">{s.label}</span>
                <span
                  className={cn(
                    'text-[0.75rem] tabular-nums transition-opacity duration-300',
                    lit ? 'opacity-100' : 'opacity-0',
                    s.count > 0 ? 'text-[#2448E8]' : 'text-ink/40',
                  )}
                >
                  {s.count > 0 ? `${s.count.toLocaleString()} read` : 'when you open it'}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-4 place-items-center rounded-full text-[0.5625rem] text-white transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                    lit && s.count > 0 ? 'scale-100 bg-[#2448E8]' : 'scale-0 bg-ink/10',
                  )}
                >
                  ✓
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <p
        className={cn(
          'mt-4 flex items-center justify-center gap-2 text-[0.8125rem] text-ink/55 transition-opacity duration-500',
          at(sources.length) ? 'opacity-100' : 'opacity-0',
        )}
      >
        <SidqDot mood="idle" className="scale-75" />
        {read > 0 ? 'Read into an index on this Mac. Nothing uploaded.' : 'Waiting for your first conversation.'}
      </p>
    </Frame>
  );
}

function useCues(n: number): number[] {
  const [cues, setCues] = useState<number[]>([]);
  useEffect(() => {
    setCues(Array.from({ length: n }, (_, i) => 500 + i * 420).concat(500 + n * 420 + 2600));
  }, [n]);
  return cues;
}

/* ── Three: the double tap ──────────────────────────────────────────────── */

const DOUBLE_TAP = [700, 950, 1250, 2300, 3100, 3500, 4300] as const;

/**
 * Two taps of a key, the dot throwing its splash, and the whole conversation
 * arriving in a different AI as a file. Nothing is typed and nothing is sent:
 * the person presses send, as they will in real life.
 */
export function DoubleTapFilm({ tapKey }: { tapKey: string }) {
  const beat = useBeat(DOUBLE_TAP);
  const at = (n: number) => beat === -1 || beat >= n;
  const down = beat === 1 || beat === 2;

  return (
    <Frame beat={beat}>
      <div className="mb-4 flex justify-center">
        <Overlay splash={at(3) ? 1 : 0} label={at(3) ? 'Copied · ⌘V' : null} />
      </div>

      <Window app="Claude Code" logo="/claude-logo.svg" className="w-[80%]">
        <Said show>Retries should key on the session id.</Said>
        <Lines show widths={['88%', '70%']} />
        <Said show>Ship it. Then the Apple Pay button.</Said>
        <Lines show widths={['64%']} />
      </Window>

      <div className="absolute left-[6%] top-[60%] z-20 flex items-center gap-1.5">
        <span
          className={cn(
            'grid h-10 place-items-center rounded-[9px] px-3 font-mono text-[0.75rem] transition-[transform,background-color,color,box-shadow] duration-100',
            down
              ? 'translate-y-[2px] bg-[#2448E8] text-white shadow-[0_0_0_4px_rgba(36,72,232,0.18)]'
              : 'bg-white text-ink shadow-[0_0_0_1px_rgba(18,18,26,0.12),0_3px_0_rgba(18,18,26,0.1)]',
            at(4) ? 'opacity-0' : 'opacity-100',
          )}
        >
          {tapKey}
        </span>
        <span className={cn('text-[0.6875rem] text-ink/45 transition-opacity duration-300', at(3) && !at(4) ? 'opacity-100' : 'opacity-0')}>
          ×2
        </span>
      </div>

      <Window
        app="ChatGPT"
        logo="/openai-logo.svg"
        className={cn(
          'relative z-10 -mt-10 ml-auto w-[80%] transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]',
          at(4) ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        )}
      >
        <div className="rounded-[12px] border border-ink/10 p-2.5">
          <div
            className={cn(
              'mb-2 flex w-fit items-center gap-2 rounded-[8px] bg-[#F1F0EC] px-2 py-1.5 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
              at(6) ? 'scale-100 opacity-100' : 'scale-90 opacity-0',
            )}
          >
            <span className="grid size-6 place-items-center rounded-[6px] bg-[#2448E8] text-[0.5rem] font-semibold text-white">MD</span>
            <span>
              <span className="block text-[0.6875rem] font-medium leading-tight text-ink">Stripe webhook retries.md</span>
              <span className="block text-[0.625rem] leading-tight text-ink/45">The whole conversation</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[0.75rem] text-ink/35">
              {at(7) ? 'Carry on from here' : 'Ask anything'}
              <Caret on={at(5)} />
            </span>
            <span className="grid size-6 place-items-center rounded-full bg-ink/10 text-[0.625rem] text-ink/50">↑</span>
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-end gap-1">
          <span
            className={cn(
              'rounded-[5px] bg-white px-1.5 py-0.5 font-mono text-[0.625rem] text-ink shadow-[0_0_0_1px_rgba(18,18,26,0.12)] transition-opacity duration-200',
              at(5) && !at(6) ? 'opacity-100' : 'opacity-0',
            )}
          >
            ⌘ V
          </span>
        </div>
      </Window>
    </Frame>
  );
}

/* ── Four: a new chat that already knows ────────────────────────────────── */

const BRIEFED = [600, 1300, 1500, 5200] as const;
const BRIEF_TEXT =
  'Working on shop. Decided: Stripe checkout, round once on the total, retries key on the session id. Next: Apple Pay.';

/**
 * A blank chat, and the project you were last in already waiting in its box.
 * Unsent, because Sidq never presses send, and gone again with ⌘Z.
 */
export function BriefedFilm() {
  const beat = useBeat(BRIEFED);
  const at = (n: number) => beat === -1 || beat >= n;
  const typed = useTyped(BRIEF_TEXT, at(3), 14);

  return (
    <Frame beat={beat}>
      <div className="mb-4 flex justify-center">
        <Overlay splash={at(2) ? 1 : 0} label={at(2) ? 'In ChatGPT · ⌘Z' : null} />
      </div>
      <Window app="ChatGPT · New chat" logo="/openai-logo.svg">
        <p
          className={cn(
            'pb-8 pt-6 text-center font-display text-[1.25rem] font-semibold tracking-[-0.03em] text-ink transition-opacity duration-500',
            at(1) ? 'opacity-100' : 'opacity-0',
          )}
        >
          What can I help with?
        </p>
        <div
          className={cn(
            'rounded-[14px] border p-3 transition-[border-color,box-shadow] duration-500',
            at(3) ? 'border-[#2448E8]/40 shadow-[0_0_0_4px_rgba(36,72,232,0.08)]' : 'border-ink/10',
          )}
        >
          <p className="min-h-[3.9em] text-[0.8125rem] leading-snug text-ink">
            {typed || <span className="text-ink/35">Ask anything</span>}
            <Caret on={at(3)} />
          </p>
          <div className="mt-2 flex items-center justify-between">
            <span
              className={cn(
                'flex items-center gap-1 text-[0.625rem] text-[#4F46E5] transition-opacity duration-500',
                at(4) ? 'opacity-100' : 'opacity-0',
              )}
            >
              <SidqMark width={16} height={9} />
              From Sidq · not sent
            </span>
            <span className="grid size-6 place-items-center rounded-full bg-ink/10 text-[0.625rem] text-ink/50">↑</span>
          </div>
        </div>
      </Window>
    </Frame>
  );
}
