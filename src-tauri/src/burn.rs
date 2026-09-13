//! How long a subscription lasted before it stopped.
//!
//! Entirely local. Nothing here leaves the machine, and nothing here is
//! computed from anything Sidq had to be told: `wall` already recognises a
//! limit message and is verified against real transcripts, and `sessions`
//! already records `active_minutes` and `ended_at` for every conversation the
//! indexer has read. The meter is those two facts joined.
//!
//! ── Why this is a number and not a claim ────────────────────────────────────
//! "Their limits are too tight" is an opinion and everybody already has one.
//! "Claude Code stopped you 4 times this week, and your longest run before it
//! did was 94 minutes" is arithmetic about a company far larger than this one,
//! taken from your own transcripts, which they cannot refute without publishing
//! numbers they do not publish.
//!
//! ── What it deliberately will not say ───────────────────────────────────────
//! An empty index reports `None`, never zero. "0 minutes" is a lie about a
//! machine that has not been read yet, and a meter that opens by lying is one
//! nobody believes the week it finally has something to say.

use rusqlite::Connection;

/// How far back a week reaches, in seconds.
const WEEK: i64 = 7 * 24 * 60 * 60;

/// One assistant's record of stopping.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Burn {
    /// The assistant, as a person writes it.
    pub label: String,
    /// Times it stopped inside the window.
    pub walls: u32,
    /**
     * Median active minutes of the sessions that ended at a wall.
     *
     * Median rather than mean, because one afternoon that ran for six hours
     * drags an average somewhere no day actually was. The number is meant to
     * answer "how long does this usually last", and the usual case is what a
     * median is for.
     */
    pub median_minutes: u32,
}

/**
 * What stopped you this week, worst first.
 *
 * Empty when nothing did, which is the common case and is why this has to cost
 * almost nothing: it is read for a panel that is on screen whether or not there
 * is anything to say.
 */
pub fn this_week(conn: &Connection) -> Vec<Burn> {
    since(conn, crate::entitlement::now_secs() - WEEK)
}

/// The same question over any window, so the tests can choose one.
pub fn since(conn: &Connection, cutoff: i64) -> Vec<Burn> {
    let mut out: Vec<Burn> = crate::wall::sources()
        .filter_map(|source| one(conn, source, cutoff))
        .collect();

    // Worst first: whoever stopped you most is the one worth naming.
    out.sort_by(|a, b| b.walls.cmp(&a.walls).then(a.label.cmp(&b.label)));
    out
}

fn one(conn: &Connection, source: &str, cutoff: i64) -> Option<Burn> {
    /*
     * Every session of this assistant's that ended inside the window, with the
     * minutes it ran for. Filtered down to the ones that ended *at a wall* in
     * Rust rather than in SQL, because deciding that means reading the last
     * assistant turn and matching it against the markers, which is `wall`'s job
     * and not a query's.
     */
    let candidates: Vec<(String, i64)> = conn
        .prepare(
            "SELECT session_id, active_minutes FROM sessions
              WHERE source = ?1 AND ended_at >= ?2
              ORDER BY ended_at DESC",
        )
        .and_then(|mut stmt| {
            stmt.query_map(rusqlite::params![source, cutoff], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .map(|rows| rows.filter_map(Result::ok).collect())
        })
        .unwrap_or_default();

    let mut minutes: Vec<i64> = candidates
        .into_iter()
        .filter(|(id, _)| crate::wall::ended_at_wall(conn, id, source))
        .map(|(_, m)| m)
        .collect();

    if minutes.is_empty() {
        return None;
    }

    minutes.sort_unstable();

    Some(Burn {
        label: crate::sources::label(source).unwrap_or(source).to_string(),
        walls: minutes.len() as u32,
        median_minutes: median(&minutes),
    })
}

/**
 * The middle value, or the lower of the two middles on an even count.
 *
 * The lower rather than the mean of the pair, deliberately. This number is
 * quoted publicly, and of two defensible answers the smaller one is the one
 * nobody can accuse of flattering the argument.
 */
fn median(sorted: &[i64]) -> u32 {
    let n = sorted.len();
    let value = if n % 2 == 1 {
        sorted[n / 2]
    } else {
        sorted[n / 2 - 1]
    };
    value.max(0) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    const REAL: &str = "You've hit your monthly spend limit · raise it at \
                        claude.ai/settings/usage?from=cc_cli_limit";

    fn db() -> Connection {
        crate::index_store::tests::memory()
    }

    /// A session that ran for `minutes` and then said `last`.
    fn session(conn: &Connection, id: &str, source: &str, minutes: i64, last: &str) {
        conn.execute(
            "INSERT INTO sessions (session_id, source, title, ended_at, active_minutes)
             VALUES (?1, ?2, 'A session', 1000, ?3)",
            rusqlite::params![id, source, minutes],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO messages (session_id, role, body) VALUES (?1, 'Assistant', ?2)",
            rusqlite::params![id, last],
        )
        .unwrap();
    }

    #[test]
    fn an_empty_index_says_nothing_rather_than_zero() {
        /*
         * The one number this must never print. "Your plan lasted 0 minutes" is
         * a lie about a machine nobody has read yet, and a meter that opens by
         * lying is one nobody believes the week it has something to say.
         */
        assert_eq!(since(&db(), 0), Vec::new());
    }

    #[test]
    fn a_session_that_ended_at_the_wall_reports_how_long_it_lasted() {
        let conn = db();
        session(&conn, "s1", "claude-code", 94, REAL);

        let out = since(&conn, 0);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].label, "Claude Code");
        assert_eq!(out[0].walls, 1);
        assert_eq!(out[0].median_minutes, 94);
    }

    #[test]
    fn a_session_that_merely_discussed_rate_limits_is_not_a_wall() {
        // The guarantee `wall` already makes, at the level that gets published.
        // A number inflated by conversations *about* limits is a number
        // somebody can take apart in one reply.
        let conn = db();
        session(&conn, "s1", "claude-code", 200, "Rate limits are usually per-org.");

        assert_eq!(since(&conn, 0), Vec::new());
    }

    #[test]
    fn the_median_is_the_middle_and_not_the_average() {
        /*
         * One six-hour afternoon drags a mean somewhere no day actually was.
         * 20, 90, 400: the mean is 170 and nothing resembling that happened.
         */
        let conn = db();
        session(&conn, "s1", "claude-code", 20, REAL);
        session(&conn, "s2", "claude-code", 90, REAL);
        session(&conn, "s3", "claude-code", 400, REAL);

        let out = since(&conn, 0);
        assert_eq!(out[0].walls, 3);
        assert_eq!(out[0].median_minutes, 90);
    }

    #[test]
    fn an_even_count_takes_the_lower_middle_rather_than_flattering_the_number() {
        // This gets quoted in public. Of two defensible answers, the smaller is
        // the one nobody can accuse of being chosen to help.
        let conn = db();
        session(&conn, "s1", "claude-code", 60, REAL);
        session(&conn, "s2", "claude-code", 120, REAL);

        assert_eq!(since(&conn, 0)[0].median_minutes, 60);
    }

    #[test]
    fn nothing_outside_the_window_is_counted() {
        // "This week" has to mean this week, or the first number anybody checks
        // is one they cannot reproduce.
        let conn = db();
        session(&conn, "s1", "claude-code", 94, REAL);

        // The fixture ends at 1000; a cutoff past it excludes it.
        assert_eq!(since(&conn, 5000), Vec::new());
    }

    #[test]
    fn whoever_stopped_you_most_is_named_first() {
        let conn = db();
        session(&conn, "a1", "claude-code", 30, REAL);
        session(&conn, "a2", "claude-code", 30, REAL);
        session(&conn, "b1", "cursor", 30, REAL);

        let out = since(&conn, 0);
        assert_eq!(out.first().map(|b| b.label.as_str()), Some("Claude Code"));
    }

    #[test]
    fn a_source_with_no_marker_can_never_appear() {
        /*
         * Cursor has no limit message Sidq recognises, so nothing read out of a
         * Cursor session is evidence of one. Without this the meter would
         * publish a figure for an assistant it cannot actually detect.
         */
        let conn = db();
        session(&conn, "s1", "cursor", 94, REAL);

        assert_eq!(since(&conn, 0), Vec::new());
    }
}
