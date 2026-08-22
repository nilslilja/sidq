//! Keeping the index current, in the background, without being asked.
//!
//! The readers each know how to find conversations; none of them remembered
//! anything. This walks all of them on a timer and writes what it finds into the
//! index, so search, the memory profile and duplicate detection all read one
//! place instead of reparsing tens of megabytes per question.
//!
//! ── What makes this cheap enough to run continuously ─────────────────────────
//! A fingerprint per transcript — size and modification time — decides whether
//! anything changed. On a machine where nothing has been touched since the last
//! pass, a full sweep does one `stat` per file and no parsing at all. Only
//! transcripts that actually grew get read.
//!
//! Without that, indexing 29 conversations means reparsing about 50MB every few
//! minutes, forever, on battery.

use crate::{cursor_history, index_store, work_history};
use rusqlite::Connection;
use std::time::Duration;

/// How often to look. Conversations do not change on a scale that needs faster.
const SWEEP_INTERVAL: Duration = Duration::from_secs(90);

/// First sweep runs sooner, so search works shortly after launch.
const FIRST_SWEEP_DELAY: Duration = Duration::from_secs(3);

/**
 * Split a formatted transcript back into speaker turns.
 *
 * `session_transcript` already produces "You:\n…\n\nAssistant:\n…", so this
 * reuses that rather than teaching the indexer to parse three transcript formats
 * a second time. Two parsers for one thing is how they drift apart.
 */
fn into_turns(transcript: &str) -> Vec<(String, String)> {
    let mut turns: Vec<(String, String)> = Vec::new();

    for block in transcript.split("\n\n") {
        let block = block.trim();
        if block.is_empty() {
            continue;
        }

        // A block either opens with a speaker label or is a continuation of the
        // one before it, which happens whenever a reply contained a blank line.
        let (role, body) = match block.split_once(":\n") {
            Some((role, body)) if role == "You" || role == "Assistant" || role == "Exchange" => {
                (role.to_string(), body.to_string())
            }
            _ => match turns.last_mut() {
                Some(last) => {
                    last.1.push_str("\n\n");
                    last.1.push_str(block);
                    continue;
                }
                None => ("Exchange".to_string(), block.to_string()),
            },
        };

        turns.push((role, body));
    }

    turns
}

/// Size and mtime. Cheap, and enough to notice a conversation that grew.
fn fingerprint_of(session_id: &str, ended_at: i64, turns: u32) -> String {
    // The readers already surface these, and together they change whenever the
    // transcript does. Hashing file bytes would mean reading every file, which is
    // the cost this exists to avoid.
    format!("{session_id}:{ended_at}:{turns}")
}

/// One pass over every source. Returns how many sessions were newly indexed.
pub fn sweep(conn: &Connection) -> usize {
    let mut sessions = work_history::recent_sessions(500);
    sessions.extend(cursor_history::recent_sessions(500));

    let mut indexed = 0usize;

    for session in &sessions {
        if session.session_id.is_empty() {
            continue;
        }

        let fingerprint = fingerprint_of(&session.session_id, session.ended_at, session.turns);

        // Metadata is written every pass: it is small, and it keeps the picker
        // correct even for a conversation whose text has not changed.
        let _ = index_store::put_session(
            conn,
            &session.session_id,
            session.source,
            &session.title,
            &session.project_name,
            &session.branch,
            session.ended_at,
            session.turns,
            session.active_minutes,
        );

        if index_store::is_current(conn, &session.session_id, &fingerprint) {
            continue;
        }

        /*
         * Reading the body is the expensive part, so it happens only for a
         * transcript that actually changed. This is also the only place the
         * indexer touches conversation content at all.
         */
        let Some(transcript) = work_history::session_transcript(&session.session_id)
            .or_else(|| cursor_history::session_transcript(&session.session_id))
        else {
            continue;
        };

        let turns = into_turns(&transcript);
        if index_store::put_messages(conn, &session.session_id, &turns, &fingerprint).is_some() {
            indexed += 1;
        }
    }

    /*
     * The assistants that write nothing to disk.
     *
     * Read out of their windows through Accessibility, in the same pass and
     * into the same index, so a browser conversation is searchable and
     * handoverable on exactly the same terms as one from Claude Code. Costs
     * nothing when the permission has not been granted: the reader checks
     * first and returns an empty list.
     */
    #[cfg(target_os = "macos")]
    {
        indexed += crate::screen_reader::sweep_into(conn);
    }

    indexed
}

/**
 * Sweep forever on a background thread.
 *
 * Its own connection, because SQLite handles are not shareable across threads
 * and the searching side needs one that is not blocked behind an index pass.
 * WAL mode is what makes those two coexist.
 */
pub fn spawn() {
    std::thread::spawn(|| {
        std::thread::sleep(FIRST_SWEEP_DELAY);

        let Some(conn) = index_store::open() else {
            // No index means no search, and that is survivable: the picker reads
            // the sources directly and still works.
            return;
        };

        loop {
            sweep(&conn);
            std::thread::sleep(SWEEP_INTERVAL);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    /**
     * Manual diagnostic against the real machine.
     *
     * Ignored because it reads whatever is actually in ~/.claude and Cursor, so
     * it can neither assert nor run in CI. It exists because fixtures kept
     * agreeing with code that was wrong about real files.
     *
     * cargo test --bin sidq real_index -- --ignored --nocapture
     */
    #[test]
    #[ignore]
    fn real_index() {
        let conn = crate::index_store::open().expect("index opens");
        let started = std::time::Instant::now();
        let newly = sweep(&conn);
        let (sessions, messages) = crate::index_store::counts(&conn);

        println!("\n  swept in {:?}", started.elapsed());
        println!("  newly indexed: {newly}");
        println!("  totals: {sessions} conversations, {messages} messages\n");

        for term in ["retry", "pricing", "stripe", "extension", "pill"] {
            let (hits, withheld) = crate::index_store::search(&conn, term, 0, 3);
            println!("  {:<10} {} hits", term, hits.len());
            for h in hits.iter().take(2) {
                let snip: String = h.snippet.chars().take(70).collect();
                println!("      [{}] {} — {}", h.source, h.title.chars().take(34).collect::<String>(), snip.replace('\n', " "));
            }
            if withheld > 0 {
                println!("      (+{withheld} older, withheld)");
            }
        }
    }

    #[test]
    fn splits_a_transcript_into_turns() {
        let transcript = "You:\nfirst question\n\nAssistant:\nfirst answer\n\nYou:\nsecond question\n";
        let turns = into_turns(transcript);

        assert_eq!(turns.len(), 3);
        assert_eq!(turns[0], ("You".into(), "first question".into()));
        assert_eq!(turns[1].0, "Assistant");
        assert_eq!(turns[2].1, "second question");
    }

    #[test]
    fn keeps_a_reply_that_contains_blank_lines_as_one_turn() {
        /*
         * Replies with code or lists have blank lines inside them. Splitting on
         * a blank line alone would turn one answer into five, and a search would
         * then return five results for what a person remembers as one reply.
         */
        let transcript = "Assistant:\nhere is the fix\n\n    some code\n\n    more code\n\nYou:\nthanks\n";
        let turns = into_turns(transcript);

        assert_eq!(turns.len(), 2, "the reply must stay whole");
        assert!(turns[0].1.contains("some code"));
        assert!(turns[0].1.contains("more code"));
        assert_eq!(turns[1].0, "You");
    }

    #[test]
    fn handles_text_with_no_speaker_labels_at_all() {
        // Captured browser conversations can arrive as one block, and dropping
        // them would silently make those sources unsearchable.
        let turns = into_turns("just some text with no labels");

        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].0, "Exchange");
    }

    #[test]
    fn ignores_empty_input_rather_than_inventing_a_turn() {
        assert!(into_turns("").is_empty());
        assert!(into_turns("\n\n\n").is_empty());
    }

    #[test]
    fn a_fingerprint_changes_when_a_conversation_grows() {
        // If it did not, a conversation that was continued would never be
        // re-indexed and search would keep returning yesterday's version.
        let before = fingerprint_of("abc", 1_000, 10);
        let after_more_turns = fingerprint_of("abc", 1_000, 11);
        let after_new_activity = fingerprint_of("abc", 2_000, 10);

        assert_ne!(before, after_more_turns);
        assert_ne!(before, after_new_activity);
        assert_eq!(before, fingerprint_of("abc", 1_000, 10), "and is stable otherwise");
    }
}
