//! How much of the work has gone through an AI, counted and never quoted.
//!
//! ── Why this exists ──────────────────────────────────────────────────────────
//!
//! Sidq has been sold as "carry a conversation between assistants", which is a
//! productivity tool: useful, liked, and the first line cut when a budget is
//! reviewed. Nobody has ever had a budget for it and nobody is in trouble for
//! not having it.
//!
//! There is a question next to it that nobody can answer and several people
//! need to. An engineer does not know how much of their work has gone through
//! an assistant, or which ones, or for how long. Neither does the person who
//! runs their team, and that one has to answer it — to a security reviewer, to
//! a finance owner asking what four AI subscriptions are for, to themselves.
//!
//! Sidq is the only thing on the machine that can answer it, because it already
//! reads every assistant there. And it can answer it without any of it leaving,
//! which is the part no competitor can match: everyone else has to upload the
//! conversations to count them.
//!
//! ── What this can and cannot hold ───────────────────────────────────────────
//!
//! Numbers, the names of assistants, and the names of projects. That is the
//! whole list, and it is the same guarantee `telemetry::Event` makes and for
//! the same reason: the type will not hold a conversation, a title, a prompt or
//! a path, so no amount of forgetting can leak one.
//!
//! A project's *name* is here and its path is not. "Sidq" is a word; the path
//! it lives at is `/Users/<somebody>/...` and carries a person's name and the
//! shape of their disk.

use crate::index_store;
use rusqlite::Connection;

/// How many projects a report names. Beyond this it is a list, not a picture.
const TOP_PROJECTS: usize = 8;

/// One assistant, and how much went through it.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct BySource {
    /// The assistant's own id: "claude-code", "cursor", "chatgpt".
    pub source: String,
    pub conversations: usize,
    pub exchanges: usize,
    pub hours: usize,
}

/// One project, by name only.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct ByProject {
    pub name: String,
    pub conversations: usize,
    pub exchanges: usize,
    pub hours: usize,
}

/**
 * What has gone through an assistant on this machine.
 *
 * Deliberately a flat set of counts rather than anything derived or scored.
 * A number somebody can check against their own memory of the year is worth
 * more than an index nobody can argue with.
 */
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct Report {
    pub conversations: usize,
    pub exchanges: usize,
    pub hours: usize,
    /// Unix millis of the earliest and latest conversation. Zero when empty.
    pub since: i64,
    pub until: i64,
    /// Busiest first.
    pub sources: Vec<BySource>,
    /// Busiest first, capped. Names only, never paths.
    pub projects: Vec<ByProject>,
}

/**
 * Build the report.
 *
 * Minutes are summed and turned into hours at the end rather than per row,
 * because rounding each source to an hour and adding those up produces a total
 * that does not match the total — and somebody will add them up.
 */
pub fn report(conn: &Connection) -> Report {
    let (conversations, exchanges) = totals(conn);
    let (since, until) = span(conn);

    Report {
        conversations,
        exchanges,
        hours: hours(conn),
        since,
        until,
        sources: sources(conn),
        projects: projects(conn),
    }
}

fn totals(conn: &Connection) -> (usize, usize) {
    conn.query_row("SELECT COUNT(*), COALESCE(SUM(turns), 0) FROM sessions", [], |r| {
        Ok((r.get::<_, i64>(0)? as usize, r.get::<_, i64>(1)? as usize))
    })
    .unwrap_or((0, 0))
}

fn hours(conn: &Connection) -> usize {
    conn.query_row("SELECT COALESCE(SUM(active_minutes), 0) FROM sessions", [], |r| {
        r.get::<_, i64>(0)
    })
    .map(|m| (m.max(0) / 60) as usize)
    .unwrap_or(0)
}

/// Earliest and latest conversation. `(0, 0)` when there is nothing indexed.
fn span(conn: &Connection) -> (i64, i64) {
    conn.query_row(
        "SELECT COALESCE(MIN(ended_at), 0), COALESCE(MAX(ended_at), 0)
           FROM sessions WHERE ended_at > 0",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .unwrap_or((0, 0))
}

fn sources(conn: &Connection) -> Vec<BySource> {
    let Ok(mut stmt) = conn.prepare(
        "SELECT source, COUNT(*), COALESCE(SUM(turns), 0), COALESCE(SUM(active_minutes), 0)
           FROM sessions
          GROUP BY source
          ORDER BY COUNT(*) DESC",
    ) else {
        return Vec::new();
    };

    stmt.query_map([], |r| {
        Ok(BySource {
            source: r.get(0)?,
            conversations: r.get::<_, i64>(1)? as usize,
            exchanges: r.get::<_, i64>(2)? as usize,
            hours: (r.get::<_, i64>(3)?.max(0) / 60) as usize,
        })
    })
    .map(|rows| rows.filter_map(Result::ok).collect())
    .unwrap_or_default()
}

fn projects(conn: &Connection) -> Vec<ByProject> {
    index_store::projects(conn, TOP_PROJECTS)
        .into_iter()
        .map(|p| ByProject {
            // The name, never `p.path`. See the note at the top of this file.
            name: p.name,
            conversations: p.conversations,
            exchanges: p.turns,
            hours: p.minutes / 60,
        })
        .collect()
}

/**
 * "1 conversation", not "1 conversations".
 *
 * Small, and this is built to be pasted somewhere public. A page arguing that
 * the numbers on it are trustworthy cannot also say "1 conversations" — the
 * reader does not separate the two kinds of care.
 */
fn plural(n: usize, word: &str) -> String {
    if n == 1 { format!("1 {word}") } else { format!("{n} {word}s") }
}

/**
 * The report as the text somebody actually shares.
 *
 * Markdown rather than a screenshot, because it is read by a person deciding
 * whether the tool is worth installing and by an assistant asked to summarise
 * it, and a picture is useless to the second one.
 */
pub fn as_markdown(r: &Report) -> String {
    if r.conversations == 0 {
        return "# Nothing indexed yet\n\nSidq fills up as work happens in an assistant.\n"
            .to_string();
    }

    let mut out = format!(
        "# What has gone through an AI\n\n{}, {}, about {}.\n\n",
        plural(r.conversations, "conversation"),
        plural(r.exchanges, "exchange"),
        plural(r.hours, "hour")
    );

    out.push_str("## By assistant\n\n");
    for s in &r.sources {
        out.push_str(&format!(
            "- {}: {}, {}, about {}h\n",
            s.source,
            plural(s.conversations, "conversation"),
            plural(s.exchanges, "exchange"),
            s.hours
        ));
    }

    if !r.projects.is_empty() {
        out.push_str("\n## By project\n\n");
        for p in &r.projects {
            out.push_str(&format!(
                "- {}: {}, {}, about {}h\n",
                p.name,
                plural(p.conversations, "conversation"),
                plural(p.exchanges, "exchange"),
                p.hours
            ));
        }
    }

    out.push_str("\nCounted on one machine. No conversation, title or path leaves it.\n");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sessions (
                session_id TEXT PRIMARY KEY, source TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '', project TEXT NOT NULL DEFAULT '',
                project_path TEXT NOT NULL DEFAULT '', branch TEXT NOT NULL DEFAULT '',
                ended_at INTEGER NOT NULL DEFAULT 0, turns INTEGER NOT NULL DEFAULT 0,
                active_minutes INTEGER NOT NULL DEFAULT 0,
                indexed_at INTEGER NOT NULL DEFAULT 0);",
        )
        .unwrap();
        conn
    }

    fn add(conn: &Connection, id: &str, source: &str, project: &str, turns: i64, mins: i64, at: i64) {
        conn.execute(
            "INSERT INTO sessions (session_id, source, project, project_path, turns, active_minutes, ended_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![id, source, project, format!("/Users/somebody/{project}"), turns, mins, at],
        )
        .unwrap();
    }

    #[test]
    fn an_empty_index_reports_nothing_rather_than_failing() {
        // A fresh install is a normal state. It must not look like an error, and
        // it must not render a page of zeroes either.
        let r = report(&db());
        assert_eq!(r.conversations, 0);
        assert_eq!((r.since, r.until), (0, 0));
        assert!(as_markdown(&r).contains("Nothing indexed yet"));
    }

    #[test]
    fn the_totals_are_the_sum_of_the_parts() {
        /*
         * Somebody will add the per-assistant rows up and check them against
         * the headline. Minutes are summed before being turned into hours for
         * exactly this reason: rounding each row first gives a total that does
         * not match, and the person who notices stops trusting the whole page.
         */
        let conn = db();
        add(&conn, "a", "claude-code", "Sidq", 100, 90, 1_000);
        add(&conn, "b", "claude-code", "Sidq", 50, 90, 2_000);
        add(&conn, "c", "cursor", "Other", 20, 30, 3_000);

        let r = report(&conn);
        assert_eq!(r.conversations, 3);
        assert_eq!(r.exchanges, 170);
        assert_eq!(r.hours, 3, "210 minutes is three hours, not two");
        assert_eq!(r.sources.iter().map(|s| s.conversations).sum::<usize>(), r.conversations);
        assert_eq!(r.sources.iter().map(|s| s.exchanges).sum::<usize>(), r.exchanges);
    }

    #[test]
    fn assistants_come_back_busiest_first() {
        let conn = db();
        add(&conn, "a", "cursor", "One", 5, 10, 1_000);
        add(&conn, "b", "claude-code", "One", 5, 10, 2_000);
        add(&conn, "c", "claude-code", "One", 5, 10, 3_000);

        let r = report(&conn);
        assert_eq!(r.sources.first().map(|s| s.source.as_str()), Some("claude-code"));
    }

    #[test]
    fn the_span_is_the_first_and_last_conversation() {
        let conn = db();
        add(&conn, "a", "cursor", "One", 1, 1, 5_000);
        add(&conn, "b", "cursor", "One", 1, 1, 1_000);
        add(&conn, "c", "cursor", "One", 1, 1, 9_000);

        let r = report(&conn);
        assert_eq!((r.since, r.until), (1_000, 9_000));
    }

    #[test]
    fn a_report_can_never_carry_a_path_or_a_conversation() {
        /*
         * The guarantee this file is worth anything for.
         *
         * A project's name is a word. Its path is `/Users/<somebody>/...` and
         * carries a person's name and the shape of their disk, and this is
         * built to be published — so the path must not be reachable from the
         * report at all, not merely left out of today's markdown.
         */
        let conn = db();
        add(&conn, "a", "claude-code", "Sidq", 10, 10, 1_000);

        let r = report(&conn);
        let json = serde_json::to_string(&r).unwrap();
        for leak in ["/Users/", "somebody", "title", "prompt"] {
            assert!(!json.contains(leak), "the report carried {leak}");
        }
        assert!(!as_markdown(&r).contains("/Users/"));

        // And the name is still there, because a report of unnamed things is
        // not a report of anything.
        assert!(as_markdown(&r).contains("Sidq"));
    }

    #[test]
    fn one_of_something_is_not_plural() {
        // On a page whose whole argument is that its numbers can be trusted,
        // "1 conversations" costs more than it looks like it should.
        let conn = db();
        add(&conn, "a", "cursor", "One", 1, 61, 1_000);

        let text = as_markdown(&report(&conn));
        assert!(text.contains("1 conversation,"), "{text}");
        assert!(!text.contains("1 conversations"), "{text}");
        assert!(text.contains("1 exchange,"), "{text}");
    }

    #[test]
    fn the_markdown_says_where_it_was_counted() {
        // It is going to be pasted somewhere public. Whoever reads it has to be
        // able to tell that none of it came off a server.
        let conn = db();
        add(&conn, "a", "cursor", "One", 1, 1, 1_000);
        assert!(as_markdown(&report(&conn)).contains("No conversation, title or path leaves it"));
    }
}
