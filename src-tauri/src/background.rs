//! The sweep on a timer, and the only part of indexing that knows about the UI.
//!
//! `indexer::sweep` is a pure function of the disk and the database and lives in
//! the library, where `sidq-mcp` and anything else can call it. What is here is
//! the loop around it: the ninety-second clock, the screen reads, and the two
//! `announce` calls that tell the windows something changed.
//!
//! Split out when the library appeared. It is the whole reason `indexer` could
//! move: an `AppHandle` in the middle of a file otherwise makes every function
//! in that file unreachable from a binary that has no app.

use sidq::{ambient, embed, index_store, indexer, memory, paste, relay, semantic, telemetry, thread, wall};

// The browser reader is the macOS Accessibility API and exists nowhere else.
// Imported under the same gate as the thread that uses it, so that the absence
// is a compile-time fact rather than a runtime branch.
#[cfg(target_os = "macos")]
use sidq::screen_reader;
use std::time::Duration;

/// How often to look. Conversations do not change on a scale that needs faster.
const SWEEP_INTERVAL: Duration = Duration::from_secs(90);

/// Embedding time per sweep. The first launch has every existing conversation to
/// read, about a minute of work on this machine's index, so it is spread over a
/// quarter of an hour instead of spent at once on somebody's battery.
const EMBED_BUDGET: Duration = Duration::from_secs(5);

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

        // Once per run. This thread is the first thing holding a connection,
        // and it reaches here exactly once, which is what "opened" means.
        telemetry::record(&conn, telemetry::Event::Opened);

        loop {
            if indexer::sweep(&conn) > 0 {
                crate::announce(&disk);
                telemetry::record(
                    &conn,
                    telemetry::Event::Indexed {
                        conversations: index_store::counts(&conn).0,
                    },
                );

                /*
                 * ── The moment this whole feature exists for ─────────────────
                 *
                 * Four hours in, the assistant stops. Until now the only way
                 * forward was to remember Sidq exists, at the worst moment of
                 * the day, press a key and pick a row — three chances to not
                 * use the thing that would have saved the afternoon.
                 *
                 * Only after a sweep that wrote something, because the wall
                 * arrives as a new turn in a transcript. A sweep that found
                 * nothing cannot have found this.
                 */
                if let Some(stopped) = wall::newly_hit(&conn) {
                    /*
                     * How long that plan lasted, from the row the sweep already
                     * wrote. Zero when the extractor never recorded a duration,
                     * which the meter drops rather than counts: see `burn`.
                     */
                    let minutes: u32 = conn
                        .query_row(
                            "SELECT active_minutes FROM sessions WHERE session_id = ?1",
                            [&stopped.session_id],
                            |r| r.get::<_, i64>(0),
                        )
                        .map(|m| m.max(0) as u32)
                        .unwrap_or(0);

                    telemetry::record(&conn, telemetry::Event::AssistantStopped { minutes });
                    if relay_to_agent(&conn, &stopped) {
                        crate::announce_relayed(&disk, &stopped);
                    } else {
                        crate::announce_stopped(&disk, &stopped);
                    }
                }
            }

            /*
             * The only place anything is sent, and it rides this clock rather
             * than one of its own so that counting never wakes the machine on
             * its own account. Returns immediately when consent is off or no
             * endpoint was compiled in, so the common case costs a branch.
             */
            telemetry::send_queued(&conn);

            /*
             * Meaning, a few seconds at a time. Only turns that are new or have
             * changed are embedded, so once the backlog is done a sweep costs
             * nothing here unless somebody said something. No model file means
             * search stays keyword-only, which is what it was before this.
             */
            if let Some(model) = embed::shared() {
                semantic::catch_up(&conn, model, EMBED_BUDGET);
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

        // Outside the loop, because what makes the brief happen once per chat
        // is remembering the page it was last asked about.
        let mut arrivals = ambient::Arrivals::default();

        loop {
            // Only when something was actually written. A sweep that finds an
            // unchanged conversation must not make the window refetch.
            let seen = screen_reader::sweep_into(&conn);
            if !seen.found.is_empty() {
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
            for one in seen.found.iter().filter(|f| f.first_time) {
                crate::announce_found(&app, one);
            }

            offer_the_brief(&conn, &app, &seen.blank, &mut arrivals);

            std::thread::sleep(SCREEN_INTERVAL);
        }
    });
}

/**
 * Put what somebody was doing in front of the blank chat they just opened.
 *
 * ── Why this rides the reader's clock instead of its own ────────────────────
 * Watching for a new chat wants an event, and the honest options for one are a
 * thread that asks constantly or an accessibility observer with a lifetime to
 * manage. Neither is needed: this loop is already walking every open assistant
 * page every few seconds and already knows the address of each. The trigger is
 * a use of work that was happening anyway, so it adds no thread and no wake-up.
 *
 * The cost is latency. Up to `SCREEN_INTERVAL` passes between opening a chat
 * and this noticing, which is long enough to start typing, and typing over
 * somebody's half written sentence is the worst thing this feature could do.
 * That is what `empty_composer_page` is in front of, and why being late here
 * degrades to doing nothing rather than to doing harm.
 */
#[cfg(target_os = "macos")]
fn offer_the_brief(
    conn: &rusqlite::Connection,
    app: &tauri::AppHandle,
    blank: &[screen_reader::Blank],
    arrivals: &mut ambient::Arrivals,
) {
    if !ambient::brief_wanted(conn) {
        return;
    }

    for page in blank {
        // Edge, not level: without this, sitting in a new chat would be briefed
        // every few seconds for as long as somebody sat there.
        if arrivals.at(Some(page.source), &page.url).is_none() {
            continue;
        }

        /*
         * One read decides whether to type at all: the right window in front,
         * focus in a message box, the box empty, and the box belonging to this
         * page rather than another one. Asked separately those are four races.
         */
        if screen_reader::empty_composer_page().as_deref() != Some(page.url.as_str()) {
            continue;
        }

        let Some(path) = ambient::most_recent_project(&index_store::projects(conn, 200))
        else {
            continue;
        };
        let Some(brief) = memory::build(conn, &path).map(|m| m.as_markdown()) else {
            continue;
        };

        /*
         * `false`, and this is the line that matters most in the file.
         *
         * It never sends. The person sends. Sidq putting words into somebody's
         * account under their name is a failure with no upside anywhere in it,
         * and all of the value is already there once the text is in the box.
         */
        if paste::into_focused(&brief, false).is_ok() {
            crate::announce_brief(app, page.source);
        }
    }
}

/**
 * Relay, when the person turned it on: the stopped conversation, compiled as a
 * handover, given to Codex in the same folder. False means nothing was
 * started (off, no Codex, no folder) and the usual announcement should run.
 *
 * The thread is started here too, so the Codex session the indexer finds next
 * is claimed into it and the two read as one conversation.
 */
#[cfg(target_os = "macos")]
fn relay_to_agent(conn: &rusqlite::Connection, stopped: &wall::Stopped) -> bool {
    if !relay::enabled(conn) {
        return false;
    }
    let project = std::path::Path::new(&stopped.project);
    let name = project
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let Some(text) = crate::build_handover(&stopped.session_id, &stopped.source, "", "today", &name)
    else {
        return false;
    };
    let Some(dir) = relay::folder() else {
        return false;
    };
    let agent = relay::agent();
    let started = relay::start(
        &dir,
        project,
        &stopped.title,
        &text,
        agent.as_deref(),
        relay::in_terminal,
    )
    .is_some();
    if started {
        let _ = thread::start(conn, &stopped.session_id, &stopped.title, &stopped.project)
            .and_then(|id| thread::expect_continuation(conn, &id));
    }
    started
}

#[cfg(not(target_os = "macos"))]
fn relay_to_agent(_: &rusqlite::Connection, _: &wall::Stopped) -> bool {
    false
}
