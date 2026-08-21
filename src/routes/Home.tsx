import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  desktopBridge,
  type HandoverRecord,
  type PlanStatus,
  type ProfileFact,
  type SearchHit,
} from '@/lib/onboarding/bridge';
import type { WorkSession } from '@/lib/companion/work-history';
import { shareSessionWithDesktop } from '@/lib/supabase';
import { cn } from '@/lib/cn';

/*
 * The window behind the pill.
 *
 * Wispr's shape, and for the reason that shape works: the thing you use is a
 * small overlay you never lose, and behind it sits a real application you open
 * when you want to look at something rather than do something.
 *
 * ── The rule this screen is built under ──────────────────────────────────────
 * Every number here is computed from data that exists. There is no invite
 * panel, no placeholder card, no "coming soon" tile, no stat with a plausible
 * shape and nothing behind it. If a section has nothing to show it says so in
 * one line and takes up no more room than that.
 *
 * Search is the main screen rather than a feature, because it is the thing you
 * cannot do anywhere else: no vendor can search a competitor's history, and
 * this is the only place all of yours sits together.
 */

type Tab = 'search' | 'profile' | 'handovers' | 'sources';

const TABS: { id: Tab; label: string }[] = [
  { id: 'search', label: 'Search' },
  { id: 'profile', label: 'How you work' },
  { id: 'handovers', label: 'Handovers' },
  { id: 'sources', label: 'Sources' },
];

const DAY_MS = 86_400_000;

/** Long enough to read "Copied", short enough that it never feels stuck. */
const COPIED_FOR_MS = 1600;

export function Home() {
  const bridge = useMemo(() => desktopBridge(), []);
  const [tab, setTab] = useState<Tab>('search');
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [stats, setStats] = useState<[number, number]>([0, 0]);

  /*
   * The plan as Rust understands it.
   *
   * Asked rather than assumed, and only ever used for wording. Rust confirms
   * the tier against the billing database and applies every limit inside the
   * command that would breach it, so this being wrong changes what somebody is
   * told and not what they are given.
   */
  const [plan, setPlan] = useState<PlanStatus | null>(null);

  useEffect(() => {
    if (!bridge) return;
    void bridge.recentWork(200).then((rows) => setSessions(rows as WorkSession[]));
    void bridge.indexStats().then(setStats);
    /*
     * Refresh the token, then ask what the plan is.
     *
     * Access tokens expire after an hour and Rust's stored copy goes stale with
     * them, so opening this window is the moment to hand over a live one. It
     * also means somebody who has just paid sees it here rather than waiting
     * for a cache to lapse.
     */
    void shareSessionWithDesktop()
      .catch(() => {})
      .then(() => bridge.planStatus())
      .then(setPlan);
  }, [bridge]);

  return (
    <div className="grid h-[100dvh] grid-cols-[13rem_1fr] bg-[#0B0B10] text-white">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="flex flex-col border-r border-white/[0.07] px-3 py-4">
        <div className="px-3 font-display text-[1.25rem] leading-none tracking-[-0.05em]">Sidq</div>

        <nav className="mt-7 flex flex-col gap-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-[9px] px-3 py-2 text-left text-[0.875rem] transition-colors duration-100',
                tab === t.id ? 'bg-white/[0.08] text-white' : 'text-white/45 hover:text-white/80',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto">
          <Stats sessions={sessions} indexed={stats} />
        </div>
      </aside>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <main className="min-w-0 overflow-y-auto px-8 py-7">
        {tab === 'search' && <Search bridge={bridge} historyDays={plan?.historyDays ?? null} />}
        {tab === 'profile' && <Profile bridge={bridge} />}
        {tab === 'handovers' && <Handovers bridge={bridge} />}
        {tab === 'sources' && <Sources sessions={sessions} bridge={bridge} />}
      </main>
    </div>
  );
}

/* ── How you work ─────────────────────────────────────────────────────────── */

/**
 * The instructions you have given assistants, collected in one place.
 *
 * Every line is a sentence taken word for word out of one of your own turns.
 * Nothing here is generated or paraphrased, which is why each one is shown as a
 * quotation with a count next to it rather than as a claim about you: the count
 * is the evidence, and you can see for yourself whether it is right.
 */
function Profile({ bridge }: { bridge: ReturnType<typeof desktopBridge> }) {
  const [facts, setFacts] = useState<ProfileFact[] | null>(null);
  const [preamble, setPreamble] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    void bridge.memoryProfile().then(([found, text]) => {
      setFacts(found);
      setPreamble(text);
    });
  }, [bridge]);

  if (facts === null) {
    return <p className="text-[0.875rem] text-white/35">Reading your conversations&hellip;</p>;
  }

  /*
   * Nothing found says nothing found.
   *
   * The alternative is a handful of vague lines dressed up as a profile, and
   * the first wrong one costs the whole feature its credibility.
   */
  if (facts.length === 0) {
    return (
      <p className="max-w-[56ch] text-[0.875rem] leading-relaxed text-white/35">
        Nothing yet. This fills up from the instructions you give assistants
        &mdash; the rules you repeat, the stack you keep explaining &mdash; and it
        only counts sentences you actually typed, so it needs a few real
        conversations behind it first.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="max-w-[56ch] text-[0.875rem] leading-relaxed text-white/45">
          Taken word for word from your own messages, across every assistant. Paste
          it at the top of a new conversation and skip explaining yourself again.
        </p>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(preamble).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), COPIED_FOR_MS);
            });
          }}
          className={cn(
            'shrink-0 rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium',
            'bg-[#B8A6FF] text-[#141319] transition-opacity duration-150',
            'cursor-pointer hover:opacity-90',
          )}
        >
          {copied ? 'Copied' : 'Copy as a preamble'}
        </button>
      </div>

      <ul className="mt-6 space-y-px">
        {facts.map((fact) => (
          <li
            key={fact.text}
            className={cn(
              'flex items-baseline gap-4 rounded-[10px] px-3 py-2.5',
              'transition-colors duration-100 hover:bg-white/[0.04]',
            )}
          >
            <span className="min-w-0 flex-1 text-[0.875rem] leading-relaxed text-white/85">
              {fact.text}
            </span>
            {/*
              * The count, not a badge saying "important".
              *
              * Said in six conversations is a fact about the transcripts and
              * can be checked. Any label we invented on top of it could not.
              */}
            <span className="shrink-0 text-[0.75rem] tabular-nums text-white/30">
              {fact.conversations === 1
                ? 'once'
                : `${fact.conversations} conversations`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Search ───────────────────────────────────────────────────────────────── */

function Search({
  bridge,
  historyDays,
}: {
  bridge: ReturnType<typeof desktopBridge>;
  /** How far back the plan reaches, or null for everything. */
  historyDays: number | null;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [withheld, setWithheld] = useState(0);
  const [searched, setSearched] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  /*
   * There is no window to pass.
   *
   * This used to compute the cutoff and send it down, which meant the limit was
   * whatever the page felt like sending. Rust works it out from the plan now,
   * and the only thing this can say is what to look for.
   */
  const run = useCallback(
    (q: string) => {
      if (!bridge || q.trim().length < 2) {
        setHits([]);
        setWithheld(0);
        setSearched(false);
        return;
      }
      void bridge.searchConversations(q, 50).then(([found, older]) => {
        setHits(found);
        setWithheld(older);
        setSearched(true);
      });
    },
    [bridge],
  );

  // Debounced, because every keystroke otherwise runs a full-text query against
  // several thousand messages.
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => run(query), 180);
    return () => window.clearTimeout(timer.current);
  }, [query, run]);

  return (
    <>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search everything you have ever asked"
        spellCheck={false}
        className={cn(
          'w-full rounded-[12px] bg-white/[0.05] px-4 py-3.5',
          'text-[1rem] text-white placeholder:text-white/30',
          'ring-1 ring-inset ring-white/[0.08] focus:outline-none focus:ring-white/20',
        )}
      />

      {searched && (
        <p className="mt-4 text-[0.8125rem] text-white/35">
          {hits.length === 0
            ? 'Nothing matched.'
            : `${hits.length} ${hits.length === 1 ? 'result' : 'results'}`}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {hits.map((hit) => (
          <Hit key={`${hit.sessionId}-${hit.snippet.slice(0, 24)}`} hit={hit} />
        ))}
      </div>

      {/*
       * The locked results.
       *
       * The count is real and comes from the same query; the text does not. It
       * is shown rather than hidden because someone who can see exactly what
       * they are missing has a reason to pay, and someone who cannot has no
       * idea there is anything there.
       */}
      {withheld > 0 && historyDays !== null && (
        <div className="mt-5 rounded-[12px] border border-[#B8A6FF]/20 bg-[#B8A6FF]/[0.06] p-4">
          <p className="text-[0.875rem] text-white/85">
            <span className="font-medium text-white">{withheld} more</span>{' '}
            {withheld === 1 ? 'conversation matches' : 'conversations match'}, older than{' '}
            {historyDays} days
          </p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-white/40">
            Free search reaches back {historyDays} days. Pro reaches everything you have ever
            asked, in any assistant.
          </p>
        </div>
      )}

      {!searched && (
        <p className="mt-8 max-w-[52ch] text-[0.875rem] leading-relaxed text-white/35">
          Every conversation, from every assistant you use, searched together. Nobody else can
          do this: no assistant can read another one&rsquo;s history, and this is the only
          place yours sits in one pile.
        </p>
      )}
    </>
  );
}

function Hit({ hit }: { hit: SearchHit }) {
  return (
    <article className="rounded-[12px] bg-white/[0.03] p-4 ring-1 ring-inset ring-white/[0.05]">
      <div className="flex items-baseline gap-2">
        <span className="truncate text-[0.875rem] font-medium text-white/90">
          {hit.title || 'Untitled'}
        </span>
        <span className="shrink-0 text-[0.6875rem] text-white/30">
          {sourceLabel(hit.source)}
          {hit.project && ` · ${hit.project}`}
          {hit.endedAt > 0 && ` · ${whenLabel(hit.endedAt)}`}
        </span>
      </div>
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-white/55">
        {/* FTS5 wraps matches in « ». Rendered as marks so the eye lands on why
            this result is here rather than on the surrounding sentence. */}
        {hit.snippet.split(/[«»]/).map((part, i) =>
          i % 2 === 1 ? (
            <mark key={i} className="rounded bg-[#B8A6FF]/25 px-0.5 text-white">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </p>
    </article>
  );
}

/* ── Handovers ────────────────────────────────────────────────────────────── */

function Handovers({ bridge }: { bridge: ReturnType<typeof desktopBridge> }) {
  const [rows, setRows] = useState<HandoverRecord[] | null>(null);

  useEffect(() => {
    if (!bridge) return;
    void bridge.recentHandovers().then(setRows);
  }, [bridge]);

  return (
    <>
      <h1 className="font-display text-[1.5rem] tracking-[-0.03em]">Handovers</h1>
      <p className="mt-4 max-w-[54ch] text-[0.875rem] leading-relaxed text-white/45">
        Every one is written to your Downloads folder as a Markdown file, so nothing is lost
        to a misclick the way a clipboard is.
      </p>

      {rows !== null && rows.length === 0 && (
        /*
         * Empty says empty. This panel used to claim Sidq kept no record at
         * all, which stopped being true the day the handovers table landed;
         * inventing rows to fill it would be the same mistake pointed the
         * other way.
         */
        <p className="mt-8 max-w-[54ch] text-[0.875rem] leading-relaxed text-white/35">
          You have not handed one over yet. Press ⌘⇧K, pick a conversation, press Enter, and
          it shows up here.
        </p>
      )}

      {rows !== null && rows.length > 0 && (
        <ul className="mt-8 space-y-px">
          {rows.map((row) => (
            <li
              key={`${row.sessionId}-${row.madeAt}`}
              className={cn(
                'flex items-baseline gap-4 rounded-[10px] px-3 py-2.5',
                'transition-colors duration-100 hover:bg-white/[0.04]',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.875rem] text-white/85">
                  {row.title || 'Untitled conversation'}
                </span>
                <span className="block truncate text-[0.75rem] text-white/35">
                  {row.source}
                  {row.project && ` · ${row.project}`}
                </span>
              </span>
              <span className="shrink-0 text-[0.75rem] tabular-nums text-white/30">
                {whenHandedOver(row.madeAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Rust stores seconds; everything in the browser is milliseconds. */
function whenHandedOver(seconds: number): string {
  const days = Math.floor((Date.now() - seconds * 1000) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(seconds * 1000).toLocaleDateString();
}

/* ── Sources ──────────────────────────────────────────────────────────────── */

/** Everything Sidq can read, and how. Counts come from what was actually found. */
const SOURCES: { id: string; label: string; local: boolean }[] = [
  { id: 'claude-code', label: 'Claude Code', local: true },
  { id: 'cowork', label: 'Claude Cowork', local: true },
  { id: 'cursor', label: 'Cursor, Windsurf, VS Code', local: true },
  { id: 'chatgpt', label: 'ChatGPT', local: false },
  { id: 'claude.ai', label: 'Claude.ai', local: false },
  { id: 'gemini', label: 'Gemini', local: false },
  { id: 'perplexity', label: 'Perplexity', local: false },
  { id: 'grok', label: 'Grok', local: false },
  { id: 'deepseek', label: 'DeepSeek', local: false },
  { id: 'mistral', label: 'Mistral', local: false },
];

/**
 * Bring in the history you already have, from whichever assistant it is in.
 *
 * claude.ai keeps nothing readable on this Mac. Its desktop app has an
 * IndexedDB at Application Support/Claude, and that store holds no conversation
 * text — checked, not assumed: 2.2MB, 31% printable, and the only readable
 * string in it is the name of the store.
 *
 * The extension covers the tab you have open. This covers the rest, which for
 * most people is nearly all of it.
 *
 * The file is read here and the JSON handed to Rust, rather than Rust opening
 * the path. That means no file-dialog plugin, and it means Sidq only ever sees
 * the one file somebody deliberately chose.
 */
/**
 * The assistants, opened inside Sidq.
 *
 * This replaces the browser extension as the way a browser assistant is read.
 * The extension worked and was the wrong shape: a store listing, a review
 * queue, a different install per browser, and a person deciding to trust a
 * second thing before Sidq could read anything at all. For a product whose
 * whole pitch is that it already knows, that is the wrong first minute.
 *
 * Sidq is a Tauri app, so it already has a browser engine in it. Verified in
 * this webview: ChatGPT, Claude and Gemini all render completely, with sign-in
 * offered and no "unsupported browser" anywhere.
 */
function OpenAssistants({ bridge }: { bridge: ReturnType<typeof desktopBridge> }) {
  const [rows, setRows] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    if (!bridge) return;
    void bridge.assistantList().then(setRows);
  }, [bridge]);

  if (rows.length === 0) return null;

  return (
    <div className="mt-8">
      <p className="text-[0.875rem] font-medium text-white">Open one here</p>
      <p className="mt-1.5 max-w-[54ch] text-[0.8125rem] leading-relaxed text-white/45">
        Sign in once, in Sidq, and everything you do in it from then on is read as it happens.
        Nothing to install and no extension.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {rows.map((row) => (
          <button
            key={row.id}
            onClick={() => void bridge?.openAssistant(row.id)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium',
              'bg-white/[0.07] text-white/80 ring-1 ring-inset ring-white/10',
              'cursor-pointer transition-colors duration-150 hover:bg-white/[0.12] hover:text-white',
            )}
          >
            {row.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ImportHistory({ bridge }: { bridge: ReturnType<typeof desktopBridge> }) {
  const [state, setState] = useState<'idle' | 'reading' | 'done' | 'failed'>('idle');
  const [message, setMessage] = useState('');

  return (
    <div className="mt-8 rounded-[12px] border border-[#B8A6FF]/20 bg-[#B8A6FF]/[0.05] p-4">
      <p className="text-[0.875rem] font-medium text-white">
        Already have an export file?
      </p>
      {/*
        * Deliberately the last thing on this panel, and phrased as an
        * afterthought.
        *
        * It used to be the headline. Requesting an export from Claude or
        * ChatGPT is emailed to you and can take days to arrive, so putting it
        * in front of somebody who has just installed Sidq means their first
        * experience of the product is waiting. Opening an assistant here works
        * in one click, so that is the offer; this is for the people who
        * happen to have a file already.
        */}
      <p className="mt-1.5 max-w-[54ch] text-[0.8125rem] leading-relaxed text-white/45">
        Only worth it if you already downloaded one, since they take a day or two to
        arrive. It brings in everything you did before installing Sidq. Claude and ChatGPT
        both call it <code className="text-white/65">conversations.json</code>; Google
        Takeout calls it <code className="text-white/65">MyActivity.json</code>. Sidq works
        out which is which.
      </p>

      <label
        className={cn(
          'mt-3 inline-flex cursor-pointer items-center rounded-lg px-3 py-1.5',
          'bg-[#B8A6FF] text-[0.8125rem] font-medium text-[#141319]',
          'transition-opacity duration-150 hover:opacity-90',
          state === 'reading' && 'pointer-events-none opacity-50',
        )}
      >
        {state === 'reading' ? 'Importing…' : 'Choose an export file'}
        <input
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file || !bridge) return;

            setState('reading');
            void file
              .text()
              .then((json) => bridge.importExport(json))
              .then((count) => {
                setState('done');
                setMessage(
                  `${count} conversation${count === 1 ? '' : 's'} imported. They are searchable now.`,
                );
              })
              .catch((err: unknown) => {
                setState('failed');
                // Rust says what is actually wrong with the file. Replacing that
                // with "something went wrong" throws away the only useful part.
                setMessage(err instanceof Error ? err.message : String(err));
              });
            // Let the same file be chosen twice, after a failed first attempt.
            e.target.value = '';
          }}
        />
      </label>

      {state !== 'idle' && state !== 'reading' && (
        <p
          className={cn(
            'mt-2.5 text-[0.8125rem]',
            state === 'done' ? 'text-white/55' : 'text-red-300',
          )}
        >
          {message}
        </p>
      )}
    </div>
  );
}

function Sources({ sessions, bridge }: { sessions: WorkSession[]; bridge: ReturnType<typeof desktopBridge> }) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      const key = s.source ?? 'claude-code';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [sessions]);

  return (
    <>
      <h1 className="font-display text-[1.5rem] tracking-[-0.03em]">Sources</h1>
      <p className="mt-3 max-w-[54ch] text-[0.875rem] leading-relaxed text-white/45">
        Sidq is not tied to any one assistant. The ones that write conversations to this Mac
        are read with nothing to set up. The ones that run in a browser keep nothing readable
        here, so you open them inside Sidq instead. Sign in once and everything after that is
        read as it happens. Nothing to install.
      </p>

      <ul className="mt-6 space-y-1.5">
        {SOURCES.map((source) => {
          const found = counts.get(source.id) ?? 0;
          return (
            <li
              key={source.id}
              className="flex items-center gap-3 rounded-[10px] bg-white/[0.03] px-4 py-2.5"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  found > 0 ? 'bg-[#B8A6FF]' : 'bg-white/15',
                )}
              />
              <span className="flex-1 text-[0.875rem] text-white/80">{source.label}</span>
              <span className="text-[0.75rem] text-white/35">
                {found > 0
                  ? `${found} ${found === 1 ? 'conversation' : 'conversations'}`
                  : source.local
                    ? 'none found'
                    : 'via extension'}
              </span>
            </li>
          );
        })}
      </ul>
      <OpenAssistants bridge={bridge} />
      <ImportHistory bridge={bridge} />
    </>
  );
}

/* ── Stats ────────────────────────────────────────────────────────────────── */

function Stats({ sessions, indexed }: { sessions: WorkSession[]; indexed: [number, number] }) {
  const [conversations, messages] = indexed;

  // Real working time, summed from what the readers measured. Not an estimate.
  const hours = Math.round(sessions.reduce((sum, s) => sum + (s.activeMinutes ?? 0), 0) / 60);

  return (
    <dl className="space-y-3 px-3 pb-1">
      {[
        [conversations.toLocaleString(), 'conversations'],
        [messages.toLocaleString(), 'messages indexed'],
        [`${hours}h`, 'of work read'],
      ].map(([value, label]) => (
        <div key={label}>
          <dt className="text-[1.125rem] tabular-nums leading-none text-white/90">{value}</dt>
          <dd className="mt-1 text-[0.6875rem] text-white/30">{label}</dd>
        </div>
      ))}
    </dl>
  );
}

function sourceLabel(source: string): string {
  const names: Record<string, string> = {
    'claude-code': 'Claude Code',
    cursor: 'Cursor',
    chatgpt: 'ChatGPT',
    gemini: 'Gemini',
  };
  return names[source] ?? source;
}

function whenLabel(endedAt: number): string {
  const days = Math.floor((Date.now() - endedAt) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}
