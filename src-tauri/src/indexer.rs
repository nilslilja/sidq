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

/**
 * How often to read the AIs that live in a browser. Far more often, and for a
 * reason that is about the browser rather than about the conversation.
 *
 * Chrome only exposes an accessibility tree for the window that is in front,
 * and tears it down when it is not. So the ninety second sweep almost never
 * coincided with the one moment the page was readable: somebody opens ChatGPT,
 * talks to it, switches to Sidq to see it — and by then Chrome has stopped
 * offering anything, and the sweep that finally runs finds an empty screen.
 *
 * Reported as "I open ChatGPT and nothing shows up in Sidq", and confirmed on
 * this machine: a Grok tab open in Chrome, Claude in front, and the index
 * holding nothing from any browser at all while the desktop apps read fine.
 *
 * Eight seconds, down from fifteen. Fifteen was chosen when nothing announced
 * a capture, so the only cost of being slow was that the picker caught up
 * eventually. Finding a conversation now rings and raises a notification, which
 * turns the delay into the thing being judged: a minute of silence after
 * opening ChatGPT reads as broken, whatever is happening underneath.
 *
 * It costs almost nothing when there is no browser open — the reader checks the
 * permission and the process list first and returns — and a conversation that
 * has not grown since the last pass is skipped by its fingerprint before any
 * text is touched.
 */
const SCREEN_INTERVAL: Duration = Duration::from_secs(8);

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
    // Without this Codex was readable by the picker and invisible to search and
    // to the Sources panel, which is the shape of a source that half works.
    sessions.extend(crate::codex_history::recent_sessions(500));

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
            .or_else(|| crate::codex_history::session_transcript(&session.session_id))
        else {
            continue;
        };

        let turns = into_turns(&transcript);
        if index_store::put_messages(conn, &session.session_id, &turns, &fingerprint).is_some() {
            indexed += 1;
        }
    }

    /*
     * The AIs that write nothing to disk are not read here.
     *
     * They used to be, in this same pass, and that was the bug: this runs every
     * ninety seconds and a browser only offers its page while it is the window
     * in front. The two almost never lined up. They have their own loop on a
     * fifteen second clock now — see `SCREEN_INTERVAL`.
     */

    indexed
}

/**
 * Sweep forever on a background thread.
 *
 * Its own connection, because SQLite handles are not shareable across threads
 * and the searching side needs one that is not blocked behind an index pass.
 * WAL mode is what makes those two coexist.
 */
pub fn spawn(app: tauri::AppHandle) {
    let disk = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_SWEEP_DELAY);

        let Some(conn) = index_store::open() else {
            // No index means no search, and that is survivable: the picker reads
            // the sources directly and still works.
            return;
        };

        loop {
            if sweep(&conn) > 0 {
                crate::announce(&disk);
            }
            std::thread::sleep(SWEEP_INTERVAL);
        }
    });

    /*
     * The browser reader runs on its own thread and its own clock.
     *
     * Its own connection, for the same reason the disk sweep has one: SQLite
     * handles are not shareable across threads, and neither loop should wait on
     * the other. WAL is what lets all three coexist.
     */
    #[cfg(target_os = "macos")]
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_SWEEP_DELAY);

        let Some(conn) = index_store::open() else {
            return;
        };

        // Before the first sweep, not on every one: conversations captured
        // before the reader learned to drop page furniture still have it
        // attached, and a handover made from one would carry it.
        index_store::repair_once(&conn);

        loop {
            // Only when something was actually written. A sweep that finds an
            // unchanged conversation must not make the window refetch.
            let found = crate::screen_reader::sweep_into(&conn);
            if !found.is_empty() {
                crate::announce(&app);
            }

            /*
             * ── Say so when a conversation arrives ───────────────────────────
             *
             * The reader works in the background and used to report nothing, so
             * the only way to learn whether opening ChatGPT had worked was to
             * switch to Sidq and look. An app that is busy and silent is
             * indistinguishable from one that is broken, and that is exactly
             * how this one read.
             *
             * Only on `first_time`. A conversation grows every few seconds
             * while somebody is typing in it, and a notification per turn would
             * be the most irritating thing the product does.
             */
            for one in found.iter().filter(|f| f.first_time) {
                crate::announce_found(&app, one);
            }

            std::thread::sleep(SCREEN_INTERVAL);
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
