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
const SCHEMA_VERSION: i64 = 2;

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

/// Has this transcript already been indexed in exactly this state?
pub fn is_current(conn: &Connection, session_id: &str, fingerprint: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM seen WHERE session_id = ?1 AND fingerprint = ?2",
        params![session_id, fingerprint],
        |_| Ok(()),
    )
    .is_ok()
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

    fn seed(conn: &Connection, id: &str, ended_at: i64, body: &str) {
        put_session(conn, id, "claude-code", "A conversation", "Sidq", "main", ended_at, 10, 30)
            .unwrap();
        put_messages(conn, id, &[("You".into(), body.into())], "fp").unwrap();
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
