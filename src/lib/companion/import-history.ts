import type { WorkSession } from './work-history';

/*
 * Importing the assistants that cannot be read live.
 *
 * Claude Code writes plain JSONL to disk, so Sidq reads it continuously. The
 * other two cannot work that way and it is worth being precise about why,
 * because the difference decides the whole design:
 *
 *   ChatGPT — the desktop app keeps conversations at
 *             ~/Library/Application Support/com.openai.chat/conversations-v3-*
 *             and they are encrypted. Not obfuscated: high-entropy binary with
 *             no readable strings. Attempting to decrypt somebody else's local
 *             cache is not a feature, it is an incident waiting to happen.
 *
 *   Gemini  — no local store at all. It is a web product.
 *
 * So both come in through the officially supported route: you export your own
 * data and drop the file here. One drag, occasionally, and it is the first time
 * anything has ever joined that history to anything else.
 *
 * Parsed entirely in the browser. The file is read with FileReader, reduced to
 * titles and timestamps, and the original is never uploaded, never stored, and
 * never leaves the machine.
 */

export type ImportSource = 'chatgpt' | 'gemini';

export interface ImportResult {
  source: ImportSource;
  sessions: WorkSession[];
  /** How many entries were in the file, before filtering. */
  seen: number;
}

export class UnknownExportError extends Error {
  constructor() {
    super('That does not look like a ChatGPT or Gemini export.');
    this.name = 'UnknownExportError';
  }
}

/** Titles are hints. Anything longer is a paragraph nobody reads. */
const MAX_TITLE = 120;
/** Older than this is archaeology; the resume window is 72h anyway. */
const MAX_AGE_DAYS = 30;

/**
 * Parse an export, whichever it is.
 *
 * The format is detected from the shape rather than the filename, because
 * people rename downloads and `conversations (3).json` should still work.
 */
export function parseExport(raw: string, now: number = Date.now()): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new UnknownExportError();
  }

  if (!Array.isArray(data)) throw new UnknownExportError();
  if (data.length === 0) return { source: 'chatgpt', sessions: [], seen: 0 };

  const first = data[0] as Record<string, unknown>;

  // ChatGPT conversations carry a `mapping` of message nodes; Google's My
  // Activity export carries `header` and a `time` string. Neither has the
  // other's fields, so one probe each is enough.
  if ('mapping' in first || 'update_time' in first) {
    return { source: 'chatgpt', sessions: fromChatGpt(data, now), seen: data.length };
  }
  if ('header' in first || 'titleUrl' in first) {
    return { source: 'gemini', sessions: fromGemini(data, now), seen: data.length };
  }

  throw new UnknownExportError();
}

/*
 * ChatGPT: one object per conversation.
 *
 * `update_time` is seconds, not milliseconds, and getting that wrong puts every
 * conversation in 1970 where the age filter silently drops all of them.
 */
function fromChatGpt(rows: unknown[], now: number): WorkSession[] {
  return rows
    .map((row) => {
      const r = row as Record<string, unknown>;
      const seconds = typeof r.update_time === 'number' ? r.update_time : Number(r.create_time);
      if (!Number.isFinite(seconds)) return null;

      const title = typeof r.title === 'string' ? r.title : '';
      if (!title.trim()) return null;

      return session('ChatGPT', title, seconds * 1000);
    })
    .filter((s): s is WorkSession => s !== null)
    .filter((s) => withinWindow(s.endedAt, now));
}

/*
 * Gemini, via Google Takeout's My Activity export.
 *
 * Titles arrive as "Prompted <what you asked>", and the prefix is noise in
 * every single one, so it is stripped rather than shown a hundred times.
 */
function fromGemini(rows: unknown[], now: number): WorkSession[] {
  return rows
    .map((row) => {
      const r = row as Record<string, unknown>;
      const time = typeof r.time === 'string' ? Date.parse(r.time) : NaN;
      if (!Number.isFinite(time)) return null;

      const rawTitle = typeof r.title === 'string' ? r.title : '';
      const title = rawTitle.replace(/^(Prompted|Asked|Searched for)\s+/i, '').trim();
      if (!title) return null;

      return session('Gemini', title, time);
    })
    .filter((s): s is WorkSession => s !== null)
    .filter((s) => withinWindow(s.endedAt, now));
}

function session(projectName: string, title: string, endedAt: number): WorkSession {
  return {
    project: projectName,
    projectName,
    title: truncate(title, MAX_TITLE),
    // Exports carry no "where you stopped" marker, unlike a Claude Code
    // transcript. The title is the whole signal, so it is not duplicated into
    // lastPrompt: an empty field is honest and the resume logic already falls
    // back to the title.
    lastPrompt: '',
    branch: '',
    endedAt,
  };
}

function withinWindow(at: number, now: number): boolean {
  const age = (now - at) / 86_400_000;
  // Future timestamps mean a broken clock somewhere, not a session tomorrow.
  return age >= 0 && age <= MAX_AGE_DAYS;
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

/*
 * Imported sessions, kept.
 *
 * Separate from the live Claude Code read, which is re-done on every launch. An
 * export is a snapshot: it has to persist or the drag has to be repeated every
 * time the app opens, which would make the whole feature not worth using.
 */
const KEY = 'sidq.imported.sessions';

export function loadImported(now: number = Date.now()): WorkSession[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WorkSession[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => s && typeof s.endedAt === 'number' && withinWindow(s.endedAt, now));
  } catch {
    return [];
  }
}

/**
 * Merge an import into what is already stored.
 *
 * Deduplicated on source plus title plus timestamp, so dropping the same export
 * twice, which people will do, does not double every entry.
 */
export function saveImported(incoming: WorkSession[], now: number = Date.now()): WorkSession[] {
  const existing = loadImported(now);
  const byKey = new Map<string, WorkSession>();

  for (const s of [...existing, ...incoming]) {
    byKey.set(`${s.projectName}|${s.title}|${s.endedAt}`, s);
  }

  const merged = [...byKey.values()].sort((a, b) => b.endedAt - a.endedAt).slice(0, 500);

  try {
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    /* Quota or private mode. The in-memory result still returns. */
  }

  return merged;
}

export function clearImported(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing worth reporting */
  }
}
