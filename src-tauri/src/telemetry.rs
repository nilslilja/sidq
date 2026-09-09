//! Counting what happens, without ever learning what was said.
//!
//! ── Why this exists at all, in an app whose whole claim is privacy ───────────
//!
//! The website has had analytics from the start, so visitors and downloads are
//! known. The app has had none, which meant these four situations were
//! indistinguishable from the outside:
//!
//!   - nobody downloaded it
//!   - people downloaded it and never opened it
//!   - people opened it and gave up during setup
//!   - people use it every day and will not pay
//!
//! They need opposite fixes. Fifty thousand impressions and no sales is not a
//! diagnosis, and without this there is no way to get one.
//!
//! ── Why it cannot leak a conversation ────────────────────────────────────────
//!
//! Not because the code is careful. Because the type will not hold one.
//!
//! An `Event` is a fixed set of variants. The only strings it can carry are
//! `&'static str` — literals compiled into the binary — and the only numbers are
//! counts. There is no variant that takes a `String`, so no transcript, title,
//! prompt, path or filename can be put into one without changing this file, and
//! changing this file means changing a type that the whole crate can see.
//!
//! That is the same reasoning `index_store::noted` uses: a rule enforced by the
//! shape of the data survives, and a rule enforced by remembering to filter does
//! not.
//!
//! ── Why it is off unless somebody turns it on ────────────────────────────────
//!
//! The privacy policy said, in as many words, that there are no analytics
//! trackers on the desktop app. Shipping this on by default would make that a
//! lie, and the policy is the reason a security-minded buyer trusts anything
//! else on the page. So: off, one plain-language question during setup, a list
//! in Settings of exactly what is counted, and the policy rewritten to name it.

use crate::index_store;
use std::io::Read;
use std::process::Command;

/// The setting that decides. Absent means off, which is the default forever.
pub const CONSENT_KEY: &str = "telemetry.enabled";

/// This install's anonymous id. Not the account, not the email.
const INSTALL_KEY: &str = "telemetry.install";

/// Sent per flush. Small, because these are counters and not a log.
const BATCH: usize = 50;

/// Nothing waits on this. It is the least important request the app makes.
const TIMEOUT_SECS: &str = "4";

/**
 * Everything that can be counted.
 *
 * Deliberately a closed set. Adding a case is a deliberate act in a reviewed
 * file, which is the only reason the guarantee above is worth anything.
 */
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Event {
    /// The app was launched.
    Opened,
    /// Setup reached a step. The step is one of a fixed list of screen names.
    Setup { step: &'static str },
    /// Setup finished.
    Ready,
    /// A conversation was handed over. `attached` distinguishes file from paste.
    HandedOver { attached: bool },
    /// A project memory was taken, by a person or by an assistant over MCP.
    MemoryTaken { by_assistant: bool },
    /// An assistant was connected to the MCP server.
    Connected,
    /// A sweep finished, with how many conversations are indexed in total.
    Indexed { conversations: usize },
    /// Somebody hit the free weekly cap.
    HitTheLimit,
    /// The pricing page was opened from inside the app.
    SawThePlans,
}

/**
 * One of each, so the list in Settings is derived rather than retyped.
 *
 * The window prints this. A hand-written copy of it would start lying the
 * moment a variant was added, and it would lie in the one place somebody goes
 * to check whether the promise on the privacy page is true — which is the worst
 * place in the product for a stale sentence to be.
 *
 * A test below reads the `name` match out of this file and asserts every arm in
 * it appears here, so adding a variant and forgetting this array fails the
 * suite rather than shipping a short list.
 */
pub const EVERY_EVENT: [Event; 9] = [
    Event::Opened,
    Event::Setup { step: "" },
    Event::Ready,
    Event::HandedOver { attached: false },
    Event::MemoryTaken { by_assistant: false },
    Event::Connected,
    Event::Indexed { conversations: 0 },
    Event::HitTheLimit,
    Event::SawThePlans,
];

impl Event {
    /// The name that goes on the wire. A literal, always.
    fn name(self) -> &'static str {
        match self {
            Event::Opened => "opened",
            Event::Setup { .. } => "setup",
            Event::Ready => "ready",
            Event::HandedOver { .. } => "handed_over",
            Event::MemoryTaken { .. } => "memory_taken",
            Event::Connected => "connected",
            Event::Indexed { .. } => "indexed",
            Event::HitTheLimit => "hit_the_limit",
            Event::SawThePlans => "saw_the_plans",
        }
    }

    /// The one detail a variant carries, as a literal. Never free text.
    fn detail(self) -> &'static str {
        match self {
            Event::Setup { step } => step,
            Event::HandedOver { attached: true } => "file",
            Event::HandedOver { attached: false } => "clipboard",
            Event::MemoryTaken { by_assistant: true } => "assistant",
            Event::MemoryTaken { by_assistant: false } => "person",
            _ => "",
        }
    }

    /// The one number a variant carries. Zero when it carries none.
    fn count(self) -> i64 {
        match self {
            Event::Indexed { conversations } => conversations as i64,
            _ => 0,
        }
    }

    /**
     * What this counts, in a sentence somebody can check against the app.
     *
     * Written for the person reading the list in Settings, not for us. Where a
     * variant carries a detail, the sentence names every value that detail can
     * take, because "and some detail" is exactly the vagueness this list exists
     * to refuse.
     */
    pub fn describe(self) -> &'static str {
        match self {
            Event::Opened => "Sidq was opened.",
            Event::Setup { .. } => {
                "Setup reached a step, by name: signin, sources, pill, handover, \
                 notifications, browse or discover."
            }
            Event::Ready => "Setup was finished.",
            Event::HandedOver { .. } => {
                "A conversation was handed over, and whether it went to a file or \
                 to the clipboard."
            }
            Event::MemoryTaken { .. } => {
                "A project memory was taken, and whether you took it or an \
                 assistant asked for it."
            }
            Event::Connected => "An assistant was connected to Sidq.",
            Event::Indexed { .. } => "How many conversations are indexed, as a number.",
            Event::HitTheLimit => "The free weekly handover limit was reached.",
            Event::SawThePlans => "The plans were opened from inside Sidq.",
        }
    }
}

/**
 * The whole list, as the window prints it: the name on the wire, and what it is.
 *
 * Read out of Rust rather than typed into the panel. The Settings list is the
 * only place somebody can check the privacy page against the program, so it has
 * to come from the same declaration the program counts against.
 */
pub fn catalogue() -> Vec<(String, String)> {
    EVERY_EVENT
        .iter()
        .map(|e| (e.name().to_string(), e.describe().to_string()))
        .collect()
}

/**
 * A setup step, if it is one of ours.
 *
 * This is the only place in the app where a `String` from the window becomes an
 * `Event`, which makes it the one hole in the guarantee at the top of this file
 * — so it is a lookup, not a conversion. An unrecognised name is counted as
 * nothing at all rather than passed along: a renamed step should cost a number,
 * never turn the queue into somewhere arbitrary text can be written from
 * JavaScript.
 *
 * The list is `StepId` in `src/lib/onboarding/steps.ts`. If a step is added
 * there and not here it stops being counted, which is the safe direction.
 */
pub fn setup_step(step: &str) -> Option<Event> {
    const STEPS: [&str; 7] =
        ["signin", "sources", "pill", "handover", "notifications", "browse", "discover"];

    STEPS.iter().find(|known| **known == step).map(|known| Event::Setup { step: known })
}

/// Whether the person said yes. Absent means no, and absent is the default.
pub fn enabled(conn: &rusqlite::Connection) -> bool {
    index_store::setting(conn, CONSENT_KEY).as_deref() == Some("yes")
}

/// Record the answer. Turning it off also throws away anything not yet sent.
pub fn set_enabled(conn: &rusqlite::Connection, on: bool) -> Option<()> {
    index_store::put_setting(conn, CONSENT_KEY, if on { "yes" } else { "no" })?;
    if !on {
        // Off means off, including for what is already queued. Sending a
        // backlog after somebody opts out is the worst version of this feature.
        let _ = conn.execute("DELETE FROM counted", []);
    }
    Some(())
}

/**
 * This install's id, made once and kept.
 *
 * Sixteen random bytes from the system. Not derived from the account, the
 * email, the hostname or the hardware, so it identifies a copy of the app and
 * cannot be joined to a person by anybody holding it — including us.
 */
pub fn install_id(conn: &rusqlite::Connection) -> String {
    if let Some(existing) = index_store::setting(conn, INSTALL_KEY) {
        return existing;
    }

    // Sixteen bytes, asked for by number.
    //
    // This read used to be `fs::read("/dev/urandom")`, which is a bug that ends
    // in a dead machine rather than a wrong id. `/dev/urandom` is a character
    // device and never reaches EOF; `fs::read` reads *to* EOF, so it does not
    // return, and the Vec it is filling doubles until the kernel kills whatever
    // is running. It killed the test binary at 10.8GB, 11.1GB and 18.9GB on an
    // 8GB machine before anybody looked at this line.
    //
    // `read_exact` into a fixed array is the whole fix: the size is stated, so
    // there is no growth to run away with, and no way to reintroduce one
    // without changing the array. A test below holds the shape of this.
    let mut bytes = [0u8; 16];
    let id = match std::fs::File::open("/dev/urandom")
        .and_then(|mut urandom| urandom.read_exact(&mut bytes))
    {
        Ok(()) => bytes.iter().map(|b| format!("{b:02x}")).collect::<String>(),
        // The clock is weak entropy and a fine last resort. It only has to
        // differ between two installs, and no id at all would cost every count
        // this module exists to take.
        Err(_) => format!("{:032x}", index_store::now_millis()),
    };
    let _ = index_store::put_setting(conn, INSTALL_KEY, &id);
    id
}

/**
 * Queue one event, if counting is on.
 *
 * Queued rather than sent, for two reasons. It works offline, which this app
 * is explicitly built to do. And it stops each event being its own request at
 * the moment it happens, which would turn the timing of the requests into a
 * description of somebody's session even though the contents say nothing.
 */
pub fn record(conn: &rusqlite::Connection, event: Event) {
    if !enabled(conn) {
        return;
    }

    let _ = conn.execute(
        "INSERT INTO counted (name, detail, count, at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![
            event.name(),
            event.detail(),
            event.count(),
            index_store::now_millis()
        ],
    );
}

/**
 * Queue one event, opening the index to do it.
 *
 * For the callers that have no connection in hand — a Tauri command that only
 * touched a window, the tray, the shortcut. Every one of them is a thing a
 * person just did, so this runs at most a few times a minute and never in a
 * loop; anything on the sweep path holds a connection already and calls
 * `record` with it.
 *
 * Silent when the index will not open. Counting must never be the reason
 * something a person asked for does not happen.
 */
pub fn count(event: Event) {
    if let Some(conn) = index_store::open() {
        record(&conn, event);
    }
}

/// One queued row, as it will be sent.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct Counted {
    pub name: String,
    pub detail: String,
    pub count: i64,
    pub at: i64,
}

/// What is waiting to be sent, oldest first.
pub fn queued(conn: &rusqlite::Connection, limit: usize) -> Vec<(i64, Counted)> {
    let Ok(mut stmt) = conn.prepare(
        "SELECT id, name, detail, count, at FROM counted ORDER BY at ASC LIMIT ?1",
    ) else {
        return Vec::new();
    };

    stmt.query_map(rusqlite::params![limit], |r| {
        Ok((
            r.get(0)?,
            Counted { name: r.get(1)?, detail: r.get(2)?, count: r.get(3)?, at: r.get(4)? },
        ))
    })
    .map(|rows| rows.filter_map(Result::ok).collect())
    .unwrap_or_default()
}

/**
 * The body of the request, built and testable without sending anything.
 *
 * Separate from `flush` precisely so a test can assert what would go on the
 * wire. A privacy guarantee nobody can inspect is a promise, not a property.
 */
pub fn payload(install: &str, version: &str, plan: &str, rows: &[Counted]) -> String {
    serde_json::json!({
        "install": install,
        "version": version,
        "plan": plan,
        "events": rows,
    })
    .to_string()
}

/**
 * Send what is queued and forget it.
 *
 * Through `/usr/bin/curl` for the same reason `entitlement` does: linking a TLS
 * stack to make one small POST a few times a day would roughly double a 4.5MB
 * binary, and this app never runs anywhere curl is missing.
 *
 * Rows are deleted only when curl reports success, so a failed send is retried
 * on the next flush rather than lost — and `--fail` is what makes a rejected
 * request an error rather than a body nobody reads.
 */
pub fn flush(conn: &rusqlite::Connection, url: &str, anon_key: &str, plan: &str) {
    if !enabled(conn) {
        return;
    }

    let rows = queued(conn, BATCH);
    if rows.is_empty() {
        return;
    }

    let body = payload(
        &install_id(conn),
        env!("CARGO_PKG_VERSION"),
        plan,
        &rows.iter().map(|(_, c)| c.clone()).collect::<Vec<_>>(),
    );

    let sent = Command::new("/usr/bin/curl")
        .args([
            "--silent",
            "--fail",
            "--output",
            "/dev/null",
            "--max-time",
            TIMEOUT_SECS,
            "-X",
            "POST",
            &format!("{url}/rest/v1/counted"),
            "-H",
            &format!("apikey: {anon_key}"),
            "-H",
            "Content-Type: application/json",
            "-d",
            &body,
        ])
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    if sent {
        for (id, _) in &rows {
            let _ = conn.execute("DELETE FROM counted WHERE id = ?1", rusqlite::params![id]);
        }
    }
}

/**
 * Send whatever is waiting, working out for itself where and as whom.
 *
 * `flush` takes its endpoint and plan as arguments so a test can call it; this
 * is the one that knows where they come from, and it is what the background
 * thread calls. Split that way round because a function that reads `option_env!`
 * cannot be tested against anything but the build it is in.
 *
 * The plan is the last one confirmed, read straight out of settings rather than
 * through `entitlement::current`, which goes to the network when its answer is
 * stale. Counting must never be the reason a request is made — only ever a
 * passenger on one it was already going to make.
 */
pub fn send_queued(conn: &rusqlite::Connection) {
    if !enabled(conn) {
        return;
    }

    // No endpoint compiled in means a local build. Nothing to send it to, and
    // nothing to complain about either.
    let (Some(url), Some(key)) =
        (option_env!("VITE_SUPABASE_URL"), option_env!("VITE_SUPABASE_ANON_KEY"))
    else {
        return;
    };

    flush(conn, url, key, crate::entitlement::last_known(conn).as_str());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE counted (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
                count INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL DEFAULT 0);",
        )
        .unwrap();
        conn
    }

    #[test]
    fn it_is_off_until_somebody_turns_it_on() {
        /*
         * The default is the whole basis of the privacy claim. A fresh install
         * that counts anything makes the policy false on first launch.
         */
        let conn = db();
        assert!(!enabled(&conn));

        record(&conn, Event::Opened);
        assert!(queued(&conn, 10).is_empty(), "something was counted before consent");
    }

    #[test]
    fn nothing_is_counted_while_it_is_off_even_after_being_on() {
        let conn = db();
        set_enabled(&conn, true).unwrap();
        record(&conn, Event::Opened);
        assert_eq!(queued(&conn, 10).len(), 1);

        set_enabled(&conn, false).unwrap();
        record(&conn, Event::Ready);

        // And the backlog goes too. Sending what was gathered before somebody
        // opted out is the worst possible reading of "you can turn this off".
        assert!(queued(&conn, 10).is_empty());
    }

    #[test]
    fn an_event_can_only_carry_a_literal_or_a_number() {
        /*
         * The guarantee, checked against the source rather than against a
         * value. `Event` has no variant holding a `String`, so no title, path,
         * prompt or transcript can be put in one without editing this file —
         * which is the point. A test over sample data would only prove that
         * today's callers behave.
         */
        let whole = include_str!("telemetry.rs");
        let code = whole.split("#[cfg(test)]").next().unwrap_or(whole);
        let decl = code
            .split("pub enum Event {")
            .nth(1)
            .and_then(|rest| rest.split('}').next())
            .expect("the Event declaration");

        assert!(!decl.contains("String"), "an Event variant can hold a String");
        assert!(!decl.contains("&str") || decl.contains("&'static str"));
    }

    #[test]
    fn the_payload_carries_counts_and_nothing_readable() {
        let conn = db();
        set_enabled(&conn, true).unwrap();
        record(&conn, Event::HandedOver { attached: true });
        record(&conn, Event::Indexed { conversations: 8_921 });

        let rows: Vec<Counted> = queued(&conn, 10).into_iter().map(|(_, c)| c).collect();
        let body = payload("abc123", "0.9.4", "pro", &rows);

        assert!(body.contains("\"handed_over\""));
        assert!(body.contains("\"file\""));
        assert!(body.contains("8921"));
        assert!(body.contains("abc123"));
        // The four things it must never be able to say.
        for leak in ["title", "prompt", "transcript", "/Users/"] {
            assert!(!body.contains(leak), "payload mentioned {leak}");
        }
    }

    #[test]
    fn the_install_id_is_stable_and_not_derived_from_the_person() {
        let conn = db();
        let first = install_id(&conn);
        assert_eq!(first, install_id(&conn), "a new id on every call is a new user every call");
        assert_eq!(first.len(), 32);
        assert!(first.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn nothing_reads_a_device_without_saying_how_much() {
        /*
         * The regression test for the worst bug this file has had.
         *
         * `install_id` read `/dev/urandom` with `fs::read`, which reads to EOF.
         * A character device has no EOF, so it never returned and the Vec it
         * was filling doubled until the kernel killed the process — 18.9GB on
         * an 8GB machine, three times in one evening.
         *
         * Checked against the source, not against behaviour, and deliberately.
         * A test that *ran* the bad version would reproduce it: it would hang,
         * take the machine with it, and report nothing. This one fails in a
         * millisecond and says why.
         */
        let whole = include_str!("telemetry.rs");
        let code = whole.split("#[cfg(test)]").next().unwrap_or(whole);

        for (line_no, line) in code.lines().enumerate() {
            // Comments are skipped, including the one above `install_id` that
            // quotes the bad call by name. Prose about a bug is not the bug,
            // and a scanner that cannot tell the difference gets deleted by
            // whoever it next accuses.
            let trimmed = line.trim_start();
            if trimmed.starts_with("//") || trimmed.starts_with('*') || trimmed.starts_with("/*")
            {
                continue;
            }

            let reads_to_eof = line.contains("fs::read(")
                || line.contains("read_to_end")
                || line.contains("read_to_string");
            assert!(
                !(reads_to_eof && line.contains("/dev/")),
                "line {} reads a device to EOF, which does not end: {}",
                line_no + 1,
                line.trim()
            );
        }

        // And the positive half: the device that is read is read by size.
        assert!(code.contains("read_exact"), "the urandom read no longer states a size");
    }

    #[test]
    fn two_installs_do_not_share_an_id() {
        // Same machine, same account. If these collide the whole count is one
        // person and the funnel is meaningless.
        assert_ne!(install_id(&db()), install_id(&db()));
    }

    #[test]
    fn the_printed_list_holds_every_event_there_is() {
        /*
         * The one that matters most in this file after the type itself.
         *
         * Settings prints `catalogue()` under a promise that it is everything
         * Sidq can count. Adding a variant and forgetting `EVERY_EVENT` would
         * leave that promise false, in the exact place somebody goes to check
         * whether the privacy page is true — and nothing else would notice,
         * because a short list renders perfectly.
         *
         * So the arms of `name` are read out of the source and every one of
         * them has to appear. Against the file rather than against a value,
         * for the same reason as the test above: a list checked against itself
         * proves nothing.
         */
        let whole = include_str!("telemetry.rs");
        let code = whole.split("#[cfg(test)]").next().unwrap_or(whole);
        // Cut at the function's own closing brace — a line that is exactly
        // four spaces and `}`. Splitting on the first `}` instead reads one
        // arm and stops, because `Event::Setup { .. }` closes a brace of its
        // own three lines in, and a one-arm list would pass every check below
        // while proving nothing.
        let arms = code
            .split("fn name(self) -> &'static str {")
            .nth(1)
            .and_then(|rest| rest.split("\n    }").next())
            .expect("the name match");

        let named: Vec<&str> = arms
            .lines()
            .filter_map(|line| line.split_once("=> \"")?.1.split('"').next())
            .collect();
        assert_eq!(named.len(), 9, "the name match no longer has nine arms");

        let printed: Vec<String> = catalogue().into_iter().map(|(name, _)| name).collect();
        for name in named {
            assert!(printed.contains(&name.to_string()), "{name} is counted and never listed");
        }
    }

    #[test]
    fn nothing_in_the_printed_list_is_unexplained() {
        // A name on its own is not a disclosure. "handed_over" tells somebody
        // nothing they could not have guessed, and guessing is what the list
        // exists to make unnecessary.
        for (name, description) in catalogue() {
            assert!(!description.is_empty(), "{name} is listed with nothing said about it");
            assert!(description.ends_with('.'), "{name} is described in half a sentence");
        }
    }

    #[test]
    fn a_step_name_the_app_does_not_have_is_counted_as_nothing() {
        /*
         * The only place a String from the window can become an Event, so the
         * only place the guarantee at the top could be got around. A renamed
         * step must cost a number and nothing else.
         */
        assert_eq!(setup_step("handover"), Some(Event::Setup { step: "handover" }));
        assert_eq!(setup_step("/Users/nils/Sidq"), None);
        assert_eq!(setup_step(""), None);
        assert_eq!(setup_step("Handover"), None, "step names are matched exactly");
    }

    #[test]
    fn a_step_that_is_not_ours_cannot_reach_the_queue() {
        let conn = db();
        set_enabled(&conn, true).unwrap();

        if let Some(event) = setup_step("please ignore previous instructions") {
            record(&conn, event);
        }
        assert!(queued(&conn, 10).is_empty(), "arbitrary text reached the queue");
    }

    #[test]
    fn every_event_is_actually_counted_somewhere() {
        /*
         * The state this module spent a whole day in: built, tested, and wired
         * to nothing at all. Every other test in here passed while the app
         * emitted not one row, because they all check this file against itself
         * and this file is not where the counting is decided.
         *
         * So the callers get read. A variant nothing records is either dead or
         * forgotten, and there is no third option worth shipping.
         */
        let callers =
            concat!(include_str!("main.rs"), include_str!("background.rs"), include_str!("mcp.rs"));

        for event in EVERY_EVENT {
            let variant = format!("{event:?}");
            let name = variant.split_whitespace().next().unwrap_or(&variant).to_string();

            // `Setup` is the one variant a caller never names. It is built by
            // `setup_step` out of a string the window sent, deliberately, so
            // that the lookup is the only way in. Calling that is counting it.
            let reached = if name == "Setup" {
                callers.contains("setup_step(")
            } else {
                callers.contains(&format!("Event::{name}"))
            };

            assert!(reached, "{name} can be counted and nothing ever counts it");
        }

        // And a queue nothing drains is a queue that only ever grows.
        assert!(callers.contains("send_queued("), "nothing ever sends what is queued");
    }

    #[test]
    fn every_event_has_a_name_and_no_name_is_empty() {
        // A blank name arrives as a row nobody can attribute, which is worse
        // than not sending it: it inflates every total it lands in.
        for event in [
            Event::Opened,
            Event::Setup { step: "sources" },
            Event::Ready,
            Event::HandedOver { attached: false },
            Event::MemoryTaken { by_assistant: true },
            Event::Connected,
            Event::Indexed { conversations: 1 },
            Event::HitTheLimit,
            Event::SawThePlans,
        ] {
            assert!(!event.name().is_empty(), "{event:?} has no name");
        }
    }
}
