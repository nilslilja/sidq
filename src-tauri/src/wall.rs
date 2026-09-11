//! Noticing the moment an assistant stops.
//!
//! ── Why this exists ──────────────────────────────────────────────────────────
//!
//! Hitting a limit mid-problem is the most hated moment in this entire
//! workflow. Four hours in, the assistant stops, and the only way forward is to
//! start again somewhere else and lose everything.
//!
//! Sidq already fixes that, and it fixes it only for people who remember Sidq
//! exists, think of it at the worst moment of their day, press a key and pick a
//! row. Three chances to not use the thing that would have saved them. A tool
//! that has to be remembered at the moment of maximum frustration is a tool
//! nobody credits with anything.
//!
//! So Sidq watches for the wall instead. When it arrives, the continuation is
//! already there, aimed at the conversation that just stopped.
//!
//! ── Why the patterns are so narrow ──────────────────────────────────────────
//!
//! This interrupts somebody. A false positive is a notification in the middle
//! of work that was going fine, which is worse than staying silent — the
//! feature only has to be wrong twice before it gets turned off and the real
//! moment is never caught either.
//!
//! So a pattern qualifies on two counts and not one. It has to be text a vendor
//! generates rather than text a person could type, and it is only ever matched
//! against an assistant's own turn. "we should handle the rate limit here" in a
//! conversation about rate limits must never fire this, and it is exactly the
//! sentence somebody types while building something that talks to an API.
//!
//! Claude Code's marker below is verified against real transcripts: eleven
//! occurrences, all assistant turns, none of them a person talking. Nothing else
//! is in here, because a pattern nobody has seen fire is a guess, and guesses in
//! this module cost more than they pay.

/// One vendor's way of saying it has stopped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Marker {
    /// The `sessions.source` this applies to.
    pub source: &'static str,
    /// Matched case-insensitively against an assistant turn, and nothing else.
    pub needle: &'static str,
}

/**
 * Every marker Sidq will act on.
 *
 * Verified against real transcripts, one vendor at a time. The list is short
 * because it is honest rather than because the work is unfinished: adding
 * ChatGPT's or Cursor's wording means finding a real instance of it first, and
 * the browser assistants need the extension to see the page at all.
 */
pub const MARKERS: [Marker; 2] = [
    /*
     * Verified: eleven occurrences across real Claude Code transcripts, every
     * one an assistant turn. The tracking parameter is the tell — no person
     * types `?from=cc_cli_limit`, which is what makes this safe to act on.
     */
    Marker {
        source: "claude-code",
        needle: "from=cc_cli_limit",
    },
    /*
     * The same event as rendered without the link. Kept separate rather than
     * loosened into one fuzzy pattern, so that if this one ever fires wrongly
     * it can be removed without taking the reliable one with it.
     */
    Marker {
        source: "claude-code",
        needle: "you've hit your monthly spend limit",
    },
];

/**
 * Has this assistant stopped?
 *
 * `body` must be an assistant's own turn. Passing a user's turn is the one way
 * to make this wrong, and the reason the caller's side of that is asserted in
 * `index_store` rather than assumed here.
 */
pub fn hit(source: &str, body: &str) -> bool {
    let body = body.to_lowercase();
    MARKERS
        .iter()
        .any(|m| m.source == source && body.contains(m.needle))
}

/// Whether Sidq watches for this source's wall at all.
pub fn watched(source: &str) -> bool {
    MARKERS.iter().any(|m| m.source == source)
}

/// A session whose assistant has stopped, as the rest of the app needs it.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct Stopped {
    pub session_id: String,
    pub source: String,
    pub title: String,
    pub project: String,
}

/**
 * The last wall Sidq announced.
 *
 * One key holding one session id, not a row per session. The question being
 * asked is "have I already said this", and the only answer that matters is
 * about the most recent one — a table would grow forever to answer a question
 * that is only ever asked about the newest thing in it.
 */
const SEEN_KEY: &str = "wall_seen";

/// How far back a sweep looks. The wall is a thing that just happened.
const RECENT: usize = 6;

/**
 * Has an assistant stopped since the last time this was asked?
 *
 * `None` most of the time, which is the point: this runs on the sweep clock and
 * the common case has to cost almost nothing.
 *
 * ── Why the *last* assistant turn and not any of them ───────────────────────
 *
 * The wall is where a conversation ended. A limit message in the middle of a
 * transcript is one somebody already worked around — announcing it would be
 * offering to rescue them from a place they left hours ago.
 */
pub fn newly_hit(conn: &rusqlite::Connection) -> Option<Stopped> {
    let already = crate::index_store::setting(conn, SEEN_KEY);

    for source in MARKERS.iter().map(|m| m.source) {
        let recent: Vec<(String, String, String)> = conn
            .prepare(
                "SELECT session_id, title, project_path FROM sessions
                  WHERE source = ?1 ORDER BY ended_at DESC LIMIT ?2",
            )
            .and_then(|mut stmt| {
                stmt.query_map(rusqlite::params![source, RECENT as i64], |r| {
                    Ok((r.get(0)?, r.get(1)?, r.get(2)?))
                })
                .map(|rows| rows.filter_map(Result::ok).collect())
            })
            .unwrap_or_default();

        for (session_id, title, project) in recent {
            if already.as_deref() == Some(session_id.as_str()) {
                /*
                 * Announced already. `break` rather than `continue`: the list
                 * is newest first, so everything past the one we last spoke
                 * about is older than it and was either announced then or is
                 * not worth announcing now.
                 */
                break;
            }

            /*
             * The assistant's own turn, and only that. "Exchange" is a
             * screen-read block that holds both sides at once, so it is not
             * proof the assistant said anything — and a person quoting a limit
             * message into a chat is exactly the sentence this must not fire on.
             */
            let last: Option<String> = conn
                .query_row(
                    "SELECT body FROM messages
                      WHERE session_id = ?1 AND role = 'Assistant'
                      ORDER BY rowid DESC LIMIT 1",
                    [&session_id],
                    |r| r.get(0),
                )
                .ok();

            if last.is_some_and(|body| hit(source, &body)) {
                crate::index_store::put_setting(conn, SEEN_KEY, &session_id);
                return Some(Stopped {
                    session_id,
                    source: source.to_string(),
                    title,
                    project,
                });
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The real thing, copied from a transcript on this machine.
    const REAL: &str = "You've hit your monthly spend limit · raise it at \
                        claude.ai/settings/usage?from=cc_cli_limit";

    // ── Finding it in a real index ──────────────────────────────────────────

    use rusqlite::Connection;

    fn db() -> Connection {
        crate::index_store::tests::memory()
    }

    fn session(conn: &Connection, id: &str, source: &str) {
        conn.execute(
            "INSERT INTO sessions (session_id, source, title, project_path, ended_at)
             VALUES (?1, ?2, 'The index', '/Sidq', 1)",
            [id, source],
        )
        .unwrap();
    }

    fn say(conn: &Connection, id: &str, role: &str, body: &str) {
        conn.execute(
            "INSERT INTO messages (session_id, role, body) VALUES (?1, ?2, ?3)",
            rusqlite::params![id, role, body],
        )
        .unwrap();
    }

    #[test]
    fn a_session_that_stopped_at_the_wall_is_found() {
        let conn = db();
        session(&conn, "s1", "claude-code");
        say(&conn, "s1", "You", "keep going");
        say(&conn, "s1", "Assistant", REAL);

        let stopped = newly_hit(&conn).expect("the wall");
        assert_eq!(stopped.session_id, "s1");
        assert_eq!(stopped.source, "claude-code");
        assert_eq!(stopped.title, "The index");
    }

    #[test]
    fn the_same_wall_is_announced_once_and_not_every_sweep() {
        /*
         * This runs on an eight-second clock. Without the memory it would
         * notify somebody every eight seconds for as long as the session stayed
         * the newest one — which is the single fastest way to get a feature
         * turned off forever.
         */
        let conn = db();
        session(&conn, "s1", "claude-code");
        say(&conn, "s1", "Assistant", REAL);

        assert!(newly_hit(&conn).is_some());
        assert!(newly_hit(&conn).is_none(), "announced twice");
        assert!(newly_hit(&conn).is_none());
    }

    #[test]
    fn a_person_quoting_the_limit_message_never_fires_it() {
        /*
         * The same guarantee as `hit`, at the level that actually runs. Only
         * the assistant's own turn is read — somebody pasting the message in to
         * ask about it is a person typing, and interrupting them over it would
         * be the feature working exactly backwards.
         */
        let conn = db();
        session(&conn, "s1", "claude-code");
        say(&conn, "s1", "You", REAL);
        say(&conn, "s1", "You", "why does it say that");

        assert_eq!(newly_hit(&conn), None);
    }

    #[test]
    fn a_limit_somebody_already_worked_around_is_not_announced() {
        /*
         * The wall is where a conversation ended. Firing on one in the middle
         * of a transcript is offering to rescue somebody from a place they
         * left an hour ago, which reads as the app not knowing what is going on.
         */
        let conn = db();
        session(&conn, "s1", "claude-code");
        say(&conn, "s1", "Assistant", REAL);
        say(&conn, "s1", "Assistant", "raised it, carrying on");

        assert_eq!(newly_hit(&conn), None);
    }

    #[test]
    fn a_source_nobody_verified_is_not_guessed_at() {
        // Cursor writes its own wording for this and nobody has seen it. A
        // match here would be asserting something unchecked against real users.
        let conn = db();
        session(&conn, "s1", "cursor");
        say(&conn, "s1", "Assistant", REAL);

        assert_eq!(newly_hit(&conn), None);
    }

    #[test]
    fn a_second_wall_after_the_first_is_still_announced() {
        // The memory must not become "announced once, then never again".
        let conn = db();
        session(&conn, "s1", "claude-code");
        say(&conn, "s1", "Assistant", REAL);
        assert!(newly_hit(&conn).is_some());

        conn.execute(
            "UPDATE sessions SET ended_at = 1 WHERE session_id = 's1'",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sessions (session_id, source, title, project_path, ended_at)
             VALUES ('s2', 'claude-code', 'Another', '/Sidq', 2)",
            [],
        )
        .unwrap();
        say(&conn, "s2", "Assistant", REAL);

        assert_eq!(
            newly_hit(&conn).map(|s| s.session_id),
            Some("s2".to_string())
        );
    }

    #[test]
    fn an_ordinary_session_costs_nothing_and_says_nothing() {
        let conn = db();
        session(&conn, "s1", "claude-code");
        say(&conn, "s1", "You", "we should handle the rate limit here");
        say(&conn, "s1", "Assistant", "added a retry with backoff");

        assert_eq!(newly_hit(&conn), None);
    }

    #[test]
    fn the_real_marker_fires() {
        assert!(hit("claude-code", REAL));
    }

    /// Things somebody genuinely types while building software.
    const INNOCENT: [&str; 8] = [
        "we should handle the rate limit here",
        "what happens when you hit your usage limit?",
        "add a retry when the API returns a rate limit error",
        "the limit will reset at some point, right?",
        "I keep hitting limits in Claude",
        "rate limiting is done in the middleware",
        "you've hit the ceiling on that plan I think",
        "monthly spend is capped at the org level",
    ];

    #[test]
    fn a_person_talking_about_rate_limits_never_fires_it() {
        /*
         * The failure that would kill this feature. Somebody building anything
         * that talks to an API discusses rate limits constantly, and a
         * notification in the middle of work that was going fine is worse than
         * never firing at all — it only has to be wrong twice before the whole
         * thing gets turned off.
         */
        for innocent in INNOCENT {
            assert!(!hit("claude-code", innocent), "fired on: {innocent}");
        }
    }

    #[test]
    fn a_marker_only_applies_to_the_assistant_it_was_seen_in() {
        // Vendors word this differently. Matching Claude Code's text against a
        // Cursor session would be asserting something nobody has checked.
        assert!(!hit("cursor", REAL));
        assert!(!hit("chatgpt", REAL));
    }

    #[test]
    fn matching_does_not_care_about_case() {
        assert!(hit("claude-code", &REAL.to_uppercase()));
        assert!(hit("claude-code", &REAL.to_lowercase()));
    }

    #[test]
    fn an_unwatched_source_says_so_rather_than_pretending() {
        /*
         * `watched` is how the rest of the app can tell "no wall here" from "we
         * do not look at this one", which are different answers and get
         * different copy.
         */
        assert!(watched("claude-code"));
        assert!(!watched("cursor"));
        assert!(!watched("chatgpt"));
    }

    #[test]
    fn every_marker_is_specific_enough_to_be_safe() {
        /*
         * A guard on the list itself, aimed at the next person adding a vendor
         * and reaching for something like "limit" or "quota".
         *
         * Tested against sentences rather than against length, which was the
         * first version of this and was wrong: `from=cc_cli_limit` is seventeen
         * characters and is the *most* specific marker here, because no person
         * types a tracking parameter. Length was a proxy for the property. The
         * property is that it never matches something somebody said.
         */
        for m in MARKERS {
            for innocent in INNOCENT {
                assert!(
                    !innocent.to_lowercase().contains(m.needle),
                    "{:?} matches something a person would type: {innocent}",
                    m.needle
                );
            }
            assert_eq!(
                m.needle,
                m.needle.to_lowercase(),
                "{:?} must be lowercase",
                m.needle
            );
            assert!(!m.source.is_empty());
        }
    }
}
