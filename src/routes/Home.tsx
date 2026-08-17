import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { desktopBridge, type SearchHit } from '@/lib/onboarding/bridge';
import { entitlementsFor, isUnlimited } from '@/lib/entitlements';
import type { WorkSession } from '@/lib/companion/work-history';
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

type Tab = 'search' | 'handovers' | 'sources';

const TABS: { id: Tab; label: string }[] = [
  { id: 'search', label: 'Search' },
  { id: 'handovers', label: 'Handovers' },
  { id: 'sources', label: 'Sources' },
];

const DAY_MS = 86_400_000;

export function Home() {
  const bridge = useMemo(() => desktopBridge(), []);
  const [tab, setTab] = useState<Tab>('search');
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [stats, setStats] = useState<[number, number]>([0, 0]);

  // Free until billing says otherwise. The desktop app has no session of its
  // own yet, so this is the honest default rather than an optimistic one.
  const plan = entitlementsFor('free');

  useEffect(() => {
    if (!bridge) return;
    void bridge.recentWork(200).then((rows) => setSessions(rows as WorkSession[]));
    void bridge.indexStats().then(setStats);
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
        {tab === 'search' && <Search bridge={bridge} historyDays={plan.historyDays} />}
        {tab === 'handovers' && <Handovers />}
        {tab === 'sources' && <Sources sessions={sessions} />}
      </main>
    </div>
  );
}

/* ── Search ───────────────────────────────────────────────────────────────── */

function Search({
  bridge,
  historyDays,
}: {
  bridge: ReturnType<typeof desktopBridge>;
  historyDays: number;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [withheld, setWithheld] = useState(0);
  const [searched, setSearched] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  /*
   * The window the plan allows, as a timestamp.
   *
   * Sent to Rust and applied in SQL. Doing it here would be decoration: the
   * point of a limit is that it holds when somebody edits the page.
   */
  const since = isUnlimited(historyDays) ? 0 : Date.now() - historyDays * DAY_MS;

  const run = useCallback(
    (q: string) => {
      if (!bridge || q.trim().length < 2) {
        setHits([]);
        setWithheld(0);
        setSearched(false);
        return;
      }
      void bridge.searchConversations(q, since, 50).then(([found, older]) => {
        setHits(found);
        setWithheld(older);
        setSearched(true);
      });
    },
    [bridge, since],
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
      {withheld > 0 && (
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
          Every conversation from Claude Code, Cowork, Cursor and anything the extension has
          captured, searched together. Nobody else can do this: no assistant can read another
          one&rsquo;s history, and this is the only place yours sits in one pile.
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

function Handovers() {
  /*
   * Deliberately not a list yet.
   *
   * Handovers are written to Downloads and nothing records them, so any list
   * here would be invented. Saying that plainly is the only honest thing this
   * panel can do until the app keeps its own record, and it is a better
   * placeholder than a fake row.
   */
  return (
    <>
      <h1 className="font-display text-[1.5rem] tracking-[-0.03em]">Handovers</h1>
      <p className="mt-4 max-w-[54ch] text-[0.875rem] leading-relaxed text-white/45">
        Every handover is written to your Downloads folder as a Markdown file, so nothing is
        lost to a misclick the way a clipboard is. Sidq does not yet keep its own record of
        them, so there is no list here — when it does, this is where it will be.
      </p>
      <p className="mt-3 text-[0.8125rem] text-white/30">
        Look for files starting with the conversation&rsquo;s name in Downloads.
      </p>
    </>
  );
}

/* ── Sources ──────────────────────────────────────────────────────────────── */

/** Everything Sidq can read, and how. Counts come from what was actually found. */
const SOURCES: { id: string; label: string; local: boolean }[] = [
  { id: 'claude-code', label: 'Claude Code', local: true },
  { id: 'cowork', label: 'Claude Cowork', local: true },
  { id: 'cursor', label: 'Cursor, Windsurf, VS Code', local: true },
  { id: 'chatgpt', label: 'ChatGPT', local: false },
  { id: 'claude', label: 'Claude.ai', local: false },
  { id: 'gemini', label: 'Gemini', local: false },
  { id: 'perplexity', label: 'Perplexity', local: false },
  { id: 'grok', label: 'Grok', local: false },
  { id: 'deepseek', label: 'DeepSeek', local: false },
  { id: 'mistral', label: 'Mistral', local: false },
];

function Sources({ sessions }: { sessions: WorkSession[] }) {
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
        The ones on this Mac are read with nothing to set up. The rest keep nothing readable
        on your machine, so they come through the browser extension.
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
