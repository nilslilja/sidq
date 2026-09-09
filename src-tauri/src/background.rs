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

use sidq::{index_store, indexer, screen_reader};
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
            if indexer::sweep(&conn) > 0 {
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
            let found = screen_reader::sweep_into(&conn);
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