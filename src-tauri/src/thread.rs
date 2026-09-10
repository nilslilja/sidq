//! One conversation, however many assistants it passed through.
//!
//! ── What this replaces ───────────────────────────────────────────────────────
//!
//! Sidq's answer to "continue this somewhere else" has been a compiled file. It
//! works and it is not enough: a file is a one-shot transfer, the next model
//! reads a wall of text, and nothing afterwards knows the two conversations
//! were ever the same conversation. Hand over three times and you have four
//! unrelated sessions in a list and a person holding the thread in their head.
//!
//! A thread is that relation, written down. Sessions join one. The thread is
//! the conversation; Claude Code, Cursor and ChatGPT are heads on it.
//!
//! ── Why joining happens two ways ────────────────────────────────────────────
//!
//! Exactly, when the assistant cooperates: the handover names the thread and the
//! MCP server offers `join_thread`. That is precise and it depends on a model
//! choosing to call something, which is not a thing to build a product on.
//!
//! Automatically, when it does not: a handover marks its thread as expecting a
//! continuation, and the next session that appears in the same project and is
//! not already in a thread claims it. That is a guess, and it is the case that
//! actually happens — somebody hits a limit, opens Cursor, and carries on.
//!
//! The guess is bounded by `WINDOW` and cleared once claimed, so a thread cannot
//! quietly swallow every session that follows it for the rest of the day.

use crate::index_store;
use rusqlite::Connection;

/**
 * How long a handover keeps expecting a continuation.
 *
 * Long enough to cover making coffee and opening another editor, short enough
 * that the next unrelated thing somebody starts is not swept into a thread it
 * has nothing to do with. Twenty minutes is the wrong answer in both directions
 * occasionally; being wrong quietly is why it is cleared on the first claim.
 */
const WINDOW_MS: i64 = 20 * 60 * 1_000;

/// One session's place in a thread.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct Member {
    pub session_id: String,
    pub source: String,
    pub joined_at: i64,
}

/// A thread, as anything reading it needs to see it.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct Thread {
    pub thread_id: String,
    pub title: String,
    pub project: String,
    pub started_at: i64,
    /// Oldest first, which is the order the conversation happened in.
    pub members: Vec<Member>,
}

/// A new id. Same source of randomness as the install id, same reasoning.
fn new_id() -> Option<String> {
    crate::net::random_bytes()
        .map(|b| b.iter().map(|x| format!("{x:02x}")).collect())
}

/**
 * Start a thread at a session, or return the one it is already in.
 *
 * Idempotent on purpose: handing the same conversation over twice is a normal
 * thing to do — the first attempt went somewhere that did not work out — and it
 * must not produce two threads describing one conversation.
 */
pub fn start(conn: &Connection, session_id: &str, title: &str, project: &str) -> Option<String> {
    if let Some(existing) = of_session(conn, session_id) {
        return Some(existing);
    }

    let id = new_id()?;
    let now = index_store::now_millis();
    conn.execute(
        "INSERT INTO threads (thread_id, started_at, title, project) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, now, title, project],
    )
    .ok()?;

    join(conn, &id, session_id, "")?;
    Some(id)
}

/// Put a session in a thread. Joining twice is not an error.
pub fn join(conn: &Connection, thread_id: &str, session_id: &str, source: &str) -> Option<()> {
    conn.execute(
        "INSERT INTO thread_members (thread_id, session_id, source, joined_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(thread_id, session_id) DO NOTHING",
        rusqlite::params![thread_id, session_id, source, index_store::now_millis()],
    )
    .ok()
    .map(|_| ())
}

/// Which thread a session belongs to, if any.
pub fn of_session(conn: &Connection, session_id: &str) -> Option<String> {
    conn.query_row(
        "SELECT thread_id FROM thread_members WHERE session_id = ?1 LIMIT 1",
        [session_id],
        |r| r.get(0),
    )
    .ok()
}

/**
 * Say a thread is expecting a continuation.
 *
 * Called when a handover is made. What it records is a moment, not an
 * intention: the claim below is bounded by how long ago this was.
 */
pub fn expect_continuation(conn: &Connection, thread_id: &str) -> Option<()> {
    conn.execute(
        "UPDATE threads SET awaiting = ?1 WHERE thread_id = ?2",
        rusqlite::params![index_store::now_millis(), thread_id],
    )
    .ok()
    .map(|_| ())
}

/**
 * Let a newly seen session claim the thread that was expecting one.
 *
 * The automatic half, and the one that carries the product: somebody hits a
 * limit, opens a different assistant, and carries on without pressing anything.
 *
 * Refuses when the session is already in a thread, when nothing is expecting a
 * continuation in that project, or when the wait has gone stale. All three are
 * "leave it alone", because a wrong join silently merges two conversations and
 * is much harder to notice than a missing one.
 */
pub fn claim(conn: &Connection, session_id: &str, source: &str, project: &str) -> Option<String> {
    if of_session(conn, session_id).is_some() {
        return None;
    }

    let cutoff = index_store::now_millis() - WINDOW_MS;
    let thread_id: String = conn
        .query_row(
            "SELECT thread_id FROM threads
              WHERE awaiting > ?1 AND project = ?2
              ORDER BY awaiting DESC LIMIT 1",
            rusqlite::params![cutoff, project],
            |r| r.get(0),
        )
        .ok()?;

    join(conn, &thread_id, session_id, source)?;
    // Cleared on the first claim, so one handover adopts one continuation.
    conn.execute("UPDATE threads SET awaiting = 0 WHERE thread_id = ?1", [&thread_id]).ok()?;
    Some(thread_id)
}

/// A thread and everything in it, oldest member first.
pub fn get(conn: &Connection, thread_id: &str) -> Option<Thread> {
    let (started_at, title, project) = conn
        .query_row(
            "SELECT started_at, title, project FROM threads WHERE thread_id = ?1",
            [thread_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .ok()?;

    let members = conn
        .prepare(
            "SELECT session_id, source, joined_at FROM thread_members
              WHERE thread_id = ?1 ORDER BY joined_at ASC",
        )
        .and_then(|mut stmt| {
            stmt.query_map([thread_id], |r| {
                Ok(Member { session_id: r.get(0)?, source: r.get(1)?, joined_at: r.get(2)? })
            })
            .map(|rows| rows.filter_map(Result::ok).collect::<Vec<_>>())
        })
        .unwrap_or_default();

    Some(Thread { thread_id: thread_id.to_string(), title, project, started_at, members })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE threads (
                thread_id TEXT PRIMARY KEY, started_at INTEGER NOT NULL DEFAULT 0,
                title TEXT NOT NULL DEFAULT '', project TEXT NOT NULL DEFAULT '',
                awaiting INTEGER NOT NULL DEFAULT 0);
             CREATE TABLE thread_members (
                thread_id TEXT NOT NULL, session_id TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT '', joined_at INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (thread_id, session_id));",
        )
        .unwrap();
        conn
    }

    #[test]
    fn a_conversation_that_moved_three_times_is_one_thread() {
        /*
         * The whole point. Before this, handing over twice left three unrelated
         * sessions in a list and a person holding the connection in their head.
         */
        let conn = db();
        let id = start(&conn, "in-claude-code", "The index", "/Sidq").unwrap();
        join(&conn, &id, "in-cursor", "cursor").unwrap();
        join(&conn, &id, "in-chatgpt", "chatgpt").unwrap();

        let t = get(&conn, &id).unwrap();
        assert_eq!(t.members.len(), 3);
        assert_eq!(of_session(&conn, "in-cursor").as_deref(), Some(id.as_str()));
        assert_eq!(of_session(&conn, "in-chatgpt").as_deref(), Some(id.as_str()));
    }

    #[test]
    fn handing_the_same_conversation_over_twice_does_not_make_two_threads() {
        // A normal thing to do: the first destination was the wrong one. It
        // must not end up describing one conversation twice.
        let conn = db();
        let first = start(&conn, "s1", "A", "/p").unwrap();
        let again = start(&conn, "s1", "A", "/p").unwrap();
        assert_eq!(first, again);
    }

    #[test]
    fn a_continuation_claims_the_thread_without_anybody_pressing_anything() {
        /*
         * The automatic half, and the case that actually happens: hit a limit,
         * open a different assistant, carry on.
         */
        let conn = db();
        let id = start(&conn, "walled", "The index", "/Sidq").unwrap();
        expect_continuation(&conn, &id).unwrap();

        let claimed = claim(&conn, "fresh-in-cursor", "cursor", "/Sidq");
        assert_eq!(claimed.as_deref(), Some(id.as_str()));
        assert_eq!(get(&conn, &id).unwrap().members.len(), 2);
    }

    #[test]
    fn only_one_session_can_claim_a_handover() {
        /*
         * Cleared on the first claim. Without that, every session started for
         * the rest of the afternoon is swallowed by one thread, and a thread
         * describing four unrelated things is worse than no thread at all.
         */
        let conn = db();
        let id = start(&conn, "walled", "A", "/p").unwrap();
        expect_continuation(&conn, &id).unwrap();

        assert!(claim(&conn, "first", "cursor", "/p").is_some());
        assert_eq!(claim(&conn, "second", "cursor", "/p"), None, "a second session claimed it");
    }

    #[test]
    fn a_session_in_another_project_is_not_a_continuation() {
        // Somebody opening a different piece of work is not continuing this
        // one, however close together the two happened.
        let conn = db();
        let id = start(&conn, "walled", "A", "/one").unwrap();
        expect_continuation(&conn, &id).unwrap();

        assert_eq!(claim(&conn, "elsewhere", "cursor", "/two"), None);
    }

    #[test]
    fn a_session_already_in_a_thread_never_joins_a_second() {
        let conn = db();
        let mine = start(&conn, "s1", "A", "/p").unwrap();
        let other = start(&conn, "s2", "B", "/p").unwrap();
        expect_continuation(&conn, &other).unwrap();

        assert_eq!(claim(&conn, "s1", "cursor", "/p"), None);
        assert_eq!(of_session(&conn, "s1").as_deref(), Some(mine.as_str()));
    }

    #[test]
    fn nothing_is_claimed_when_nothing_was_handed_over() {
        // A session starting on its own is the overwhelmingly common case and
        // must not be joined to anything.
        let conn = db();
        start(&conn, "s1", "A", "/p").unwrap();
        assert_eq!(claim(&conn, "unrelated", "cursor", "/p"), None);
    }

    #[test]
    fn a_wait_that_has_gone_stale_is_not_claimed() {
        /*
         * The bound on the guess. Without it, the first session started
         * tomorrow morning joins yesterday's thread, and a wrong join silently
         * merges two conversations — much harder to notice than a missing one.
         */
        let conn = db();
        let id = start(&conn, "walled", "A", "/p").unwrap();
        let long_ago = index_store::now_millis() - (WINDOW_MS * 2);
        conn.execute("UPDATE threads SET awaiting = ?1 WHERE thread_id = ?2", (long_ago, &id))
            .unwrap();

        assert_eq!(claim(&conn, "much-later", "cursor", "/p"), None);
    }

    #[test]
    fn members_come_back_in_the_order_the_conversation_happened() {
        let conn = db();
        let id = start(&conn, "first", "A", "/p").unwrap();
        join(&conn, &id, "second", "cursor").unwrap();

        let order: Vec<String> =
            get(&conn, &id).unwrap().members.into_iter().map(|m| m.session_id).collect();
        assert_eq!(order.first().map(String::as_str), Some("first"));
    }
}
