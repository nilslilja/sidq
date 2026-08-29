//! The index. Every conversation, searchable, on this machine.
//!
//! This is the part that was missing, and its absence is why the product felt
//! thin. Every action re-read files from scratch and remembered nothing, so the
//! only thing the data could be used for was the one action you asked for at the
//! moment you asked for it.
//!
//! With an index, the asset becomes usable: you have every conversation you have
//! had with every assistant, in one place, and nobody else can build that.
//! OpenAI cannot read your Claude history and Anthropic cannot read your ChatGPT.
//!
//! ── Why FTS5 and not embeddings ──────────────────────────────────────────────
//! SQLite's full-text search answers "what did I decide about the retry logic"
//! well, instantly, for free, offline. Embeddings would improve recall on
//! paraphrases, and the good ones run in the cloud — which would mean your
//! conversation text leaving the machine, and would force the badge, the FAQ and
//! the privacy page to stop saying it never does. That is a real cost for a
//! marginal gain, so it is not the first move. The schema leaves room to add a
//! vector column later without a migration.
//!
//! ── Why a separate database from the sources ─────────────────────────────────
//! The readers open Cursor's own SQLite read-only and must never write to it.
//! This is Sidq's own file, in Sidq's own directory, so indexing can never
//! corrupt somebody's editor history.

use rusqlite::{params, Connection, OpenFlags};
use serde::Serialize;
use std::path::PathBuf;

/// Bumped when the schema changes in a way that needs a rebuild.
///
/// 2 added `settings` and `handovers`. Every statement below is
/// `IF NOT EXISTS`, so a bump costs one extra pass over an existing index and
/// never rebuilds what is already there — but without the bump, an index
/// created before the change would skip the new tables entirely and every read
/// of them would fail on a machine that had run an earlier build.
/*
 * 3 adds `transcript_digest`. Everything here is CREATE TABLE IF NOT EXISTS and
 * the whole batch is skipped once user_version has caught up, so a new table
 * only reaches an existing install if this number moves.
 */
const SCHEMA_VERSION: i64 = 3;

/// One indexed exchange, as the search UI needs it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub session_id: String,
    pub source: String,
    pub title: String,
    pub project: String,
    pub ended_at: i64,
    /// The matching text, with the query terms marked by FTS5.
    pub snippet: String,
}

fn db_path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    let dir = PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("app.sidq.desktop");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("index.sqlite"))
}

/// Open Sidq's own index, creating it on first use.
pub fn open() -> Option<Connection> {
    let path = db_path()?;
    let conn = Connection::open_with_flags(
        &path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE,
    )
    .ok()?;

    /*
     * WAL, because indexing runs on a background thread while the picker reads.
     * The default journal takes a write lock that would block a search for as
     * long as an index pass takes.
     */
    let _ = conn.pragma_update(None, "journal_mode", "WAL");
    let _ = conn.pragma_update(None, "synchronous", "NORMAL");

    migrate(&conn)?;
    Some(conn)
}

fn migrate(conn: &Connection) -> Option<()> {
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .unwrap_or(0);

    if version >= SCHEMA_VERSION {
        return Some(());
    }

    /*
     * `sessions` holds what the picker lists; `messages` is the searchable text.
     *
     * They are separate because listing must stay fast and must never load
     * conversation bodies — the same split the readers already enforce for
     * privacy reasons, carried into storage.
     */
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS sessions (
            session_id     TEXT PRIMARY KEY,
            source         TEXT NOT NULL,
            title          TEXT NOT NULL DEFAULT '',
            project        TEXT NOT NULL DEFAULT '',
            branch         TEXT NOT NULL DEFAULT '',
            ended_at       INTEGER NOT NULL DEFAULT 0,
            turns          INTEGER NOT NULL DEFAULT 0,
            active_minutes INTEGER NOT NULL DEFAULT 0,
            indexed_at     INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS sessions_ended ON sessions(ended_at DESC);

        -- Contentless would halve the size but cannot return snippets, and a
        -- search result without the matching line is not a search result.
        CREATE VIRTUAL TABLE IF NOT EXISTS messages USING fts5(
            session_id UNINDEXED,
            role       UNINDEXED,
            body,
            tokenize = 'porter unicode61'
        );

        -- What has already been read, so a pass can skip unchanged transcripts
        -- instead of reparsing tens of megabytes every few minutes.
        CREATE TABLE IF NOT EXISTS seen (
            session_id TEXT PRIMARY KEY,
            fingerprint TEXT NOT NULL
        );

        -- Small facts the app has to remember between launches: which tier this
        -- account is on, when that was last confirmed, and the token used to
        -- confirm it. Not conversation content, and it never leaves the machine
        -- except as an Authorization header to the account's own provider.
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- One row per conversation handed over, so the weekly limit is counted
        -- against something durable rather than against a number the page holds
        -- in memory and forgets on reload.
        CREATE TABLE IF NOT EXISTS handovers (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            made_at    INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS handovers_made ON handovers(made_at DESC);

        /*
         * ── What the picker already worked out about a transcript ──────────
         *
         * Listing recent work meant reading and scanning every JSONL on the
         * machine, every time the pill was opened. Measured on one real Mac:
         * 157MB across fifteen sessions, 1.5 seconds, on the one interaction
         * in the product that has to be instant — and growing with every day
         * of use, because these files only ever get longer.
         *
         * Almost none of it changes. One transcript is being appended to; the
         * rest have been finished for days. So the derived row is kept here
         * against the file's size and modification time, and a scan becomes a
         * stat of each file plus a re-read of the one that moved.
         *
         * Keyed by path rather than session id: the id comes from the filename,
         * and the same conversation copied to a second location is a second
         * file with its own mtime.
         */
        CREATE TABLE IF NOT EXISTS transcript_digest (
            path           TEXT PRIMARY KEY,
            mtime          INTEGER NOT NULL,
            size           INTEGER NOT NULL,
            session_id     TEXT NOT NULL,
            project        TEXT NOT NULL,
            project_name   TEXT NOT NULL,
            title          TEXT NOT NULL,
            last_prompt    TEXT NOT NULL,
            branch         TEXT NOT NULL,
            ended_at       INTEGER NOT NULL,
            turns          INTEGER NOT NULL,
            active_minutes INTEGER NOT NULL
        );
        ",
    )
    .ok()?;

    conn.pragma_update(None, "user_version", SCHEMA_VERSION).ok()?;
    Some(())
}

/// Read one remembered fact. `None` when it was never written.
pub fn setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [key],
        |row| row.get::<_, String>(0),
    )
    .ok()
}

/// Write one remembered fact, replacing whatever was there.
pub fn put_setting(conn: &Connection, key: &str, value: &str) -> Option<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    .ok()
    .map(|_| ())
}

/// Record that a conversation was handed over, at a moment in seconds.
/**
 * Whether this conversation has been seen before.
 *
 * Asked by the screen sweep before it writes, because `put_session` replaces
 * and would otherwise make a conversation appearing for the first time
 * indistinguishable from one that simply grew by a turn. Only the first is
 * worth a sound and a notification.
 */
/**
 * Delete page furniture recorded before the reader learned to drop it.
 *
 * ── Why the index needs repairing and not just the reader ────────────────────
 * Until this was fixed, everything the screen reader could not identify as a
 * person's turn was filed as the assistant, so a browser conversation arrived
 * with the sidebar, the header and every button attached to the front of it as
 * one enormous reply. On a real index that was 159 of 418 lines: the title of
 * every other conversation on the account, medical ones included.
 *
 * Fixing the reader stops new ones. It does nothing for what is already stored,
 * and stored is where it matters — a handover made tomorrow from a conversation
 * captured last week would still carry the whole list into a file handed to a
 * different AI. The conversation is only re-read if it happens to be opened
 * again, which may be never.
 *
 * The rule is the one the reader now applies, run backwards over the rows: a
 * conversation starts with the person, so any assistant message stored before
 * the first thing they said is furniture. Ordering is `rowid`, which is
 * insertion order, which is reading order — `put_messages` writes a
 * conversation in one pass, front to back.
 *
 * Runs once, then records that it has. Returns how many rows went, so the count
 * is visible rather than assumed.
 */
pub fn strip_page_furniture(conn: &Connection) -> usize {
    conn.execute(
        "DELETE FROM messages
          WHERE role = 'Assistant'
            AND rowid < (
              SELECT MIN(rowid) FROM messages inner_m
               WHERE inner_m.session_id = messages.session_id
                 AND inner_m.role = 'You'
            )",
        [],
    )
    .unwrap_or(0)
}

/// The same repair, but only the first time this version of Sidq runs.
pub fn repair_once(conn: &Connection) {
    const DONE: &str = "furniture_stripped";
    if setting(conn, DONE).is_some() {
        return;
    }
    let removed = strip_page_furniture(conn);
    if removed > 0 {
        eprintln!("sidq: removed {removed} rows of page furniture from earlier captures");
    }
    let _ = put_setting(conn, DONE, "1");
}

pub fn has_session(conn: &Connection, session_id: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM sessions WHERE session_id = ?1",
        [session_id],
        |_| Ok(()),
    )
    .is_ok()
}

pub fn record_handover(conn: &Connection, session_id: &str, made_at: i64) -> Option<()> {
    conn.execute(
        "INSERT INTO handovers (session_id, made_at) VALUES (?1, ?2)",
        (session_id, made_at),
    )
    .ok()
    .map(|_| ())
}

/**
 * How many handovers have been made since a moment.
 *
 * Every one counts, including the same conversation handed over twice. Making
 * repeats free sounds generous and is really an instruction: hand over the same
 * conversation ten times and the limit never moves.
 */
pub fn handovers_since(conn: &Connection, since: i64) -> u32 {
    conn.query_row(
        "SELECT COUNT(*) FROM handovers WHERE made_at >= ?1",
        [since],
        |row| row.get::<_, i64>(0),
    )
    .map(|n| n.max(0) as u32)
    .unwrap_or(0)
}

/**
 * Every turn you typed, newest conversation first.
 *
 * Your side only. The profile is built from what you have told assistants, and
 * an assistant's own words are not evidence of anything about you — including
 * them would fill the profile with things models say a lot, which is roughly
 * the opposite of a personal profile.
 */
pub fn own_turns(conn: &Connection, limit: usize) -> Vec<(String, String)> {
    let Ok(mut stmt) = conn.prepare(
        "SELECT m.session_id, m.body
           FROM messages m
           JOIN sessions s ON s.session_id = m.session_id
          WHERE m.role = 'You'
          ORDER BY s.ended_at DESC
          LIMIT ?1",
    ) else {
        return Vec::new();
    };

    stmt.query_map([limit], |row| Ok((row.get(0)?, row.get(1)?)))
        .map(|rows| rows.filter_map(Result::ok).collect())
        .unwrap_or_default()
}

/**
 * The same turns, keyed by which piece of work they belong to.
 *
 * ── Why the handover needs a different key ───────────────────────────────────
 * `own_turns` groups by conversation, so `Fact.conversations` counts how many
 * separate chats a sentence appeared in. That is the right number to show in
 * the window: it is evidence, and more chats means a firmer rule.
 *
 * It is the wrong test for what to attach to a handover. Somebody building one
 * thing says "make sure the pricing matches the app" in ten conversations about
 * that thing, and it clears any threshold on repetition alone — then arrives
 * stapled to a conversation about being exhausted, under a heading promising
 * these are standing instructions to apply. Which is how a real handover read.
 *
 * Repetition inside one project is a task. The same sentence turning up in a
 * second, unrelated project is a preference. That distinction is the whole
 * difference, and it is one join away: group by project instead.
 *
 * `source` stands in when there is no project, which is every browser
 * assistant — so a rule said to both ChatGPT and Gemini still counts as twice.
 */
pub fn own_turns_by_project(conn: &Connection, limit: usize) -> Vec<(String, String)> {
    let Ok(mut stmt) = conn.prepare(
        "SELECT CASE WHEN s.project = '' THEN s.source ELSE s.project END, m.body
           FROM messages m
           JOIN sessions s ON s.session_id = m.session_id
          WHERE m.role = 'You'
          ORDER BY s.ended_at DESC
          LIMIT ?1",
    ) else {
        return Vec::new();
    };

    stmt.query_map([limit], |row| Ok((row.get(0)?, row.get(1)?)))
        .map(|rows| rows.filter_map(Result::ok).collect())
        .unwrap_or_default()
}

/// One conversation you handed to another assistant.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Handover {
    pub session_id: String,
    pub made_at: i64,
    /// From the index, so a handover of a since-deleted conversation still
    /// shows something rather than a bare uuid.
    pub title: String,
    pub source: String,
    pub project: String,
}

/// Handovers made, newest first.
pub fn recent_handovers(conn: &Connection, limit: usize) -> Vec<Handover> {
    let Ok(mut stmt) = conn.prepare(
        "SELECT h.session_id, h.made_at,
                COALESCE(s.title, ''), COALESCE(s.source, ''), COALESCE(s.project, '')
           FROM handovers h
           LEFT JOIN sessions s ON s.session_id = h.session_id
          ORDER BY h.made_at DESC
          LIMIT ?1",
    ) else {
        return Vec::new();
    };

    stmt.query_map([limit], |row| {
        Ok(Handover {
            session_id: row.get(0)?,
            made_at: row.get(1)?,
            title: row.get(2)?,
            source: row.get(3)?,
            project: row.get(4)?,
        })
    })
    .map(|rows| rows.filter_map(Result::ok).collect())
    .unwrap_or_default()
}

/**
 * Rebuild a conversation from the index.
 *
 * The fallback for everything that has no file on disk: claude.ai imports and
 * conversations the extension read out of a browser tab. Both were indexed and
 * searchable and neither could be handed over, because the handover path went
 * looking for a transcript file and found nothing.
 */
/**
 * The conversations that exist only in the index.
 *
 * Everything read out of a browser window lives here and nowhere else: there is
 * no file on disk to enumerate, which is the entire reason the screen reader
 * exists. The disk readers are asked separately and cover claude-code, cowork
 * and cursor, so those three are excluded here rather than returned twice.
 *
 * Returned as raw tuples because the caller owns the shape the picker wants and
 * this module has no business knowing about it.
 */
pub fn recent_screen_sessions(
    conn: &Connection,
    limit: usize,
) -> Vec<(String, String, String, i64, u32)> {
    let mut stmt = match conn.prepare(
        "SELECT session_id, title, source, ended_at, turns
           FROM sessions
          WHERE source NOT IN ('claude-code', 'cowork', 'cursor')
          ORDER BY ended_at DESC
          LIMIT ?1",
    ) {
        Ok(stmt) => stmt,
        Err(_) => return Vec::new(),
    };

    let rows = stmt.query_map([limit as i64], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i64>(3)?,
            row.get::<_, i64>(4)? as u32,
        ))
    });

    match rows {
        Ok(rows) => rows.filter_map(Result::ok).collect(),
        Err(_) => Vec::new(),
    }
}

pub fn session_transcript(conn: &Connection, session_id: &str) -> Option<String> {
    let mut stmt = conn
        .prepare("SELECT role, body FROM messages WHERE session_id = ?1")
        .ok()?;

    let turns: Vec<String> = stmt
        .query_map([session_id], |row| {
            Ok(format!(
                "{}:\n{}",
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?
            ))
        })
        .ok()?
        .filter_map(Result::ok)
        .collect();

    (!turns.is_empty()).then(|| turns.join("\n\n"))
}

/**
 * The same conversation, still in turns.
 *
 * `session_transcript` flattens it to one string with "You:" and "Assistant:"
 * written in as text, which is right for search and wrong for a handover: the
 * compiler was handed that string as a single turn attributed to the person, so
 * a browser conversation arrived as one enormous thing they had said, with the
 * speaker labels sitting inside it as content.
 *
 * Everything downstream then read wrong. The summary quoted "You:\nthen it
 * sucks" as the opening line, the count said one exchange for a conversation
 * with six, and the whole reply side was filed as the person.
 *
 * `rowid` is insertion order, which is reading order: `put_messages` writes a
 * conversation front to back in one pass.
 */
pub fn session_turns(conn: &Connection, session_id: &str) -> Vec<(String, String)> {
    let Ok(mut stmt) = conn
        .prepare("SELECT role, body FROM messages WHERE session_id = ?1 ORDER BY rowid")
    else {
        return Vec::new();
    };

    stmt.query_map([session_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map(|rows| rows.filter_map(Result::ok).collect())
        .unwrap_or_default()
}

/// Has this transcript already been indexed in exactly this state?
pub fn is_current(conn: &Connection, session_id: &str, fingerprint: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM seen WHERE session_id = ?1 AND fingerprint = ?2",
        params![session_id, fingerprint],
        |_| Ok(()),
    )
    .is_ok()
}

/**
 * How much of this conversation is already stored, in characters.
 *
 * Asked so a later read cannot make a conversation smaller. `put_messages`
 * deletes and reinserts, so a sweep that catches a page holding less than the
 * last one throws away the difference — and pages do hold less: these sites
 * unload the top of a long conversation once you scroll away from it.
 *
 * Which made the one instruction worth giving useless. Scroll to the top, wait
 * for Sidq to read the whole thing, scroll back down to carry on, and the next
 * sweep quietly replaced it with the tail again. Seen on a real index: a
 * handover made at twelve turns, and six left in the row afterwards.
 */
pub fn stored_length(conn: &Connection, session_id: &str) -> usize {
    conn.query_row(
        "SELECT COALESCE(SUM(LENGTH(body)), 0) FROM messages WHERE session_id = ?1",
        [session_id],
        |row| row.get::<_, i64>(0),
    )
    .map(|n| n.max(0) as usize)
    .unwrap_or(0)
}

/// Metadata for one session, replacing any earlier version of it.
#[allow(clippy::too_many_arguments)]
pub fn put_session(
    conn: &Connection,
    session_id: &str,
    source: &str,
    title: &str,
    project: &str,
    branch: &str,
    ended_at: i64,
    turns: u32,
    active_minutes: u32,
) -> Option<()> {
    conn.execute(
        "INSERT INTO sessions
           (session_id, source, title, project, branch, ended_at, turns, active_minutes, indexed_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
         ON CONFLICT(session_id) DO UPDATE SET
           source=excluded.source, title=excluded.title, project=excluded.project,
           branch=excluded.branch, ended_at=excluded.ended_at, turns=excluded.turns,
           active_minutes=excluded.active_minutes, indexed_at=excluded.indexed_at",
        params![
            session_id,
            source,
            title,
            project,
            branch,
            ended_at,
            turns,
            active_minutes,
            now_millis()
        ],
    )
    .ok()?;
    Some(())
}

/**
 * Replace the indexed text of one session.
 *
 * Deletes first: a conversation grows as it is continued, so re-indexing without
 * clearing would leave every earlier copy of every message in the index and a
 * search would return the same line five times.
 */
pub fn put_messages(
    conn: &Connection,
    session_id: &str,
    messages: &[(String, String)],
    fingerprint: &str,
) -> Option<()> {
    conn.execute("DELETE FROM messages WHERE session_id = ?1", params![session_id])
        .ok()?;

    {
        let mut stmt = conn
            .prepare("INSERT INTO messages (session_id, role, body) VALUES (?1,?2,?3)")
            .ok()?;
        for (role, body) in messages {
            if body.trim().is_empty() {
                continue;
            }
            stmt.execute(params![session_id, role, body]).ok()?;
        }
    }

    conn.execute(
        "INSERT INTO seen (session_id, fingerprint) VALUES (?1,?2)
         ON CONFLICT(session_id) DO UPDATE SET fingerprint = excluded.fingerprint",
        params![session_id, fingerprint],
    )
    .ok()?;
    Some(())
}

/**
 * Search every indexed conversation.
 *
 * `since` is the free plan's history window: matches older than it are counted
 * but not returned, so the UI can say how many are being withheld without ever
 * having their text. The filter is applied in SQL rather than in the client for
 * the obvious reason.
 */
pub fn search(conn: &Connection, query: &str, since: i64, limit: usize) -> (Vec<SearchHit>, usize) {
    let cleaned = sanitise(query);
    if cleaned.is_empty() {
        return (Vec::new(), 0);
    }

    let hits = conn
        .prepare(
            "SELECT m.session_id, s.source, s.title, s.project, s.ended_at,
                    snippet(messages, 2, '«', '»', '…', 18)
             FROM messages m
             JOIN sessions s ON s.session_id = m.session_id
             WHERE messages MATCH ?1 AND s.ended_at >= ?2
             ORDER BY s.ended_at DESC
             LIMIT ?3",
        )
        .and_then(|mut stmt| {
            let rows = stmt.query_map(params![cleaned, since, limit as i64], |r| {
                Ok(SearchHit {
                    session_id: r.get(0)?,
                    source: r.get(1)?,
                    title: r.get(2)?,
                    project: r.get(3)?,
                    ended_at: r.get(4)?,
                    snippet: r.get(5)?,
                })
            })?;
            Ok(rows.flatten().collect::<Vec<_>>())
        })
        .unwrap_or_default();

    // Older matches, counted only. This is the number the paywall shows.
    let withheld: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT m.session_id)
             FROM messages m JOIN sessions s ON s.session_id = m.session_id
             WHERE messages MATCH ?1 AND s.ended_at < ?2",
            params![cleaned, since],
            |r| r.get(0),
        )
        .unwrap_or(0);

    (hits, withheld.max(0) as usize)
}

/**
 * Make a user's typing safe for FTS5.
 *
 * FTS5 has its own query syntax, so a stray quote or a bare `NOT` is a syntax
 * error rather than a search. Everything is reduced to quoted terms, which means
 * a search can never fail because somebody typed an apostrophe.
 */
fn sanitise(query: &str) -> String {
    query
        .split_whitespace()
        .map(|term| term.chars().filter(|c| c.is_alphanumeric() || *c == '-').collect::<String>())
        // A term must carry at least one letter or digit. Stripping punctuation
        // can leave a bare "--", which FTS5 accepts as a token and then matches
        // nothing, so a search containing a dash silently returned no results.
        .filter(|term| term.chars().any(|c| c.is_alphanumeric()))
        .map(|term| format!("\"{term}\""))
        .collect::<Vec<_>>()
        .join(" ")
}

/// How many conversations and messages are indexed. Real numbers for the stats.
pub fn counts(conn: &Connection) -> (usize, usize) {
    let sessions: i64 = conn
        .query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0))
        .unwrap_or(0);
    let messages: i64 = conn
        .query_row("SELECT COUNT(*) FROM messages", [], |r| r.get(0))
        .unwrap_or(0);
    (sessions as usize, messages as usize)
}

pub fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// An in-memory index with the real schema. Shared with `entitlement`.
    pub(crate) fn memory() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        conn
    }

    fn a_digest(title: &str) -> Digest {
        Digest {
            session_id: "abc".into(),
            project: "/Users/x/Sidq".into(),
            project_name: "Sidq".into(),
            title: title.into(),
            last_prompt: "carry on".into(),
            branch: "main".into(),
            ended_at: 1_700_000_000_000,
            turns: 12,
            active_minutes: 40,
        }
    }

    /*
     * ── The cache must never answer for a file that moved ────────────────────
     *
     * It exists because listing recent work meant reading every transcript on
     * the machine: 157MB and 1.5 seconds on one real Mac, on every press of the
     * shortcut. The whole saving comes from trusting a remembered row, so the
     * condition for trusting it is the only thing worth testing. A stale title
     * in the picker would be worse than the wait it replaced.
     */
    #[test]
    fn a_remembered_transcript_comes_back() {
        let conn = memory();
        remember_digest(&conn, "/t/a.jsonl", 100, 500, &a_digest("Pricing page copy"));

        let found = digest(&conn, "/t/a.jsonl", 100, 500).expect("same file, same answer");
        assert_eq!(found.title, "Pricing page copy");
        assert_eq!(found.turns, 12);
    }

    #[test]
    fn a_transcript_that_grew_is_read_again() {
        let conn = memory();
        remember_digest(&conn, "/t/a.jsonl", 100, 500, &a_digest("Pricing page copy"));

        // Appended to: same mtime is impossible in practice, but size alone has
        // to be enough, because that is the case this is protecting against.
        assert!(digest(&conn, "/t/a.jsonl", 100, 900).is_none());
        assert!(digest(&conn, "/t/a.jsonl", 200, 500).is_none());
    }

    #[test]
    fn re_reading_replaces_the_row_rather_than_adding_one() {
        let conn = memory();
        remember_digest(&conn, "/t/a.jsonl", 100, 500, &a_digest("Old title"));
        remember_digest(&conn, "/t/a.jsonl", 200, 900, &a_digest("New title"));

        let rows: i64 = conn
            .query_row("SELECT COUNT(*) FROM transcript_digest", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 1, "one row per path, not one per version");
        assert_eq!(digest(&conn, "/t/a.jsonl", 200, 900).unwrap().title, "New title");
    }

    #[test]
    fn a_deleted_conversation_stops_being_remembered() {
        let conn = memory();
        remember_digest(&conn, "/t/a.jsonl", 1, 1, &a_digest("Still here"));
        remember_digest(&conn, "/t/gone.jsonl", 1, 1, &a_digest("Deleted"));

        forget_missing_digests(&conn, &["/t/a.jsonl".to_string()]);

        assert!(digest(&conn, "/t/a.jsonl", 1, 1).is_some());
        assert!(digest(&conn, "/t/gone.jsonl", 1, 1).is_none());
    }

    /*
     * An empty scan is a scan that found nothing, which happens when the
     * transcript directories are missing entirely. Treating it as "everything
     * was deleted" would throw the cache away every time a reader was absent.
     */
    #[test]
    fn a_scan_that_saw_nothing_deletes_nothing() {
        let conn = memory();
        remember_digest(&conn, "/t/a.jsonl", 1, 1, &a_digest("Still here"));

        forget_missing_digests(&conn, &[]);

        assert!(digest(&conn, "/t/a.jsonl", 1, 1).is_some());
    }

    fn seed(conn: &Connection, id: &str, ended_at: i64, body: &str) {
        put_session(conn, id, "claude-code", "A conversation", "Sidq", "main", ended_at, 10, 30)
            .unwrap();
        put_messages(conn, id, &[("You".into(), body.into())], "fp").unwrap();
    }

    #[test]
    fn the_sidebar_is_stripped_out_of_conversations_captured_earlier() {
        /*
         * Fixing the reader stops new captures carrying the sidebar. It does
         * nothing for the ones already stored, and those are the ones a
         * handover is made from — the conversation is only re-read if it
         * happens to be opened again, which may be never.
         *
         * Modelled on the real rows: one assistant block of furniture, then the
         * conversation.
         */
        let conn = memory();
        put_session(&conn, "s", "gemini", "A Friendly Greeting", "", "", 1, 4, 0).unwrap();
        put_messages(
            &conn,
            "s",
            &[
                ("Assistant".into(), "Gemini\nNew chat\nMouth Widening Surgery".into()),
                ("You".into(), "the chain keeps hopping off".into()),
                ("Assistant".into(), "That usually means it is slack.".into()),
                ("You".into(), "by how much".into()),
            ],
            "fp",
        )
        .unwrap();

        let removed = strip_page_furniture(&conn);

        assert_eq!(removed, 1, "only the block before the first thing they said");
        let (hits, _) = search(&conn, "Mouth", 0, 10);
        assert!(hits.is_empty(), "another conversation's title is gone");
        let (kept, _) = search(&conn, "slack", 0, 10);
        assert_eq!(kept.len(), 1, "and the conversation itself is untouched");
    }

    #[test]
    fn a_reply_after_the_person_speaks_is_never_stripped() {
        // The rule is positional, so it has to be exactly positional: an
        // assistant turn is furniture only when nothing was asked before it.
        let conn = memory();
        put_session(&conn, "s", "gemini", "Fine", "", "", 1, 2, 0).unwrap();
        put_messages(
            &conn,
            "s",
            &[
                ("You".into(), "first question".into()),
                ("Assistant".into(), "an answer worth keeping".into()),
            ],
            "fp",
        )
        .unwrap();

        assert_eq!(strip_page_furniture(&conn), 0);
        assert_eq!(search(&conn, "worth", 0, 10).0.len(), 1);
    }

    #[test]
    fn the_repair_runs_once_and_says_so() {
        let conn = memory();
        put_session(&conn, "s", "gemini", "x", "", "", 1, 2, 0).unwrap();
        put_messages(
            &conn,
            "s",
            &[("Assistant".into(), "furniture".into()), ("You".into(), "hello".into())],
            "fp",
        )
        .unwrap();

        repair_once(&conn);
        assert!(search(&conn, "furniture", 0, 10).0.is_empty());

        // A second call must not run again, or every launch pays for a scan of
        // the whole index to find nothing.
        assert_eq!(setting(&conn, "furniture_stripped").as_deref(), Some("1"));
    }

    #[test]
    fn finds_a_phrase_across_conversations() {
        let conn = memory();
        seed(&conn, "a", 2_000, "we decided the retry drops the second event");
        seed(&conn, "b", 1_000, "something entirely unrelated about mangos");

        let (hits, _) = search(&conn, "retry", 0, 10);

        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].session_id, "a");
        assert!(hits[0].snippet.contains("retry"));
    }

    #[test]
    fn counts_older_matches_without_returning_them() {
        // This is the paywall: the number is real, the text is not handed over.
        let conn = memory();
        seed(&conn, "recent", 5_000, "the retry logic");
        seed(&conn, "old", 100, "the retry logic again");

        let (hits, withheld) = search(&conn, "retry", 1_000, 10);

        assert_eq!(hits.len(), 1, "only the recent one is returned");
        assert_eq!(hits[0].session_id, "recent");
        assert_eq!(withheld, 1, "the older one is counted");
    }

    #[test]
    fn a_query_with_punctuation_searches_instead_of_erroring() {
        /*
         * FTS5 treats quotes, parentheses and bare NOT as syntax. Passing raw
         * input through means a search fails outright because somebody typed an
         * apostrophe, which looks like the feature is broken.
         */
        let conn = memory();
        seed(&conn, "a", 1, "the retry logic");

        // Punctuation around a real term is stripped, so these still match.
        for query in ["retry'", "\"retry", "retry!", "(retry)", "-- retry", "retry."] {
            let (hits, _) = search(&conn, query, 0, 10);
            assert_eq!(hits.len(), 1, "query {query:?} should still find it");
        }

        /*
         * `NOT` and `AND` become ordinary quoted terms rather than operators, so
         * "retry NOT" searches for both words. The document has no "not", so no
         * result is the correct answer — the requirement is that it returns an
         * empty list instead of failing with a syntax error.
         */
        for query in ["retry NOT", "retry AND missing", "retry OR"] {
            let (hits, _) = search(&conn, query, 0, 10);
            assert!(hits.is_empty(), "query {query:?} should be empty, not an error");
        }
    }

    #[test]
    fn an_empty_query_returns_nothing_rather_than_everything() {
        let conn = memory();
        seed(&conn, "a", 1, "anything");

        assert_eq!(search(&conn, "", 0, 10).0.len(), 0);
        assert_eq!(search(&conn, "   ", 0, 10).0.len(), 0);
        // Punctuation only reduces to no terms, which must behave the same way.
        assert_eq!(search(&conn, "!!!", 0, 10).0.len(), 0);
    }

    #[test]
    fn reindexing_a_grown_conversation_does_not_duplicate_it() {
        /*
         * Conversations are continued, so the same session is indexed repeatedly.
         * Without clearing first, every pass leaves another copy and one search
         * returns the same line several times.
         */
        let conn = memory();
        seed(&conn, "a", 1, "the retry logic");
        seed(&conn, "a", 2, "the retry logic and more besides");

        let (hits, _) = search(&conn, "retry", 0, 10);
        assert_eq!(hits.len(), 1);

        let (sessions, _) = counts(&conn);
        assert_eq!(sessions, 1, "the session was updated, not duplicated");
    }

    #[test]
    fn skips_a_transcript_it_has_already_read_in_this_state() {
        let conn = memory();
        seed(&conn, "a", 1, "text");

        assert!(is_current(&conn, "a", "fp"));
        // A changed file means a changed fingerprint, so it must be read again.
        assert!(!is_current(&conn, "a", "different"));
        assert!(!is_current(&conn, "unknown", "fp"));
    }

    #[test]
    fn reports_real_counts_for_the_stats_panel() {
        let conn = memory();
        seed(&conn, "a", 1, "one");
        seed(&conn, "b", 2, "two");

        let (sessions, messages) = counts(&conn);
        assert_eq!(sessions, 2);
        assert_eq!(messages, 2);
    }

    #[test]
    fn a_stemmed_word_still_matches() {
        // The porter tokenizer is why "deciding" finds "decided". Losing it would
        // make search feel broken in a way nobody could describe.
        let conn = memory();
        seed(&conn, "a", 1, "we decided to drop it");

        assert_eq!(search(&conn, "decide", 0, 10).0.len(), 1);
    }
}

/* ── The picker's cache of what it already read ──────────────────────────── */

/// One transcript's derived listing, as the picker needs it.
///
/// Deliberately not `WorkSession`: that carries a `&'static str` source, which
/// the caller already knows and which has no business in a row keyed by path.
#[derive(Debug, Clone)]
pub struct Digest {
    pub session_id: String,
    pub project: String,
    pub project_name: String,
    pub title: String,
    pub last_prompt: String,
    pub branch: String,
    pub ended_at: i64,
    pub turns: u32,
    pub active_minutes: u32,
}

/// What was worked out for this file last time, if it has not changed since.
///
/// `mtime` and `size` together are the identity. A file rewritten to the same
/// length within the same millisecond would fool it; a transcript is appended
/// to, so that is not a thing that happens.
pub fn digest(conn: &Connection, path: &str, mtime: i64, size: i64) -> Option<Digest> {
    conn.query_row(
        "SELECT session_id, project, project_name, title, last_prompt, branch,
                ended_at, turns, active_minutes
           FROM transcript_digest
          WHERE path = ?1 AND mtime = ?2 AND size = ?3",
        params![path, mtime, size],
        |row| {
            Ok(Digest {
                session_id: row.get(0)?,
                project: row.get(1)?,
                project_name: row.get(2)?,
                title: row.get(3)?,
                last_prompt: row.get(4)?,
                branch: row.get(5)?,
                ended_at: row.get(6)?,
                turns: row.get(7)?,
                active_minutes: row.get(8)?,
            })
        },
    )
    .ok()
}

/// Remember what a transcript came out as, so the next scan can skip it.
pub fn remember_digest(conn: &Connection, path: &str, mtime: i64, size: i64, d: &Digest) {
    let _ = conn.execute(
        "INSERT INTO transcript_digest
            (path, mtime, size, session_id, project, project_name, title,
             last_prompt, branch, ended_at, turns, active_minutes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(path) DO UPDATE SET
            mtime = excluded.mtime, size = excluded.size,
            session_id = excluded.session_id, project = excluded.project,
            project_name = excluded.project_name, title = excluded.title,
            last_prompt = excluded.last_prompt, branch = excluded.branch,
            ended_at = excluded.ended_at, turns = excluded.turns,
            active_minutes = excluded.active_minutes",
        params![
            path,
            mtime,
            size,
            d.session_id,
            d.project,
            d.project_name,
            d.title,
            d.last_prompt,
            d.branch,
            d.ended_at,
            d.turns,
            d.active_minutes
        ],
    );
}

/// Drop rows for transcripts that are no longer on disk.
///
/// Without it the table keeps a row for every conversation ever deleted. It is
/// given the paths a scan actually saw, so it can only ever remove rows the
/// caller is authoritative about.
pub fn forget_missing_digests(conn: &Connection, seen: &[String]) {
    if seen.is_empty() {
        return;
    }

    let holes = std::iter::repeat("?").take(seen.len()).collect::<Vec<_>>().join(",");
    let sql = format!("DELETE FROM transcript_digest WHERE path NOT IN ({holes})");
    let _ = conn.execute(&sql, rusqlite::params_from_iter(seen.iter()));
}
