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
    crate::net::random_bytes().map(|b| b.iter().map(|x| format!("{x:02x}")).collect())
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

    /*
     * The starting session's own assistant, looked up rather than passed in.
     *
     * It was empty here at first, which made the thread's own origin the one
     * member nobody could name: `state` headed it "another assistant" and the
     * summary read "another assistant and Cursor" for a thread that started in
     * Claude Code. The index already knows, so nothing had to be asked for.
     */
    let source: String = conn
        .query_row(
            "SELECT source FROM sessions WHERE session_id = ?1",
            [session_id],
            |r| r.get(0),
        )
        .unwrap_or_default();

    join(conn, &id, session_id, &source)?;
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
    conn.execute(
        "UPDATE threads SET awaiting = 0 WHERE thread_id = ?1",
        [&thread_id],
    )
    .ok()?;
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
                Ok(Member {
                    session_id: r.get(0)?,
                    source: r.get(1)?,
                    joined_at: r.get(2)?,
                })
            })
            .map(|rows| rows.filter_map(Result::ok).collect::<Vec<_>>())
        })
        .unwrap_or_default();

    Some(Thread {
        thread_id: thread_id.to_string(),
        title,
        project,
        started_at,
        members,
    })
}

/**
 * The threads worth offering, most recently active first.
 *
 * Ordered by the last session that joined rather than by when the thread
 * started, because a thread somebody moved this morning is the one they are in
 * and a thread from three weeks ago is history. Capped, because this becomes a
 * list in somebody's client and a picker with four hundred rows is a picker
 * nobody opens.
 */
pub fn recent(conn: &Connection, limit: usize) -> Vec<Thread> {
    let ids: Vec<String> = conn
        .prepare(
            "SELECT t.thread_id FROM threads t
               JOIN thread_members m ON m.thread_id = t.thread_id
              GROUP BY t.thread_id
              ORDER BY MAX(m.joined_at) DESC
              LIMIT ?1",
        )
        .and_then(|mut stmt| {
            stmt.query_map([limit as i64], |r| r.get(0))
                .map(|rows| rows.filter_map(Result::ok).collect())
        })
        .unwrap_or_default();

    ids.iter().filter_map(|id| get(conn, id)).collect()
}

/**
 * How much of a thread a destination is handed.
 *
 * Smaller than one conversation's budget on purpose. A thread is several
 * sessions and the point of reading it is to know where things got to, not to
 * re-read everything that happened — a destination that receives four hundred
 * thousand characters is back to being handed a wall of text, which is the
 * thing a thread exists to stop.
 */
const STATE_BUDGET: usize = 60_000;

/**
 * What a thread is, as something to join rather than something to read.
 *
 * ── Why this is not a transcript ────────────────────────────────────────────
 *
 * A handover file is everything that was said, and the model receiving it has
 * to work out what is still true. Most of a long conversation is superseded:
 * approaches that were tried and dropped, numbers that were corrected, three
 * turns of getting a name right. Handing all of it over asks the next model to
 * re-derive the present from the history.
 *
 * This is the present. Every session in the thread, oldest first, with the
 * filler removed and the end kept — `selection::select` already decides which
 * turns carry weight and `compiler` already names what it dropped, so this
 * composes those across a thread instead of over one session.
 *
 * ── Why it says which assistant said what ───────────────────────────────────
 *
 * Because a thread crosses them, and "we decided against Postgres" means
 * something different when the model reading it is the one that said it. The
 * source is on each section for the same reason a conversation has names in it.
 */
pub fn state(conn: &Connection, thread_id: &str) -> Option<String> {
    let thread = get(conn, thread_id)?;
    if thread.members.is_empty() {
        return None;
    }

    let mut out = format!(
        "# {}\n\n",
        if thread.title.is_empty() {
            "This conversation"
        } else {
            &thread.title
        }
    );
    out.push_str(&format!(
        "One conversation across {}. Oldest first.\n\n",
        assistants(&thread)
    ));

    // Split evenly rather than first-come, so the session somebody is in right
    // now is not the one that gets truncated to nothing.
    let each = STATE_BUDGET / thread.members.len().max(1);
    let mut dropped = 0usize;

    for member in &thread.members {
        let turns = crate::index_store::session_turns(conn, &member.session_id);
        if turns.is_empty() {
            continue;
        }

        /*
         * The wall itself is not part of the conversation.
         *
         * Driving this over stdio showed the destination being handed "You've
         * hit your monthly spend limit" as though it were something the last
         * assistant had decided. It is the opposite of content: it is the
         * reason there is a thread at all, and a model reading it has every
         * reason to think the limit is its own and stop too.
         */
        let turns: Vec<(String, String)> = turns
            .into_iter()
            .filter(|(role, body)| role == "You" || !crate::wall::hit(&member.source, body))
            .collect();

        let turns: Vec<crate::capture::Turn> = turns
            .into_iter()
            /*
             * "You" is the index's word for the person, and the only one.
             *
             * This read `role == "user"` at first, which is nothing the indexer
             * ever writes — every turn including the person's own would have
             * been labelled Assistant, and a destination would have been told
             * the person's instructions came from a model. The vocabulary is
             * "You", "Assistant" and "Exchange" (indexer.rs:39); the last is a
             * screen-read block that is both, and reads better as Assistant
             * than as something the person said.
             */
            .map(|(role, body)| crate::capture::Turn {
                role: if role == "You" {
                    crate::capture::Role::You
                } else {
                    crate::capture::Role::Assistant
                },
                blocks: vec![crate::capture::Block::Said(body)],
            })
            .collect();

        let (kept, report) = crate::selection::select(&turns, each);
        dropped += report.dropped();

        out.push_str(&format!("## In {}\n\n", member.source_label()));
        for turn in &kept {
            let who = match turn.role {
                crate::capture::Role::You => "You",
                crate::capture::Role::Assistant => "Assistant",
            };
            for block in &turn.blocks {
                if let crate::capture::Block::Said(text) = block {
                    if !text.trim().is_empty() {
                        out.push_str(&format!("**{who}:** {}\n\n", text.trim()));
                    }
                }
            }
        }
    }

    /*
     * What was left out is stated, never implied.
     *
     * The same rule the compiler follows: a model that does not know something
     * is missing will answer as though it has everything, and the person
     * reading that answer has no way to tell.
     */
    if dropped > 0 {
        out.push_str(&format!(
            "---\n\n{dropped} turns are not here: greetings, acknowledgements, and the \
             older middle of this conversation. Ask if something is missing.\n"
        ));
    }

    Some(out)
}

/// "Claude Code and Cursor", or "three assistants" once a list stops helping.
pub fn assistants(thread: &Thread) -> String {
    let mut seen: Vec<&str> = Vec::new();
    for m in &thread.members {
        let label = m.source_label();
        if !seen.contains(&label) {
            seen.push(label);
        }
    }

    match seen.len() {
        0 => "one assistant".to_string(),
        1 => seen[0].to_string(),
        2 => format!("{} and {}", seen[0], seen[1]),
        n => format!("{n} assistants"),
    }
}

impl Member {
    /// What a person calls the assistant this session happened in.
    fn source_label(&self) -> &'static str {
        // A source Sidq reads and the table has not been told about still gets
        // a heading rather than an empty one — and a vague heading rather than
        // a column value, which in the middle of prose reads as a bug.
        crate::sources::label(&self.source).unwrap_or("another assistant")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /*
     * The real schema, not a hand-written subset of it.
     *
     * The first version of this created `threads` and `thread_members` by hand,
     * which was quicker and hid a bug: `start` looks a session's source up in
     * `sessions`, and a test database with no `sessions` table made that lookup
     * fail silently in exactly the way the real one would not.
     */
    fn db() -> Connection {
        crate::index_store::tests::memory()
    }

    /// A session as the index holds it. `source` is what the thread reads back.
    fn a_session(conn: &Connection, session_id: &str, source: &str) {
        conn.execute(
            "INSERT INTO sessions (session_id, source) VALUES (?1, ?2)",
            [session_id, source],
        )
        .unwrap();
    }

    fn say(conn: &Connection, session: &str, role: &str, body: &str) {
        conn.execute(
            "INSERT INTO messages (session_id, role, body) VALUES (?1, ?2, ?3)",
            rusqlite::params![session, role, body],
        )
        .unwrap();
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
        assert_eq!(
            of_session(&conn, "in-chatgpt").as_deref(),
            Some(id.as_str())
        );
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
        assert_eq!(
            claim(&conn, "second", "cursor", "/p"),
            None,
            "a second session claimed it"
        );
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
        conn.execute(
            "UPDATE threads SET awaiting = ?1 WHERE thread_id = ?2",
            (long_ago, &id),
        )
        .unwrap();

        assert_eq!(claim(&conn, "much-later", "cursor", "/p"), None);
    }

    // ── What a destination reads ────────────────────────────────────────

    #[test]
    fn a_thread_reads_as_one_conversation_across_three_assistants() {
        /*
         * The whole point of `state`. Before this, a destination received one
         * session's transcript and had no idea the other two existed.
         */
        let conn = db();
        a_session(&conn, "s1", "claude-code");
        let id = start(&conn, "s1", "The index", "/Sidq").unwrap();
        join(&conn, &id, "s2", "cursor").unwrap();
        join(&conn, &id, "s3", "chatgpt").unwrap();

        say(&conn, "s1", "You", "should the index be sqlite or postgres");
        say(
            &conn,
            "s1",
            "Assistant",
            "sqlite, because it ships inside the app",
        );
        say(&conn, "s2", "You", "now wire the reader to it");
        say(&conn, "s3", "You", "why did we not use postgres again");

        let out = state(&conn, &id).expect("a state");

        // Every session is in it, and each is attributed to its assistant.
        assert!(out.contains("sqlite, because it ships inside the app"));
        assert!(out.contains("now wire the reader to it"));
        assert!(out.contains("why did we not use postgres again"));
        assert!(out.contains("Claude Code"), "{out}");
        assert!(out.contains("Cursor"), "{out}");
        assert!(out.contains("ChatGPT"), "{out}");
    }

    #[test]
    fn what_the_person_said_is_not_attributed_to_a_model() {
        /*
         * The vocabulary the indexer actually writes is "You" / "Assistant" /
         * "Exchange" (indexer.rs:39). This mapped "user", which the index never
         * writes, so every turn came back as the Assistant — a destination
         * would have read the person's own instructions as something a model
         * decided, and followed them with exactly that much authority.
         */
        let conn = db();
        a_session(&conn, "s1", "claude-code");
        let id = start(&conn, "s1", "A", "/p").unwrap();
        say(&conn, "s1", "You", "never use tailwind in this repo");
        say(&conn, "s1", "Assistant", "understood, plain css");

        let out = state(&conn, &id).unwrap();
        assert!(
            out.contains("**You:** never use tailwind in this repo"),
            "{out}"
        );
        assert!(
            out.contains("**Assistant:** understood, plain css"),
            "{out}"
        );
    }

    #[test]
    fn it_names_the_assistants_rather_than_their_source_ids() {
        /*
         * "claude-code" is a column value. A model reading this is being told
         * who said what, and "In claude-code" reads as a bug.
         */
        let conn = db();
        let id = start(&conn, "s1", "A", "/p").unwrap();
        join(&conn, &id, "s2", "claude-code").unwrap();
        say(&conn, "s2", "You", "hello");

        let out = state(&conn, &id).unwrap();
        assert!(out.contains("Claude Code"));
        assert!(!out.contains("claude-code"), "{out}");
    }

    #[test]
    fn a_source_nobody_has_labelled_still_gets_a_heading() {
        // Sidq reads more sources than this list knows about, and a section
        // with no heading is worse than one with a vague heading.
        let conn = db();
        let id = start(&conn, "s1", "A", "/p").unwrap();
        join(&conn, &id, "s2", "something-new").unwrap();
        say(&conn, "s2", "You", "hello");

        let out = state(&conn, &id).unwrap();
        assert!(out.contains("another assistant"), "{out}");
    }

    #[test]
    fn what_was_left_out_is_stated_rather_than_implied() {
        /*
         * The rule the compiler already follows, and the reason this is safe to
         * hand to a model at all: one that does not know something is missing
         * answers as though it has everything, and the person reading that
         * answer cannot tell.
         */
        let conn = db();
        let id = start(&conn, "s1", "A", "/p").unwrap();

        // Far past the budget, so selection has to drop something.
        for i in 0..400 {
            say(
                &conn,
                "s1",
                "You",
                &format!("a long turn number {i} ").repeat(60),
            );
        }

        let out = state(&conn, &id).unwrap();
        assert!(out.contains("are not here"), "{out}");
        assert!(
            out.len() < STATE_BUDGET * 2,
            "the state ran past its budget"
        );
    }

    #[test]
    fn the_limit_message_is_not_handed_on_as_something_that_was_decided() {
        /*
         * Found by driving this over stdio rather than by reading it. The state
         * carried "You've hit your monthly spend limit" into the destination,
         * where it is worse than noise: it is the reason the thread exists, it
         * reads as the last assistant's conclusion, and a model that takes it
         * at face value concludes the limit is its own and stops as well.
         */
        let conn = db();
        a_session(&conn, "s1", "claude-code");
        let id = start(&conn, "s1", "A", "/p").unwrap();
        say(
            &conn,
            "s1",
            "Assistant",
            "wal mode, so the sweep and the search can coexist",
        );
        say(
            &conn,
            "s1",
            "Assistant",
            "You've hit your monthly spend limit · raise it at \
             claude.ai/settings/usage?from=cc_cli_limit",
        );

        let out = state(&conn, &id).unwrap();
        assert!(out.contains("wal mode"), "the real work was dropped: {out}");
        assert!(
            !out.contains("spend limit"),
            "the wall was handed on: {out}"
        );
    }

    #[test]
    fn a_person_asking_about_a_limit_is_still_carried_across() {
        // The filter must not silence the person. Somebody whose actual problem
        // is rate limiting would arrive at the next assistant with the subject
        // of the conversation removed from it.
        let conn = db();
        a_session(&conn, "s1", "claude-code");
        let id = start(&conn, "s1", "A", "/p").unwrap();
        say(
            &conn,
            "s1",
            "You",
            "you've hit your monthly spend limit — what does that mean",
        );

        let out = state(&conn, &id).unwrap();
        assert!(out.contains("what does that mean"), "{out}");
    }

    #[test]
    fn an_empty_thread_has_no_state_rather_than_an_empty_one() {
        // A heading over nothing is something a model will answer from.
        let conn = db();
        assert_eq!(state(&conn, "no-such-thread"), None);
    }

    #[test]
    fn every_session_gets_a_share_rather_than_the_first_taking_it_all() {
        /*
         * Split evenly, because the session somebody is in right now is the
         * last one and would otherwise be the one truncated to nothing — which
         * is exactly backwards.
         */
        let conn = db();
        let id = start(&conn, "old", "A", "/p").unwrap();
        join(&conn, &id, "newest", "cursor").unwrap();

        for i in 0..400 {
            say(&conn, "old", "You", &format!("old turn {i} ").repeat(60));
        }
        say(
            &conn,
            "newest",
            "You",
            "the thing I am actually doing right now",
        );

        let out = state(&conn, &id).unwrap();
        assert!(
            out.contains("the thing I am actually doing right now"),
            "the newest was lost"
        );
    }

    #[test]
    fn members_come_back_in_the_order_the_conversation_happened() {
        let conn = db();
        let id = start(&conn, "first", "A", "/p").unwrap();
        join(&conn, &id, "second", "cursor").unwrap();

        let order: Vec<String> = get(&conn, &id)
            .unwrap()
            .members
            .into_iter()
            .map(|m| m.session_id)
            .collect();
        assert_eq!(order.first().map(String::as_str), Some("first"));
    }
}
