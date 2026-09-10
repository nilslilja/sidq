// Sidq desktop companion: the application shell.
//
// The header here used to describe a day planner — "shows the current task,
// notices when the window in front of you stopped matching it, and tells you
// when to stop". That product was removed a long time ago and the comment
// outlived it, which is the exact failure the rest of this codebase writes
// comments to avoid.
//
// What this file is now: the Tauri commands, the tray, the windows, and the
// glue between them. Everything about conversations — reading them, indexing
// them, compiling a handover, building a memory — lives in the library beside
// it, so that `sidq-mcp` can use all of it without linking an application.
//
// Design rule throughout: the failure mode for an always-on overlay is not
// missing something, it is being annoying enough to get quit. Everything here
// errs toward silence and toward staying out of the way.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// The four modules that genuinely need an app: a window, an AppHandle, or the
// event bus. Everything else is in the library.
mod assistants;
mod background;
mod browser_bridge;
mod pill_window;

// The library, imported by name so the call sites below did not have to change.
use sidq::{
    capture, codex_history, compiler, cursor_history, entitlement, imports, index_store,
    invites, login_item, mcp_setup, memory, profile, sharing, telemetry, team_context,
    work_history,
};

/*
 * The three that only exist on macOS, imported under the same gate.
 *
 * `screen_reader` is the Accessibility API, `quick_grab` reads the frontmost
 * window through it, and `double_tap` needs NSEvent to see a modifier press
 * with no key attached. Each says why at the top of its own file. Absent rather
 * than stubbed, so the call sites had to be gated too and none of them is
 * quietly doing nothing.
 */
#[cfg(target_os = "macos")]
use sidq::{double_tap, quick_grab, screen_reader};


use tauri_plugin_notification::NotificationExt;
use tauri::{AppHandle, Emitter, Manager};
// GlobalShortcutExt is what puts .global_shortcut() on App. Without the trait in
// scope the method simply does not exist, which is what the compiler was saying.
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutEvent, ShortcutState};
// OpenerExt puts .opener() on AppHandle. This is the supported way to hand a URL
// to the system browser; shell().open() still works but is deprecated.
use tauri_plugin_opener::OpenerExt;


/// Is Accessibility granted, without spawning anything.
///
/// Onboarding polls this roughly once a second while the person is in System
/// Settings. Answering it via `current_activity` meant two osascript spawns per
/// poll, one of which blocks on the permission being waited for, which froze the
/// window for the whole of setup.
/*
 * Where you actually stopped.
 *
 * Opt-in and read-only. The heavy lifting is in work_history.rs, which reads
 * only a title, a last prompt, a project path and a branch out of transcripts
 * that contain entire working conversations. Nothing else is extracted and
 * nothing is uploaded.
 *
 * Runs on a blocking task: this touches the filesystem and can scan tens of
 * megabytes, which must never happen on the UI thread.
 */
#[tauri::command]
async fn recent_work(limit: usize) -> Vec<work_history::WorkSession> {
    tauri::async_runtime::spawn_blocking(move || {
        let capped = limit.min(50);

        /*
         * Every readable source, merged and re-sorted.
         *
         * Each reader is asked for the full limit rather than a share of it: a
         * day spent entirely in one tool should fill the list with that tool
         * rather than reserving half the rows for an editor that was not opened.
         */
        let mut all = work_history::recent_sessions(capped);
        all.extend(cursor_history::recent_sessions(capped));
        all.extend(codex_history::recent_sessions(capped));

        /*
         * ── And the ones that exist only in the index ────────────────────────
         *
         * Everything read out of a browser window. This was missing, and it is
         * the reason the whole feature looked broken from the outside: the
         * reader worked, the sweep wrote ChatGPT and Gemini into the index,
         * search found them — and the picker, which is where people actually
         * go, listed only the sources that write files to disk. So you opened
         * an AI, Sidq read it perfectly, and there was nothing to see.
         *
         * Handing one over already worked: `handover_text` falls through to the
         * index when there is no per-block file. Only the listing was absent.
         */
        all.extend(index_store::open().into_iter().flat_map(|conn| {
            index_store::recent_screen_sessions(&conn, capped)
                .into_iter()
                .map(|(session_id, title, source, ended_at, turns)| work_history::WorkSession {
                    session_id,
                    project: String::new(),
                    // The AI's name stands in for the project. A browser
                    // conversation has no folder, and a blank here renders as a
                    // row with a dangling separator after the title.
                    project_name: assistants::label_for(&source).to_string(),
                    title,
                    last_prompt: String::new(),
                    branch: String::new(),
                    ended_at,
                    turns,
                    active_minutes: 0,
                    source: assistants::static_source(&source),
                })
                .collect::<Vec<_>>()
        }));

        all.sort_by(|a, b| b.ended_at.cmp(&a.ended_at));
        all.truncate(capped);
        all
    })
    .await
    .unwrap_or_default()
}

/**
 * The full conversation for one session, to hand to another assistant.
 *
 * Unlike `recent_work` this returns the transcript verbatim, so it runs only
 * when someone has picked that session themselves. It still never leaves the
 * machine: the string goes back to the webview and from there to the clipboard.
 *
 * Blocking task for the same reason as above, and more so, since this reads and
 * parses an entire transcript rather than skimming one.
 */
/**
 * Close the picker.
 *
 * Called by the pill itself once it has copied, and on Escape. It hides rather
 * than closes so the next summon is instant: recreating the webview each time
 * puts a visible beat between the keypress and the list.
 */
/**
 * Bring the picker up.
 *
 * Everything about where it goes and how big it is now lives in `pill_window`,
 * because the window has two sizes and one of them is permanent. This is the
 * name the rest of the file already calls, kept so that "show the picker" reads
 * the same at every call site.
 */
fn show_pill(w: &tauri::WebviewWindow) -> tauri::Result<()> {
    pill_window::expand(w)
}

/**
 * Write a conversation to a file and return its path.
 *
 * The alternative to pasting, and the only genuine saving available. Pasting
 * puts the whole conversation into the context window of every single turn that
 * follows. Attaching a file sends it to the retrieval layer in Claude Projects
 * and ChatGPT instead, so it is read when relevant rather than re-read forever.
 *
 * Trimming the text saves about 6%; this is the one that changes the number
 * meaningfully, and it does it without deleting a word.
 *
 * Goes to Downloads because that is where a person expects to find a file they
 * just made, and because the file picker in every assistant opens there.
 */
/// What came of asking for a handover: a file, or the reason there isn't one.
#[derive(Debug, Clone, serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct HandoverResult {
    /// Where the file landed. Absent when nothing was written.
    path: Option<String>,
    /// True when the weekly limit refused it, as opposed to a read failing.
    limited: bool,
    /// Handovers made in the last rolling week, counting this one if it happened.
    used: u32,
    /// The cap, or absent on a paid plan.
    cap: Option<u32>,
    /// Words in the handover that was just written. Zero when nothing was.
    ///
    /// The picker shows it at the moment the file lands, which is the only
    /// moment this window has to prove it did something worth doing.
    words: usize,
}

/**
 * Tell every window that something it is showing has changed.
 *
 * ── Why this exists at all ───────────────────────────────────────────────────
 * The window asked for the plan twice: on mount, and after a sign-in. Nothing
 * ever told it a handover had happened, so the allowance it printed was the one
 * from the moment it opened and stayed there until the app was quit. Reported
 * as "the handovers didn't change when I used them, still said 5 over and
 * over", and it was not a counting bug — `record_handover` was writing every
 * time. The window simply never looked again.
 *
 * The same silence is why reading a browser conversation appeared to do
 * nothing: the sweep wrote it, and no screen was told.
 *
 * ── The two rules this codebase paid for ─────────────────────────────────────
 * `emit_to(label, …)` builds an `EventTarget::AnyLabel` that no JS `listen()`
 * receives — an afternoon went into finding that once, and the comment is at
 * the top of `pill_window.rs`. It has to be the global `emit`.
 *
 * And it must not sit at the end of a chain of `?`, because one earlier failure
 * then skips the announcement with nothing reported anywhere. Hence a free
 * function called on its own line rather than a link in a chain.
 */
/**
 * Is this copy running out of a mounted disk image rather than installed?
 *
 * Anything under /Volumes is temporary by definition. It matters for the login
 * item, which stores an absolute path: registered from the image, it points at
 * a mount that will not be there, and the only visible result is macOS telling
 * somebody that an app they cannot see runs in the background.
 */
fn running_from_a_mounted_image() -> bool {
    std::env::current_exe()
        .map(|p| p.starts_with("/Volumes/"))
        .unwrap_or(false)
}

/**
 * Refuse to run from the disk image.
 *
 * ── Why this is worth an early exit ──────────────────────────────────────────
 *
 * Opening Sidq straight out of the mounted DMG produces an app that looks
 * completely fine and is quietly broken in the one way that is hardest to
 * report. macOS grants Accessibility to a path, and the copy in Applications is
 * a different path from the copy on the disk image. So the pill still works —
 * clicking it needs no permission — while everything that needs a global event
 * monitor silently receives nothing: the grab gesture does nothing at all, and
 * browser capture is intermittent depending on which copy was granted.
 *
 * It happened five separate times to the person this was written for, across
 * five releases, each time diagnosed from scratch as a different bug. Telling
 * somebody to eject the image does not work, because nothing about the running
 * app suggests they are the one making the mistake.
 *
 * So: if the installed copy exists, hand over to it and quit. If it does not,
 * say what to do and quit. Either way this process does not continue, because
 * a half-working Sidq is worse than one that is honestly not running.
 */
fn hand_over_to_the_installed_copy() -> bool {
    if !running_from_a_mounted_image() {
        return false;
    }

    let installed = std::path::Path::new("/Applications/Sidq.app");

    if installed.is_dir() {
        // `open` returns as soon as the other copy is launching, and this
        // process exits behind it. Two Sidqs briefly overlap, which the pill
        // tolerates: the second one takes the window and the shortcut.
        let _ = std::process::Command::new("/usr/bin/open").arg(installed).spawn();
        let _ = std::process::Command::new("/usr/bin/osascript")
            .arg("-e")
            .arg(
                "display notification \"Opening the installed copy instead. The one on the disk image cannot use your shortcuts.\" with title \"Sidq\"",
            )
            .status();
    } else {
        let _ = std::process::Command::new("/usr/bin/osascript")
            .arg("-e")
            .arg(
                "display dialog \"Drag Sidq into your Applications folder and open it from there.\n\nRun from the disk image it cannot use the keyboard shortcuts, because macOS grants permission to a location and this is not the one you granted.\" with title \"Move Sidq to Applications\" buttons {\"OK\"} default button 1 with icon caution",
            )
            .status();
    }

    true
}

fn announce(app: &AppHandle) {
    let _ = app.emit("sidq:changed", ());
}

/**
 * A conversation just arrived. Ring, and raise a notification.
 *
 * ── Two channels because they answer different questions ─────────────────────
 * The event reaches whichever Sidq window is open and is what plays the tone:
 * a quiet confirmation for somebody who is already looking, in the same voice
 * as the rest of the app's sounds.
 *
 * The notification is for the case that actually matters. Reading a browser
 * assistant requires that browser to be in front, which means at the moment
 * Sidq finds a conversation the person is by definition looking at something
 * else. A tone from a window they cannot see is not an answer to "did that
 * work"; a notification is.
 *
 * ── Why the failure is silent ────────────────────────────────────────────────
 * Notifications are a courtesy on top of work that has already been done and
 * recorded. Somebody who denied the permission, or is in a Focus mode, has said
 * what they want. Nothing here is worth an error.
 */
/*
 * ── The two gestures, named on every platform ────────────────────────────────
 *
 * macOS reads a modifier double-tap through NSEvent. Nowhere else can: seeing a
 * modifier press with no key attached needs a low-level keyboard hook, and a
 * background process installing one of those is a keylogger to every security
 * product on the machine. So the other platforms get an ordinary chord through
 * Tauri's global-shortcut plugin, and these two functions are where the
 * difference is absorbed rather than spread through the tray code.
 */
#[cfg(target_os = "macos")]
fn chosen_taps() -> (u64, u64) {
    index_store::open()
        .map(|conn| double_tap::chosen(&conn))
        .unwrap_or((double_tap::RIGHT_COMMAND, double_tap::LEFT_CONTROL))
}

#[cfg(not(target_os = "macos"))]
fn chosen_taps() -> (u64, u64) {
    (0, 0)
}

#[cfg(target_os = "macos")]
fn tap_label(mask: u64) -> String {
    double_tap::label_for(mask).to_string()
}

/**
 * Nothing to name yet, and saying so beats inventing one.
 *
 * This returned "Ctrl+Shift+K" for a while, which is a chord that exists and
 * does something else entirely — it opens the picker. A label naming a key that
 * does not perform the action next to it is worse than an empty one: somebody
 * presses it, something unrelated happens, and the feature looks broken rather
 * than absent.
 */
#[cfg(not(target_os = "macos"))]
fn tap_label(_mask: u64) -> String {
    String::new()
}

/// One whole menu label, so the platform difference is decided in one place.
#[cfg(target_os = "macos")]
fn gesture_hint(action: &str, mask: u64) -> String {
    format!("{action}   ·   double-tap {}", tap_label(mask))
}

#[cfg(not(target_os = "macos"))]
fn gesture_hint(action: &str, _mask: u64) -> String {
    format!("{action}   ·   macOS only for now")
}

#[cfg(target_os = "macos")]
fn announce_found(app: &AppHandle, found: &screen_reader::Found) {
    let _ = app.emit("sidq:found", found);

    let label = match found.source {
        "chatgpt" => "ChatGPT",
        "claude.ai" => "Claude",
        "gemini" => "Gemini",
        "grok" => "Grok",
        "deepseek" => "DeepSeek",
        other => other,
    };

    /*
     * The title says what happened, the body says which one.
     *
     * "Read from ChatGPT" said neither clearly: read is what Sidq does
     * constantly and says nothing about, and a notification is only worth
     * raising for the moment a conversation is actually kept. Naming the
     * assistant in the headline and the conversation underneath means the
     * whole thing is legible from a banner nobody clicks.
     */
    notify(app, &format!("New chat from {label} saved"), &found.title);
}

#[tauri::command]
async fn save_transcript(
    app: AppHandle,
    session_id: String,
    title: String,
    source: String,
    resume_point: String,
    when: String,
    project: String,
) -> HandoverResult {
    tauri::async_runtime::spawn_blocking(move || {
        /*
         * The limit is checked here, before a single byte is read.
         *
         * It used to be checked in the page, which meant it was checked nowhere:
         * the number lived in a React module and refusing was something the UI
         * chose to do. Anything the client decides on its own behalf is a
         * request, not a limit.
         */
        let conn = index_store::open();
        let plan = conn.as_ref().map(entitlement::current).unwrap_or(entitlement::Plan::Free);

        if let Some(conn) = conn.as_ref() {
            if !entitlement::may_hand_over(conn, plan) {
                let (used, cap) = entitlement::handover_allowance(conn, plan);
                telemetry::record(conn, telemetry::Event::HitTheLimit);
                return HandoverResult { path: None, limited: true, used, cap, words: 0 };
            }
        }

        let written = write_handover(session_id.clone(), title, source, resume_point, when, project);

        if let (Some(conn), Some(_)) = (conn.as_ref(), written.as_ref()) {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            let _ = index_store::record_handover(conn, &session_id, stamp);
            telemetry::record(conn, telemetry::Event::HandedOver { attached: true });

            // The window is open and showing a number that has just changed.
            announce(&app);
        }

        let (used, cap) = conn
            .as_ref()
            .map(|c| entitlement::handover_allowance(c, plan))
            .unwrap_or((0, plan.handovers_per_week()));

        let (path, words) = match written {
            Some((path, words)) => (Some(path), words),
            None => (None, 0),
        };

        HandoverResult { path, limited: false, used, cap, words }
    })
    .await
    .unwrap_or_default()
}

/**
 * Build the handover text. The same bytes whichever way it is delivered.
 *
 * ⌘↵ used to copy the raw transcript with no framing at all — no explanation of
 * what it was, who it was from, or what to do with it. Pasted into a fresh
 * assistant that is exactly a wall of dialogue arriving out of nowhere, and it
 * behaves accordingly. Only the file path was ever compiled.
 */
fn build_handover(
    session_id: &str,
    source: &str,
    resume_point: &str,
    when: &str,
    project: &str,
) -> Option<String> {
    build_handover_for(
        session_id,
        source,
        resume_point,
        when,
        project,
        compiler::Target::for_source(source),
    )
}

/**
 * The same handover, compiled for an assistant the caller names.
 *
 * `Target::for_source` guesses from where the conversation came, and its own
 * comment says a wrong guess "costs formatting, not content". That holds while
 * you are handing a conversation to yourself. It stops holding the moment
 * somebody else is receiving it: a Claude Code conversation shared to a
 * colleague who lives in ChatGPT arrives as XML tags, and they cannot re-target
 * a file that was already rendered.
 */
#[allow(clippy::too_many_arguments)]
fn build_handover_for(
    session_id: &str,
    source: &str,
    resume_point: &str,
    when: &str,
    project: &str,
    target: compiler::Target,
) -> Option<String> {
    let rules: Vec<String> = index_store::open()
        .map(|conn| {
            /*
             * Grouped by project, not by conversation.
             *
             * A sentence repeated across ten conversations about one piece of
             * work is a task for that work. The same sentence turning up in a
             * second, unrelated project is how the person likes to be worked
             * with — and only the second belongs in a file that may be handed
             * to an assistant discussing something else entirely.
             */
            let turns = index_store::own_turns_by_project(&conn, profile::TURN_BUDGET);
            /*
             * Only rules said in more than one conversation.
             *
             * The panel shows single mentions too, because seeing them is how
             * you judge whether the list is right. A handover cannot afford
             * them: they sit at the top of a prompt the receiving model reads
             * before anything else, and a real one arrived carrying "make sure
             * it fully works" and "make sure it works it doesnt load" — noise
             * given the authority of a standing instruction.
             */
            profile::build(&turns, PROFILE_IN_HANDOVER * 3)
                .into_iter()
                .filter(|f| f.conversations >= 2)
                .take(PROFILE_IN_HANDOVER)
                .map(|f| f.text)
                .collect()
        })
        .unwrap_or_default();

    /*
     * ── And how the rest of the team works ───────────────────────────────────
     *
     * Empty for anybody who has not pointed Sidq at a shared folder, which is
     * everybody on Starter and Pro. Reading a folder that is not there costs
     * one failed `read_dir`, so there is nothing to guard.
     *
     * Published on the way past, too. The alternative is a Sync button, and a
     * shared context that is only as fresh as the last time somebody remembered
     * to press one is not shared context.
     */
    let team = team_rules(&rules);

    let brief = compiler::Brief {
        source,
        when,
        project,
        resume_point,
        profile: &rules,
        team: &team,
    };

    match work_history::session_capture(session_id) {
        Some(turns) => Some(compiler::compile(&turns, &brief, target)),
        None => {
            /*
             * ── Browser conversations kept their turns ───────────────────────
             *
             * This used to flatten the whole conversation into one string and
             * hand it over as a single turn attributed to the person, with the
             * speaker labels left inside it as text. Everything downstream then
             * read wrong: the summary quoted "You:\nthen it sucks" as the
             * opening line, the count said one exchange for six, and every
             * reply was filed as something they had said.
             *
             * Measured on a real handover made from a live ChatGPT
             * conversation. It is the path most people will use, and it was
             * materially worse than the one for editors.
             */
            let conn = index_store::open()?;
            let stored = index_store::session_turns(&conn, session_id);

            let turns: Vec<capture::Turn> = if stored.is_empty() {
                // Cursor and anything else with neither a per-block file nor
                // rows in the index. One turn is still better than nothing.
                vec![capture::Turn {
                    role: capture::Role::You,
                    blocks: vec![capture::Block::Said(transcript_of(session_id)?)],
                }]
            } else {
                stored
                    .into_iter()
                    .map(|(who, body)| capture::Turn {
                        role: if who == "You" { capture::Role::You } else { capture::Role::Assistant },
                        blocks: vec![capture::Block::Said(body)],
                    })
                    .collect()
            };

            Some(compiler::compile(&turns, &brief, target))
        }
    }
}

/// The compiled handover, for the clipboard.
#[tauri::command]
async fn handover_text(
    session_id: String,
    source: String,
    resume_point: String,
    when: String,
    project: String,
) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        // The clipboard half of the same act. Counted here rather than in the
        // window, so that both ways out of the picker are counted in one place
        // and neither depends on the page remembering to say so.
        let text = build_handover(&session_id, &source, &resume_point, &when, &project);
        if text.is_some() {
            telemetry::count(telemetry::Event::HandedOver { attached: false });
        }
        text
    })
    .await
    .ok()
    .flatten()
}

/// Build the file and put it in Downloads. The part that touches no limits.
fn write_handover(
    session_id: String,
    title: String,
    source: String,
    resume_point: String,
    when: String,
    project: String,
) -> Option<(String, usize)> {
    (|| {
        let text = build_handover(&session_id, &source, &resume_point, &when, &project)?;

        /*
         * Counted before the write, because after it the only thing left is a
         * path and answering "how much was that" would mean reading the file
         * back off disk to say something we already knew.
         *
         * Words rather than bytes or characters. A person has no feel for
         * 640 kB and a very good one for forty thousand words, which is the
         * number that makes the point: that is what you did not retype.
         */
        let words = text.split_whitespace().count();

        let home = sidq::net::home()?;
        let dir = std::path::PathBuf::from(home).join("Downloads");

        // The title becomes a filename, so anything that is not plainly safe in
        // one is replaced rather than escaped.
        let stem: String = title
            .chars()
            .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' { c } else { '-' })
            .collect();
        let stem = stem.trim().replace(' ', "-");
        let stem = if stem.is_empty() { "sidq-conversation".to_string() } else { stem };

        let path = dir.join(format!("{}.md", &stem[..stem.len().min(60)]));
        std::fs::write(&path, text).ok()?;
        Some((path.to_string_lossy().to_string(), words))
    })()
}

/**
 * Search every indexed conversation.
 *
 * The history window comes from the plan and is worked out here. It used to
 * arrive as an argument from the page, which made the limit advisory: pass zero
 * and every conversation ever indexed came back. Now the caller cannot say how
 * far to reach, only what to look for.
 *
 * The second return value is how many older matches exist — a real count, with
 * none of their text — which is what the upgrade prompt shows.
 */
#[tauri::command]
async fn search_conversations(
    query: String,
    limit: usize,
) -> (Vec<index_store::SearchHit>, usize) {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(conn) = index_store::open() else {
            return (Vec::new(), 0);
        };
        let floor = entitlement::history_floor(entitlement::current(&conn));
        index_store::search(&conn, &query, floor, limit.min(100))
    })
    .await
    .unwrap_or((Vec::new(), 0))
}


/**
 * Sites whose selectors have stopped matching, reported by the extension.
 *
 * Shown in the Sources panel, because a source stuck at zero because a site
 * redesigned looks exactly like one the person has never used, and only one of
 * those is something we can fix.
 */
#[tauri::command]
async fn stale_sources() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(|| {
        let Some(conn) = index_store::open() else {
            return Vec::new();
        };
        // Anything reported in the last three days. Older than that and either
        // it was fixed or the person stopped using the site.
        let cutoff = (std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
            / 86_400)
            .saturating_sub(3);

        assistants::ASSISTANTS
            .iter()
            .filter(|a| {
                // Keyed on the label, because that is what the extension
                // reports. Keying on the id silently never matched Claude,
                // whose id is "claude.ai" and whose label is "Claude".
                index_store::setting(&conn, &format!("stale:{}", a.label.to_lowercase()))
                    .and_then(|v| v.parse::<u64>().ok())
                    .is_some_and(|day| day >= cutoff)
            })
            .map(|a| a.label.to_string())
            .collect()
    })
    .await
    .unwrap_or_default()
}

/**
 * Download the extension, and reveal it in Finder.
 *
 * One button rather than a link into a browser, a Downloads folder and a hunt.
 * The unzipped folder is what Chrome's "Load unpacked" wants, so Sidq unzips it
 * too: asking somebody to find a zip, double-click it, and then locate what
 * came out is three chances to lose them for no benefit.
 */
#[tauri::command]
async fn download_extension(app: tauri::AppHandle) -> Result<String, String> {
    let origin = web_origin().ok_or("No web address is configured for this build.")?;
    let home = sidq::net::home().ok_or("No home directory.")?;
    let dir = std::path::PathBuf::from(home).join("Downloads");
    let zip = dir.join("sidq-extension.zip");
    let out = dir.join("sidq-extension");

    let status = std::process::Command::new(sidq::net::CURL)
        .args(["--silent", "--fail", "--location", "--max-time", "30", "--output"])
        .arg(&zip)
        .arg(format!("{origin}/sidq-extension.zip"))
        .status()
        .map_err(|e| format!("Could not download it: {e}"))?;
    if !status.success() {
        return Err("Could not download the extension. Check your connection.".into());
    }

    // Replace rather than merge: an older copy left behind would be loaded
    // alongside and the person would never know which one Chrome was running.
    let _ = std::fs::remove_dir_all(&out);
    let unzipped = std::process::Command::new("/usr/bin/unzip")
        .args(["-o", "-q"])
        .arg(&zip)
        .arg("-d")
        .arg(&out)
        .status()
        .map_err(|e| format!("Could not unzip it: {e}"))?;
    if !unzipped.success() {
        return Err("Downloaded it, but could not unzip it.".into());
    }

    let _ = std::fs::remove_file(&zip);
    // Straight to the folder they need to pick, open in Finder.
    let _ = app.opener().reveal_item_in_dir(&out);

    Ok(out.to_string_lossy().to_string())
}

/// Whether Sidq may read assistant windows, and the two ways to change that.
#[tauri::command]
fn accessibility_granted() -> bool {
    #[cfg(target_os = "macos")]
    {
        screen_reader::is_trusted()
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

#[tauri::command]
fn request_accessibility() {
    #[cfg(target_os = "macos")]
    screen_reader::request_trust();
}

#[tauri::command]
fn open_accessibility_settings() {
    #[cfg(target_os = "macos")]
    screen_reader::open_settings();
}

/**
 * Send one notification, so macOS asks the question.
 *
 * ── Why there is no "is it allowed?" command next to this ────────────────────
 * There is nothing honest to put behind one. `tauri-plugin-notification`'s
 * `permission_state()` and `request_permission()` are stubs on desktop that
 * both return Granted unconditionally, so a screen built on them would report
 * that notifications work to somebody who has them switched off.
 *
 * macOS only asks on the first notification an app actually posts, which makes
 * sending a real one the only way to raise the prompt — and it doubles as the
 * only truthful check available, because the person sees the result themselves.
 * Same shape as the Accessibility step: the button does the thing, in the
 * moment, rather than describing where a switch lives.
 */
/*
 * Post a notification, and actually post it.
 *
 * Every call site used to be `let _ = app.notification()…show()`, which threw
 * away the one piece of information worth having. The plugin's `show()` fails
 * quietly on macOS in more cases than it succeeds loudly in — a build installed
 * over another, a bundle whose authorisation the notification centre has not
 * caught up with, a first post before the user has ever been asked — and a
 * swallowed error there is indistinguishable from a machine that is simply
 * quiet. That is why notifications "worked on every other build": nothing was
 * broken intermittently, the failures were just invisible.
 *
 * So: try the plugin, and if it refuses, ask the system directly. The osascript
 * route is the one already used for the disk-image warning, and that one has
 * never failed to appear.
 *
 * Returns whether anything was actually posted, so a caller that is a test
 * button can say so rather than lying.
 */
fn notify(app: &AppHandle, title: &str, body: &str) -> bool {
    if app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .is_ok()
    {
        return true;
    }

    #[cfg(target_os = "macos")]
    {
        // Quotes are the only thing that can break the one-liner, and a
        // conversation title is user data that may well contain them.
        let esc = |t: &str| t.replace('\\', "\\\\").replace('"', "\\\"");
        let script = format!(
            "display notification \"{}\" with title \"{}\"",
            esc(body),
            esc(title)
        );
        return std::process::Command::new("/usr/bin/osascript")
            .arg("-e")
            .arg(script)
            .status()
            .map(|st| st.success())
            .unwrap_or(false);
    }

    #[allow(unreachable_code)]
    false
}

#[tauri::command]
fn notify_sample(app: AppHandle) -> bool {
    notify(
        &app,
        "Sidq is set up",
        "This is what you will see when a conversation is read.",
    )
}

/// The Notifications pane, for anyone who said no and changed their mind.
/*
 * Open the picker from the setup window.
 *
 * The handover step waits for a real handover and, until now, offered no way to
 * begin one: the instruction was a keyboard gesture that needs Accessibility,
 * and if that had not been granted — or the shortcut had lost its registration
 * — the only way off the screen was "Skip for now". Somebody who skips the one
 * step that makes the product do its thing has not seen the product.
 *
 * A button that opens the picker cannot fail the way a global shortcut can, so
 * the step always has a route through it.
 */
#[tauri::command]
fn open_picker(app: AppHandle) {
    if let Some(w) = app.get_webview_window("pill") {
        let _ = show_pill(&w);
        let _ = pill_window::expand(&w);
    }
}

/// The picker shortcut that actually registered, if any.
#[tauri::command]
fn picker_shortcut() -> Option<String> {
    PICKER_KEY.lock().ok().and_then(|k| k.clone())
}

#[tauri::command]
fn open_notification_settings() {
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("/usr/bin/open")
        .arg("x-apple.systempreferences:com.apple.preference.notifications")
        .status();
}

/// Whether the browser extension has ever reached the app, and when.
#[derive(Debug, Clone, serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct ExtensionStatus {
    connected: bool,
    /// Seconds since it last spoke, or absent if it never has.
    seconds_ago: Option<i64>,
}

/**
 * Is the extension working?
 *
 * Asked by the setup screen every few seconds so it can go green by itself.
 * Somebody who has just followed four steps in another application has no way
 * of knowing whether they worked, and that uncertainty is what makes people
 * give up on a install that actually succeeded.
 */
#[tauri::command]
async fn extension_status() -> ExtensionStatus {
    tauri::async_runtime::spawn_blocking(|| {
        let Some(conn) = index_store::open() else {
            return ExtensionStatus::default();
        };
        let seen = index_store::setting(&conn, "extension_seen").and_then(|v| v.parse::<i64>().ok());
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        match seen {
            Some(at) => ExtensionStatus { connected: true, seconds_ago: Some(now - at) },
            None => ExtensionStatus::default(),
        }
    })
    .await
    .unwrap_or_default()
}

/// The list of assistants Sidq can open, for the UI to draw.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AssistantRow {
    id: String,
    label: String,
}

#[tauri::command]
fn assistant_list() -> Vec<AssistantRow> {
    assistants::ASSISTANTS
        .iter()
        .map(|a| AssistantRow { id: a.id.into(), label: a.label.into() })
        .collect()
}

/**
 * Open an assistant in the browser this Mac already uses.
 *
 * The default route, because it is the only one where signing in actually
 * works. Sidq's own webview renders these sites perfectly and cannot do the one
 * thing every account now depends on: passkeys need WebAuthn, WebAuthn in a
 * webview needs an associated-domains entitlement, and that entitlement
 * requires OpenAI to publish Sidq's team identifier in their own
 * apple-app-site-association file. They will not, and no amount of work here
 * changes that. AutoFill and password managers are the same story.
 *
 * So the login stays where your passkeys, your Keychain and your password
 * manager already live, and Sidq never needs a session of its own at all. The
 * extension reads the page from there and hands it to the app over loopback.
 */
#[tauri::command]
fn open_assistant_in_browser(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let assistant = assistants::find(&id).ok_or("Sidq does not know that assistant.")?;
    app.opener()
        .open_url(assistant.url, None::<&str>)
        .map_err(|e| format!("Could not open {}: {e}", assistant.label))
}

/**
 * Open an assistant inside Sidq instead.
 *
 * Kept for accounts that sign in with an email and a password, where the
 * webview is fine and there is nothing to install. Offered as the alternative
 * rather than the default, because anybody on a passkey hits a wall with no
 * way over it.
 */
#[tauri::command]
fn open_assistant(app: tauri::AppHandle, id: String) -> Result<(), String> {
    assistants::open(&app, &id)
}

/// What an assistant page hands back as it is used.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Conversation {
    source: String,
    title: String,
    url: String,
    text: String,
}

/**
 * Index a conversation read out of an assistant running inside Sidq.
 *
 * Keyed on the page's own URL rather than on a new id each time, so a
 * conversation that is still being added to replaces its earlier state instead
 * of accumulating a copy per exchange.
 */
fn absorb(conversation: &Conversation) {
    let Some(conn) = index_store::open() else { return };

    let turns: Vec<(String, String)> = conversation
        .text
        .split("\n\n")
        .filter_map(|block| {
            let (role, body) = block.split_once(":\n")?;
            (!body.trim().is_empty()).then(|| (role.to_string(), body.to_string()))
        })
        .collect();
    if turns.is_empty() {
        return;
    }

    // The conversation's own address is its identity. Stable while you are in
    // it, different for every other one.
    let session_id: String = conversation
        .url
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();
    if session_id.is_empty() {
        return;
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    let title = conversation
        .title
        .split(" - ")
        .next()
        .unwrap_or(&conversation.title)
        .trim()
        .to_string();

    /*
     * Merged rather than written over, for the same reason the accessibility
     * sweep merges: this is a page, and a page holds what it has loaded. An
     * emit arriving while the top of a long conversation is unloaded used to
     * replace the stored copy with the visible tail — this path never had even
     * the length guard the sweep had.
     */
    let Some(kept) = index_store::merge_messages(
        &conn, &session_id, &turns,
        &format!("live:{}", conversation.text.len()),
    ) else {
        return;
    };

    let _ = index_store::put_session(
        &conn, &session_id, &conversation.source, &title,
        &conversation.source, "", "", now, kept as u32, 0,
    );
}

/// Handovers to list. A page of history, not an archive.
const HANDOVER_LIMIT: usize = 50;

/// What you have handed over, newest first.
#[tauri::command]
async fn recent_handovers() -> Vec<index_store::Handover> {
    tauri::async_runtime::spawn_blocking(|| {
        index_store::open()
            .map(|conn| index_store::recent_handovers(&conn, HANDOVER_LIMIT))
            .unwrap_or_default()
    })
    .await
    .unwrap_or_default()
}

/**
 * Where this Mac's shared-context folder is, if one was chosen.
 *
 * Absent for everybody who has not set one up, which is the default and the
 * only state Starter and Pro can be in.
 */
fn team_folder() -> Option<std::path::PathBuf> {
    let conn = index_store::open()?;
    let raw = index_store::setting(&conn, team_context::FOLDER_KEY)?;
    let path = std::path::PathBuf::from(raw);
    path.is_dir().then_some(path)
}

/// The name this person chose for the team folder, if they have chosen one.
fn stored_team_name() -> Option<String> {
    index_store::open()
        .and_then(|conn| index_store::setting(&conn, "team.name"))
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty())
}

/**
 * What teammates see this person called.
 *
 * The fallback exists so nothing can panic on a missing name, and it is
 * deliberately never reached in practice: the window will not let anybody pick
 * a folder until they have typed one. It has to be, because the filename is
 * built from this, and two people both publishing as the fallback into the same
 * folder would overwrite each other.
 */
fn team_name() -> String {
    stored_team_name().unwrap_or_else(|| "Me".to_string())
}

/**
 * Publish this person's rules into the shared folder, and read everyone else's.
 *
 * Both halves in one call because they happen at the same moment for the same
 * reason: a handover is being made, so this is exactly when the folder should
 * be current in both directions.
 *
 * `mine` is what already went into the handover's own standing instructions, so
 * the file a teammate reads is the same set this person's own handovers carry.
 * Publishing something different would mean the team saw a version of you that
 * your own assistants never do.
 */
fn team_rules(mine: &[String]) -> Vec<(String, String)> {
    let Some(folder) = team_folder() else {
        return Vec::new();
    };

    let name = team_name();

    /*
     * Checked here rather than only in the window.
     *
     * This is what Duo is for, so the plan decides, and it decides in Rust like
     * every other limit does. It also covers the case a UI check cannot: an
     * account that had Duo, set a folder up, and then stopped paying. Their
     * file is withdrawn on the way out rather than left in the folder being
     * read by teammates for ever.
     */
    let paid = index_store::open()
        .map(|conn| entitlement::current(&conn).may_share_with_team())
        .unwrap_or(false);
    if !paid {
        team_context::publish(&folder, &name, &[]);
        return Vec::new();
    }
    team_context::publish(&folder, &name, mine);

    team_context::read_others(&folder, &team_context::file_name_for(&name))
        .into_iter()
        .map(|r| (r.who, r.text))
        .collect()
}

/* ── Duo: one shared folder, no server ──────────────────────────────────── */

/// What the Duo panel needs to draw itself.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TeamSettings {
    /// The chosen folder, if it is set and still exists.
    folder: Option<String>,
    /// What teammates see this person called.
    name: String,
    /// Everyone else publishing into the folder, and how many rules each shares.
    members: Vec<(String, usize)>,
    /// How many of this person's own rules are being published.
    sharing: usize,
    /// The file this Mac writes. Shown so it is obvious what leaves.
    file: String,
    /// Whether the plan allows it. Read, not assumed: Rust decides, not the window.
    allowed: bool,
}

/**
 * Folders on this Mac that already sync somewhere.
 *
 * Offered instead of a file picker, and not only to save a dependency: the
 * folder has to be one that syncs, and a raw picker invites somebody to choose
 * Documents and then wonder why their co-founder never appears. These are the
 * places that will actually work, detected rather than explained.
 */
fn sync_roots() -> Vec<(String, std::path::PathBuf)> {
    let Some(home) = sidq::net::home() else {
        return Vec::new();
    };

    let mut out: Vec<(String, std::path::PathBuf)> = Vec::new();
    let mut offer = |label: &str, path: std::path::PathBuf| {
        if path.is_dir() {
            out.push((label.to_string(), path));
        }
    };

    offer("iCloud Drive", home.join("Library/Mobile Documents/com~apple~CloudDocs"));
    offer("Dropbox", home.join("Dropbox"));

    if let Ok(entries) = std::fs::read_dir(home.join("Library/CloudStorage")) {
        for entry in entries.flatten().take(6) {
            let name = entry.file_name().to_string_lossy().to_string();
            let label = name.split('-').next().unwrap_or(&name).to_string();
            offer(&label, entry.path());
        }
    }

    out
}

/**
 * A team somebody has already set up, in a folder this Mac can see.
 *
 * The second person to join used to have to be told which folder, find it, and
 * pick it — the same four steps as the first person, with a way to get it wrong
 * that produces no error at all. Pointing at different folders simply never
 * works, and both windows say everything is fine.
 */
#[tauri::command]
async fn team_nearby() -> Vec<team_context::FoundTeam> {
    tauri::async_runtime::spawn_blocking(|| team_context::discover(&sync_roots()))
        .await
        .unwrap_or_default()
}

/**
 * Show the team folder in Finder.
 *
 * The one step Sidq cannot do for the first person: a folder has to be shared
 * with somebody, and sharing is macOS's own sheet on the folder itself. Opening
 * Finder with it selected puts them one right-click from Share.
 */
#[tauri::command]
async fn reveal_team_folder() -> bool {
    tauri::async_runtime::spawn_blocking(|| {
        let Some(dir) = team_folder() else { return false };
        std::process::Command::new("/usr/bin/open")
            .arg("-R")
            .arg(dir)
            .status()
            .is_ok()
    })
    .await
    .unwrap_or(false)
}

#[tauri::command]
fn team_folder_options() -> Vec<(String, String)> {
    sync_roots()
        .into_iter()
        .map(|(label, path)| {
            (label, path.join("Sidq Team").to_string_lossy().to_string())
        })
        .collect()
}

#[tauri::command]
async fn team_settings() -> TeamSettings {
    tauri::async_runtime::spawn_blocking(|| {
        let name = team_name();
        let folder = team_folder();
        let allowed = index_store::open()
            .map(|conn| entitlement::current(&conn).may_share_with_team())
            .unwrap_or(false);

        let (members, sharing) = match folder.as_ref() {
            Some(dir) => (
                team_context::members(dir, &team_context::file_name_for(&name)),
                dir.join(team_context::file_name_for(&name))
                    .exists()
                    .then(|| std::fs::read_to_string(dir.join(team_context::file_name_for(&name))))
                    .and_then(Result::ok)
                    .map(|t| t.lines().filter(|l| l.starts_with("- ")).count())
                    .unwrap_or(0),
            ),
            None => (Vec::new(), 0),
        };

        TeamSettings {
            folder: folder.map(|p| p.to_string_lossy().to_string()),
            file: team_context::file_name_for(&name),
            // Empty when they have not chosen one, so the window can offer the
            // account's name rather than having to know Rust's fallback.
            name: stored_team_name().unwrap_or_default(),
            members,
            sharing,
            allowed,
        }
    })
    .await
    .unwrap_or(TeamSettings {
        folder: None,
        name: "Me".into(),
        members: Vec::new(),
        sharing: 0,
        file: String::new(),
        allowed: false,
    })
}

/**
 * Point Sidq at a shared folder, or stop.
 *
 * Creating the directory is part of setting it: every suggested path ends in
 * "Sidq Team", which will not exist the first time. Passing nothing clears the
 * setting and removes this Mac's file from wherever it was, so turning Duo
 * sharing off actually takes you out of your teammates' handovers rather than
 * merely stopping you reading theirs.
 */
/**
 * The seat codes this account has paid for.
 *
 * Empty rather than an error when the account has none, because "you have no
 * seats" is a state the panel renders rather than a failure it reports.
 */
#[tauri::command]
async fn team_seats() -> Vec<invites::Seat> {
    tauri::async_runtime::spawn_blocking(|| {
        index_store::open().and_then(|conn| invites::seats(&conn).ok()).unwrap_or_default()
    })
    .await
    .unwrap_or_default()
}

/**
 * Use a seat code somebody sent, which puts this account on Team.
 *
 * Returns the sentence the database raised on failure, because those are
 * written to be read by whoever just typed the code in — "somebody has already
 * used that code" is a different problem from "that code does not exist" and
 * they need different next moves.
 */
#[tauri::command]
async fn redeem_team_seat(code: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        /*
         * Written long rather than with `?`, deliberately.
         *
         * `None` is success here, so `index_store::open()?` would report a
         * machine that cannot open its own index as a redeemed seat — the one
         * wrong answer this command can give, and the one that looks fine.
         */
        let Some(conn) = index_store::open() else {
            return Some("Sidq cannot open its index on this Mac.".to_string());
        };
        invites::redeem_seat(&conn, code.trim()).err()
    })
    .await
    .unwrap_or(Some("Could not reach your account just now.".into()))
}

/**
 * Start a team and get the code that lets anybody join it.
 *
 * The folder's name *is* the code, so joining never involves reading a path
 * down a phone. Created in the first drive this Mac already syncs, because a
 * team folder somewhere unsynced is a team of one.
 *
 * `None` when there is no synced drive at all, which the window has to say
 * plainly: this feature is built on a drive the team already shares, and
 * without one there is nothing to put the folder in.
 */
#[tauri::command]
async fn start_team() -> Option<String> {
    tauri::async_runtime::spawn_blocking(|| {
        let (_, root) = sync_roots().into_iter().next()?;
        let code = team_context::new_code()?;
        let dir = team_context::create_team(&root, &code)?;

        let conn = index_store::open()?;
        index_store::put_setting(&conn, team_context::FOLDER_KEY, &dir.to_string_lossy())?;
        team_context::publish(&dir, &team_name(), &[]);
        Some(code)
    })
    .await
    .ok()
    .flatten()
}

/// What the window shows when somebody types a code.
#[derive(serde::Serialize)]
struct JoinResult {
    /// True when the folder was found and this Mac is now in that team.
    joined: bool,
    /**
     * Whether the code itself was well formed.
     *
     * A mistyped code and a drive that has not synced yet are the two failures
     * here and they need opposite advice — "check the code" against "accept the
     * share and try again" — so the window is told which one happened rather
     * than being left to guess from a single false.
     */
    understood: bool,
}

/// Join the team a code names, if the drive holding it has reached this Mac.
#[tauri::command]
async fn join_team(code: String) -> JoinResult {
    tauri::async_runtime::spawn_blocking(move || {
        if !team_context::is_code(&code) {
            return JoinResult { joined: false, understood: false };
        }

        let Some(dir) = team_context::find_team(&sync_roots(), &code) else {
            return JoinResult { joined: false, understood: true };
        };

        let joined = index_store::open()
            .and_then(|conn| {
                index_store::put_setting(
                    &conn,
                    team_context::FOLDER_KEY,
                    &dir.to_string_lossy(),
                )
            })
            .is_some();

        if joined {
            // Publish immediately, so the person who shared the code sees them
            // arrive rather than wondering whether it worked.
            team_context::publish(&dir, &team_name(), &[]);
        }
        JoinResult { joined, understood: true }
    })
    .await
    .unwrap_or(JoinResult { joined: false, understood: true })
}

/// The code for the team this Mac is in, if it is in one of ours.
#[tauri::command]
async fn team_code() -> Option<String> {
    tauri::async_runtime::spawn_blocking(|| team_context::code_of(&team_folder()?))
        .await
        .ok()
        .flatten()
}

#[tauri::command]
async fn set_team_folder(path: Option<String>) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(conn) = index_store::open() else { return false };

        let Some(raw) = path.filter(|p| !p.trim().is_empty()) else {
            if let Some(old) = team_folder() {
                team_context::publish(&old, &team_name(), &[]);
            }
            index_store::put_setting(&conn, team_context::FOLDER_KEY, "");
            return true;
        };

        let dir = std::path::PathBuf::from(raw.trim());
        if std::fs::create_dir_all(&dir).is_err() {
            return false;
        }

        /*
         * Leaving the old one behind would leave you in that team's handovers
         * for ever, quoting rules you had moved on from, with no way to tell
         * from this Mac that it was still happening.
         */
        if let Some(old) = team_folder() {
            if old != dir {
                team_context::publish(&old, &team_name(), &[]);
            }
        }

        index_store::put_setting(&conn, team_context::FOLDER_KEY, &dir.to_string_lossy());
        true
    })
    .await
    .unwrap_or(false)
}

/// What teammates see this person called. Blank falls back to the account name.
#[tauri::command]
async fn set_team_name(name: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        // Renaming leaves the old file behind under the old name, still being
        // read by everyone. Take it out before the new one is written.
        if let Some(dir) = team_folder() {
            team_context::publish(&dir, &team_name(), &[]);
        }
        index_store::open()
            .and_then(|conn| index_store::put_setting(&conn, "team.name", name.trim()))
            .is_some()
    })
    .await
    .unwrap_or(false)
}

/// The folder, but only for an account that is paying for the tier it belongs to.
fn duo_folder() -> Option<std::path::PathBuf> {
    let folder = team_folder()?;
    let conn = index_store::open()?;
    entitlement::current(&conn).may_share_with_team().then_some(folder)
}

/**
 * Put one conversation in the team folder.
 *
 * Deliberately its own command rather than a flag on `write_handover`: sharing a
 * whole conversation with a colleague is a decision about that conversation, and
 * it should be impossible to make it by accident while doing something else.
 */
#[tauri::command]
async fn share_handover(
    session_id: String,
    title: String,
    source: String,
    resume_point: String,
    when: String,
    project: String,
) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(folder) = duo_folder() else { return false };

        /*
         * Find the resume point rather than requiring the caller to have one.
         *
         * The window shares from a row of handover history, which records what
         * was carried and when but not where the conversation had got to — so it
         * passed an empty string, and every shared conversation reached a
         * colleague with no "pick up from here" line at all. The session knows;
         * ask it.
         */
        let resume_point = if resume_point.trim().is_empty() {
            // Only macOS can look the session up this way; elsewhere the shared
            // handover arrives without a "pick up from here" line rather than
            // not arriving, which is the smaller loss.
            #[cfg(target_os = "macos")]
            {
                quick_grab::by_id(&session_id).map(|s| s.last_prompt).unwrap_or_default()
            }
            #[cfg(not(target_os = "macos"))]
            {
                String::new()
            }
        } else {
            resume_point
        };
        /*
         * Markdown, whatever the conversation came from.
         *
         * The receiver is not the author and does not necessarily use the same
         * assistant. Markdown pastes correctly into every one of them; XML
         * pastes correctly into one. It also keeps the folder's own rule that
         * what leaves your Mac is legible before it goes.
         */
        let Some(text) = build_handover_for(
            &session_id,
            &source,
            &resume_point,
            &when,
            &project,
            compiler::Target::Markdown,
        ) else {
            return false;
        };

        team_context::share_handover(&folder, &team_name(), &title, &source, &session_id, &text)
            .is_some()
    })
    .await
    .unwrap_or(false)
}

/**
 * Compile a conversation and leave it in an assistant's composer.
 *
 * The last step of "one keystroke" that was never actually done. Everything
 * before this put the handover on the clipboard and then relied on the person
 * to switch application, find the composer and paste — which is the same
 * administration `quick_grab` exists to remove.
 *
 * It costs nothing to run: the assistant is the one they already pay for, in a
 * window Sidq already opens, and no model or server of ours is involved at any
 * point. It also does not press send. That message is theirs to spend.
 */
#[tauri::command]
async fn hand_over_into(
    app: AppHandle,
    session_id: String,
    source: String,
    resume_point: String,
    when: String,
    project: String,
    assistant: String,
) -> Result<(), String> {
    let text = tauri::async_runtime::spawn_blocking(move || {
        build_handover_for(
            &session_id,
            &source,
            &resume_point,
            &when,
            &project,
            compiler::Target::for_source(&assistant),
        )
        .map(|text| (text, assistant))
    })
    .await
    .map_err(|_| "Could not read that conversation.".to_string())?
    .ok_or("Could not read that conversation.")?;

    let (text, assistant) = text;
    assistants::deliver(&app, &assistant, &text)
}

/// Everything Sidq can see somebody working on, busiest first.
#[tauri::command]
async fn projects() -> Vec<index_store::ProjectRow> {
    tauri::async_runtime::spawn_blocking(|| {
        index_store::open().map(|conn| index_store::projects(&conn, 40)).unwrap_or_default()
    })
    .await
    .unwrap_or_default()
}

/// What Sidq knows about one of them.
#[tauri::command]
async fn project_memory(path: String) -> Option<memory::Memory> {
    tauri::async_runtime::spawn_blocking(move || {
        memory::build(&index_store::open()?, &path)
    })
    .await
    .ok()
    .flatten()
}

/**
 * Which assistants on this Mac can be connected to Sidq's MCP server.
 *
 * Only ones actually installed. Offering Cursor to somebody who does not have
 * it produces a button that writes a config file for an app that will never
 * read it, and no way to tell that is what happened.
 */
#[tauri::command]
async fn mcp_clients() -> Vec<(String, String, bool)> {
    tauri::async_runtime::spawn_blocking(|| {
        mcp_setup::CLIENTS
            .iter()
            .filter(|c| mcp_setup::installed(c))
            .map(|c| (c.id.to_string(), c.label.to_string(), true))
            .collect()
    })
    .await
    .unwrap_or_default()
}

/**
 * Add Sidq to one assistant's MCP config.
 *
 * Returns the file written so the window can name it, because "done" with no
 * path is indistinguishable from "done nothing" when the client then has to be
 * restarted before anything visibly changes.
 */
#[tauri::command]
async fn connect_mcp(client: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target = mcp_setup::CLIENTS.iter().find(|c| c.id == client)?;
        let written = mcp_setup::connect(target).map(|p| p.to_string_lossy().to_string());
        if written.is_some() {
            telemetry::count(telemetry::Event::Connected);
        }
        written
    })
    .await
    .ok()
    .flatten()
}

/// The config block, for anyone who would rather paste it themselves.
#[tauri::command]
async fn mcp_config_block() -> Option<String> {
    tauri::async_runtime::spawn_blocking(|| {
        let binary = mcp_setup::sidecar()?;
        let block = serde_json::json!({
            "mcpServers": { "sidq": mcp_setup::config_block(&binary) }
        });
        serde_json::to_string_pretty(&block).ok()
    })
    .await
    .ok()
    .flatten()
}

/// Whether counting is on. Absent means off, and absent is the default.
#[tauri::command]
async fn counting() -> bool {
    tauri::async_runtime::spawn_blocking(|| {
        index_store::open().map(|c| telemetry::enabled(&c)).unwrap_or(false)
    })
    .await
    .unwrap_or(false)
}

/**
 * Turn counting on or off.
 *
 * Off is not just a flag. `set_enabled` also empties the queue, because sending
 * a backlog gathered before somebody opted out is the worst possible reading of
 * "you can turn this off".
 */
#[tauri::command]
async fn set_counting(on: bool) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        index_store::open().and_then(|c| telemetry::set_enabled(&c, on)).is_some()
    })
    .await
    .unwrap_or(false)
}

/**
 * Every event that can be counted, and what each one means.
 *
 * Read out of Rust rather than typed into the window. The list in Settings is
 * the only place somebody can check the privacy page against the program, so it
 * has to come from the same declaration the program counts against — a
 * hand-written copy would go stale in exactly the place that must not.
 */
#[tauri::command]
async fn counted_events() -> Vec<(String, String)> {
    telemetry::catalogue()
}

/**
 * Where a published memory can be read, if this build has a backend at all.
 *
 * Returns both halves because every caller needs both: the endpoint to talk to
 * and the origin the link is printed against. A local build has neither and
 * publishing is simply unavailable there rather than silently broken.
 */
fn share_endpoint() -> Option<(String, String, String)> {
    let url = option_env!("VITE_SUPABASE_URL")?.to_string();
    let key = option_env!("VITE_SUPABASE_ANON_KEY")?.to_string();
    Some((url, key, web_origin()?))
}

/**
 * Publish a project's memory and return the link to it.
 *
 * The one command in this app that deliberately sends something somewhere. It
 * runs only when a person pressed publish on one named project, having been
 * told in the window what leaves the Mac.
 */
#[tauri::command]
async fn share_memory(path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (url, key, origin) = share_endpoint()?;
        let conn = index_store::open()?;
        let id = sharing::publish(&conn, &url, &key, &path)?;
        Some(format!("{origin}/m/{id}"))
    })
    .await
    .ok()
    .flatten()
}

/// Take a published memory down. True when the server confirmed it.
#[tauri::command]
async fn unshare_memory(path: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        let Some((url, key, _)) = share_endpoint() else { return false };
        index_store::open().map(|c| sharing::unpublish(&c, &url, &key, &path)).unwrap_or(false)
    })
    .await
    .unwrap_or(false)
}

/// The link this project is already published under, if any.
#[tauri::command]
async fn memory_link(path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (_, _, origin) = share_endpoint()?;
        let conn = index_store::open()?;
        sharing::published(&conn, &path).map(|id| format!("{origin}/m/{id}"))
    })
    .await
    .ok()
    .flatten()
}

/**
 * Count a setup step, by name.
 *
 * The name is looked up, never converted: `telemetry::setup_step` returns
 * nothing for anything that is not one of the seven screens, so a renamed step
 * costs a number rather than turning the queue into somewhere the window can
 * write arbitrary text.
 */
#[tauri::command]
async fn count_setup_step(step: String) {
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(event) = telemetry::setup_step(&step) {
            telemetry::count(event);
        }
    })
    .await
    .ok();
}

/// Setup finished. The far end of the funnel this whole feature exists to see.
#[tauri::command]
async fn count_ready() {
    tauri::async_runtime::spawn_blocking(|| telemetry::count(telemetry::Event::Ready))
        .await
        .ok();
}

/// A project's memory as text, for the clipboard.
#[tauri::command]
async fn memory_text(path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let conn = index_store::open()?;
        let text = memory::build(&conn, &path).map(|m| m.as_markdown());
        if text.is_some() {
            telemetry::record(&conn, telemetry::Event::MemoryTaken { by_assistant: false });
        }
        text
    })
    .await
    .ok()
    .flatten()
}

/**
 * Put a project's memory in front of an assistant.
 *
 * The difference between this and every handover before it: nothing had to be
 * picked. You are working on a thing, the assistant is told what the thing is,
 * and neither of you had to remember which conversation it was in.
 */
#[tauri::command]
async fn memory_into(app: AppHandle, path: String, assistant: String) -> Result<(), String> {
    let text = tauri::async_runtime::spawn_blocking(move || {
        memory::build(&index_store::open()?, &path).map(|m| m.as_markdown())
    })
    .await
    .map_err(|_| "Could not read that project.".to_string())?
    .ok_or("Sidq has nothing on that project yet.")?;

    assistants::deliver(&app, &assistant, &text)
}

/**
 * Put a project's memory in the team folder.
 *
 * The B2B half of the memory. What one person knows about a piece of work stops
 * living only in their transcripts on their laptop, and somebody joining reads
 * what it started as, where it got to and what was decided — then hands that to
 * whichever assistant they use. No server, no upload, no cost per seat.
 */
#[tauri::command]
async fn share_project(path: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(folder) = duo_folder() else { return false };
        let Some(conn) = index_store::open() else { return false };
        let Some(built) = memory::build(&conn, &path) else { return false };

        team_context::share_project(&folder, &team_name(), &built.name, &built.as_markdown())
            .is_some()
    })
    .await
    .unwrap_or(false)
}

/// Every project anybody on the team has put in the folder, newest first.
#[tauri::command]
async fn team_projects() -> Vec<team_context::SharedProject> {
    tauri::async_runtime::spawn_blocking(|| {
        duo_folder()
            .map(|folder| team_context::shared_projects(&folder, &team_name()))
            .unwrap_or_default()
    })
    .await
    .unwrap_or_default()
}

/// Read one back, so it can go in front of an assistant.
#[tauri::command]
async fn read_team_project(path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        team_context::read_shared_project(&duo_folder()?, &path)
    })
    .await
    .ok()
    .flatten()
}

/// Every conversation anybody on the team has put in the folder, newest first.
#[tauri::command]
async fn team_handovers() -> Vec<team_context::SharedHandover> {
    tauri::async_runtime::spawn_blocking(|| {
        duo_folder()
            .map(|folder| team_context::shared_handovers(&folder, &team_name()))
            .unwrap_or_default()
    })
    .await
    .unwrap_or_default()
}

/**
 * Read one back so the window can put it on the clipboard.
 *
 * ── Why the reader's own rules go on the front ───────────────────────────────
 *
 * A shared conversation used to arrive exactly as the author compiled it: their
 * standing instructions, their team snapshot, their assistant's formatting. That
 * is a file somebody sent you, not a handover to you. The next assistant read it
 * and knew how the *author* works.
 *
 * Now the reader's own standing instructions are put in front of it, built the
 * same way their own handovers build theirs. Same conversation, addressed to the
 * person actually picking it up — which is the whole difference between sharing
 * a file and handing work over.
 *
 * Costs nothing: the rules are already on this machine, and no model, server or
 * network is involved in putting them there.
 */
#[tauri::command]
async fn read_team_handover(path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let folder = duo_folder()?;
        let shared = team_context::read_shared(&folder, &path)?;

        let mine: Vec<String> = index_store::open()
            .map(|conn| {
                profile::build(&index_store::own_turns(&conn, profile::TURN_BUDGET), 8)
                    .into_iter()
                    .filter(|fact| fact.conversations >= 2)
                    .map(|fact| fact.text)
                    .collect()
            })
            .unwrap_or_default();

        if mine.is_empty() {
            return Some(shared);
        }

        let rules = mine.iter().map(|r| format!("- {r}")).collect::<Vec<_>>().join("\n");
        Some(format!(
            "# How the person picking this up works\n\n\
             This conversation happened on somebody else's machine. These are the \
             standing instructions of the person handing it to you now, and they \
             take precedence over anything the original assistant was told.\n\n\
             {rules}\n\n---\n\n{shared}"
        ))
    })
    .await
    .ok()
    .flatten()
}

/**
 * Which modifiers are bound, for anything that has to name them on screen.
 *
 * The window used to write "right ⌘" into the setup copy by hand while Rust
 * read the real pair from settings. Two places holding the same fact, one of
 * which cannot see the other: change the setting and the onboarding starts
 * teaching a key the app is not listening for.
 */
#[tauri::command]
async fn tap_keys() -> (String, String) {
    tauri::async_runtime::spawn_blocking(|| {
        let (grab, drop) = chosen_taps();
        (tap_label(grab), tap_label(drop))
    })
    .await
    .unwrap_or_else(|_| ("right ⌘".into(), "left ⌃".into()))
}

/* ── Grab: one key, and the conversation is on the clipboard ─────────────── */

/**
 * The last thing grabbed, kept so `drop` can put it back without re-reading.
 *
 * In memory only and gone on quit. It is a whole conversation, and a whole
 * conversation belongs in the index and on the clipboard the person asked for,
 * not in a third place on disk that nobody knows exists.
 */
static LAST_GRAB: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

/*
 * Whether a quit was asked for on purpose.
 *
 * The pill is the product and it lives in the same process as the main window,
 * so anything that quits the app kills the pill. The red button is already a
 * no-op and Cmd+M minimises, but Cmd+Q still tore the whole thing down — the
 * pill vanished from the menu bar and the shortcut stopped finding anything,
 * from a keystroke people press out of habit to put a window away.
 *
 * So exit is refused unless this flag is set, and the only thing that sets it
 * is the tray's own "Quit Sidq". Accidental quit cannot take the pill with it;
 * the deliberate one still can, because an app you cannot quit at all is its
 * own kind of broken.
 */
/*
 * Which picker shortcut actually registered.
 *
 * Empty only when every candidate was taken, which is itself worth saying out
 * loud rather than leaving setup waiting on a key that will never arrive.
 */
static PICKER_KEY: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

/**
 * Which onboarding step is on screen, when one is.
 *
 * Setup needs the shortcut two ways round. The step that teaches the key wants
 * to swallow it and light up, proving the real global shortcut fired. The step
 * after it says "press it, pick a conversation, press return" — and for that
 * one the picker has to actually open, or the instruction is a lie.
 *
 * It was a lie. The key was claimed for the whole time the welcome window was
 * up, the event went to a listener armed only on the earlier step, and the
 * headline instruction of the handover step did nothing at all.
 */
static ONBOARDING_STEP: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

/// Steps that want the picker to open rather than to eat the keypress.
const STEPS_WANTING_THE_PICKER: [&str; 1] = ["handover"];

/**
 * The conversation the picker is pointing at, while it is open.
 *
 * Hovering a row selects it, so this is both the row under the pointer and the
 * row the arrow keys are on — one fact, not two, which is why there is one
 * slot rather than a hover slot and a selection slot that could disagree.
 *
 * Cleared when the picker closes. A stale id here would send the gesture to
 * whatever was last looked at rather than to what is happening now, and the
 * whole point of the gesture is that it needs no window.
 */
static AIMED: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

/// The picker saying which conversation it is on, or `None` when it closes.
#[tauri::command]
fn aim_at(session_id: Option<String>) {
    if let Ok(mut slot) = AIMED.lock() {
        *slot = session_id;
    }
}

static QUITTING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Quit on purpose, past the guard above.
///
/// Every exit in the app must go through here. `AppHandle::exit` raises
/// `ExitRequested` like Cmd+Q does, so the guard cannot tell a real quit from an
/// accidental one by the event alone — it can only read this flag. The disk
/// image copy learned that the hard way: it called `exit(0)` after handing over
/// to the installed copy, the guard refused it, and the copy stayed alive with
/// its always-on-top launch card floating over the app it had just started.
fn quit_deliberately(app: &AppHandle) {
    QUITTING.store(true, std::sync::atomic::Ordering::SeqCst);
    app.exit(0);
}

/**
 * Read what is open, take the conversation last touched, compile it, and put it
 * on the clipboard.
 *
 * The sweep first is the point. Browser conversations reach the index every
 * ninety seconds, so without it the thing somebody is looking at right now is
 * routinely the one thing this cannot grab — which is the exact case the
 * shortcut exists for.
 */
#[cfg(target_os = "macos")]
fn grab_now(app: &AppHandle) -> Option<quick_grab::Grabbed> {
    if let Some(conn) = index_store::open() {
        for found in screen_reader::sweep_into(&conn) {
            announce_found(app, &found);
        }
    }

    /*
     * The row under the pointer wins over the newest.
     *
     * With the picker open somebody is looking at a specific conversation, and
     * the gesture has to take that one — grabbing the most recent instead would
     * hand them something they can see they did not pick, which is worse than
     * the gesture doing nothing.
     *
     * Falls back to the newest whenever the picker is shut, which is what the
     * gesture is mostly for: no window, no aiming, just the last thing touched.
     */
    let aimed = AIMED.lock().ok().and_then(|a| a.clone());
    let session = aimed
        .and_then(|id| quick_grab::by_id(&id))
        .or_else(quick_grab::most_recent)?;
    let title = quick_grab::name_of(&session);

    /*
     * The file first, because the file is the artifact.
     *
     * It is what gets attached, what survives the window closing, and what goes
     * to an assistant's retrieval rather than into the context window of every
     * following turn. The clipboard then carries it *and* its text, so the
     * destination decides which it wants — attach in ChatGPT, paste in a
     * terminal — off one gesture.
     */
    /*
     * The file is the whole output now.
     *
     * Without one there is nothing to put on the clipboard and nothing to
     * attach, so a grab that cannot write it has failed rather than half
     * succeeded — and the notification says so instead of claiming a success
     * whose paste would do nothing.
     */
    let path = write_handover(
        session.session_id.clone(),
        title.clone(),
        session.source.to_string(),
        session.last_prompt.clone(),
        "just now".to_string(),
        session.project_name.clone(),
    )?;
    // The gesture path does not report a size to anybody — the notification it
    // raises has room for a title and nothing else.
    let (path, _words) = path;

    if !quick_grab::put_on_clipboard(std::path::Path::new(&path)) {
        return None;
    }
    if let Ok(mut last) = LAST_GRAB.lock() {
        *last = Some(path.clone());
    }

    Some(quick_grab::Grabbed { title, source: label_for(session.source).to_string() })
}

/// The assistant's name as a person writes it.
fn label_for(source: &str) -> &str {
    match source {
        "chatgpt" => "ChatGPT",
        "claude.ai" => "Claude",
        "claude-code" => "Claude Code",
        "cowork" => "Cowork",
        "gemini" => "Gemini",
        "grok" => "Grok",
        "deepseek" => "DeepSeek",
        "cursor" => "Cursor",
        other => other,
    }
}

/**
 * Grab, and say so.
 *
 * The notification is the whole interface for this feature. Nothing opens, so
 * without it the only evidence a key did anything is a clipboard somebody has
 * not pasted yet — and a shortcut that might have silently failed is a shortcut
 * nobody trusts twice.
 *
 * It says where to put it rather than what happened, because "grabbed" is not
 * an instruction and the next move is the part worth knowing.
 */
#[cfg(target_os = "macos")]
fn grab_and_announce(app: &AppHandle) {
    let Some(grabbed) = grab_now(app) else {
        notify(
            app,
            "Nothing to grab yet",
            "Open a conversation with any AI and press it again.",
        );
        return;
    };

    let _ = app.emit("sidq:grabbed", &grabbed.title);
    /*
     * "Attach", singular, because that is now the only thing on the clipboard.
     * It said "attach or paste" while both were on there and the paste is what
     * actually happened every time — an application offered text alongside a
     * file takes the text.
     */
    notify(
        app,
        &format!("{} is on your clipboard", grabbed.source),
        &format!("{} — press ⌘V to attach it anywhere.", grabbed.title),
    );
}

/**
 * Put the last grab back on the clipboard.
 *
 * A separate key because the clipboard is shared: between grabbing a
 * conversation and reaching the place it is going, most people copy something
 * else at least once. Without this, arriving with the wrong thing on the
 * clipboard means going back and doing the whole grab again.
 */
#[cfg(target_os = "macos")]
fn drop_last(app: &AppHandle) {
    let last = LAST_GRAB.lock().ok().and_then(|t| t.clone());

    let Some(path) = last else {
        notify(
            app,
            "Nothing grabbed yet",
            "Grab a conversation first, then this puts it back on your clipboard.",
        );
        return;
    };

    // The same file the grab put there.
    if quick_grab::put_on_clipboard(std::path::Path::new(&path)) {
        notify(
            app,
            "Back on your clipboard",
            "Press ⌘V to attach it wherever you are.",
        );
    }
}

/**
 * How many standing instructions ride along with a handover.
 *
 * Fewer than the profile panel shows. This sits at the top of a prompt the
 * receiving model has to get through before it reaches the conversation, and
 * twenty-five rules there would outweigh the thing being handed over.
 */
const PROFILE_IN_HANDOVER: usize = 8;

/// How many rules to offer. More than this and nobody reads to the bottom.
const PROFILE_LIMIT: usize = 25;

/**
 * What you keep telling assistants, gathered out of your own turns.
 *
 * Built here rather than by a model: every line is a sentence you typed,
 * returned word for word. That makes it free to run, keeps it on this machine,
 * and means the profile cannot say anything you did not.
 */
#[tauri::command]
async fn memory_profile() -> (Vec<profile::Fact>, String) {
    tauri::async_runtime::spawn_blocking(|| {
        let Some(conn) = index_store::open() else {
            return (Vec::new(), String::new());
        };
        let turns = index_store::own_turns(&conn, profile::TURN_BUDGET);
        let facts = profile::build(&turns, PROFILE_LIMIT);
        let preamble = profile::as_preamble(&facts);
        (facts, preamble)
    })
    .await
    .unwrap_or_default()
}

/// What the plan allows and how much of it is left. For display only.
#[derive(Debug, Clone, serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct PlanStatus {
    plan: String,
    handovers_used: u32,
    handovers_cap: Option<u32>,
    history_days: Option<i64>,
}

/**
 * The plan, for the UI to describe.
 *
 * Nothing reads this to decide anything. Every limit is applied inside the
 * command that would breach it, so a page that lies about the plan changes what
 * a person is told and not what they get.
 */
/// Your invite code, how many people used it, and what it earned.
#[tauri::command]
async fn invite_summary() -> invites::Summary {
    tauri::async_runtime::spawn_blocking(|| match index_store::open() {
        Some(conn) => invites::summary(&conn),
        None => invites::Summary::default(),
    })
    .await
    .unwrap_or_default()
}

/**
 * Use somebody else's code.
 *
 * The error is the database's own sentence, handed straight to the panel. Every
 * refusal here — the code does not exist, it is your own, you already used one —
 * is something the person can act on, and replacing it with "could not redeem"
 * would turn a fixable typo into a dead end.
 */
#[tauri::command]
async fn redeem_invite(code: String) -> Result<u32, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let conn = index_store::open().ok_or("Sidq cannot open its index.")?;
        invites::redeem(&conn, &code)
    })
    .await
    .map_err(|_| "The invite could not be redeemed.".to_string())?
}

#[tauri::command]
async fn plan_status() -> PlanStatus {
    tauri::async_runtime::spawn_blocking(|| {
        let Some(conn) = index_store::open() else {
            return PlanStatus::default();
        };
        let plan = entitlement::current(&conn);
        let (used, cap) = entitlement::handover_allowance(&conn, plan);

        PlanStatus {
            plan: serde_json::to_value(plan)
                .ok()
                .and_then(|v| v.as_str().map(str::to_string))
                .unwrap_or_else(|| "free".into()),
            handovers_used: used,
            handovers_cap: cap,
            history_days: plan.history_days(),
        }
    })
    .await
    .unwrap_or_default()
}

/**
 * Hand the signed-in session down to Rust.
 *
 * The token is what lets the app ask the billing database what this account is
 * on, instead of taking the page's word for it. Stored rather than held in
 * memory so the answer survives a restart and the check does not have to happen
 * before the first handover of the day.
 */
#[tauri::command]
async fn set_desktop_session(access_token: String) {
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(conn) = index_store::open() {
            let _ = index_store::put_setting(&conn, "access_token", &access_token);
            // Forces a fresh check rather than trusting whatever the last
            // account on this machine happened to be on.
            let _ = index_store::put_setting(&conn, "tier_checked_at", "0");
        }
    })
    .await
    .ok();
}

/// Conversations and messages indexed. Real numbers for the stats panel.
#[tauri::command]
async fn index_stats() -> (usize, usize) {
    tauri::async_runtime::spawn_blocking(|| {
        index_store::open()
            .map(|conn| index_store::counts(&conn))
            .unwrap_or((0, 0))
    })
    .await
    .unwrap_or((0, 0))
}

/**
 * Open the window behind the pill.
 *
 * Closing it must not quit Sidq: the pill is the product and it keeps working
 * with the window shut, the same way Wispr's dictation bar outlives its
 * settings window. So this shows and focuses rather than creating, and the
 * window's own close button only hides it.
 */
/**
 * Put the window on screen, without stealing the keyboard.
 *
 * Used on the two paths that are not somebody asking for it — launching, and
 * finishing setup. `open_home` takes focus, which is right when the answer to
 * "why is this in front of me" is "because you just clicked Open Sidq", and
 * wrong at login, where an app that was started for you should not take the
 * cursor out of whatever you were typing in.
 */
fn present_home(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("home") {
        let _ = w.unminimize();
        let _ = w.show();
    }
}

#[tauri::command]
fn open_home(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("home") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/**
 * Shrink the picker back to the bar.
 *
 * Still called `hide_pill` by the frontend, and it no longer hides anything.
 * Esc, a finished handover and "search all history" all end here, and every one
 * of them used to leave an empty desktop and a shortcut you had to remember.
 * There is now always something on screen to click.
 */
#[tauri::command]
fn hide_pill(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("pill") {
        let _ = pill_window::collapse(&w);
    }
}

/// Clicking the bar. The only way in that needs no keyboard at all.
#[tauri::command]
fn expand_pill(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("pill") {
        let _ = pill_window::expand(&w);
    }
}

/**
 * ⌘ and an arrow: move the pill, one step per press.
 *
 * The only way to move it. There was a Tauri drag region on the picker's header
 * that had never worked — the capability granting `start-dragging` names the
 * `overlay` and `welcome` windows and the pill is neither, so the attribute was
 * inert markup — and even a working drag would have been undone by the next
 * open, because placing the window re-centres it. One control that works beats
 * two where the obvious one does nothing.
 */
#[tauri::command]
fn move_pill(app: tauri::AppHandle, dx: f64, dy: f64) {
    if let Some(w) = app.get_webview_window("pill") {
        pill_window::nudge(&w, dx, dy);
    }
}

/**
 * The whole conversation, from wherever it lives.
 *
 * Three places, tried in order: a Claude Code or Cowork transcript, a Cursor
 * database, and the index. The index is last because it is the only one that
 * has been through a parser already, but it is also the only home some
 * conversations have — claude.ai imports and anything the extension read out
 * of a browser tab exist nowhere else on the disk.
 *
 * Both of those were searchable and neither could be handed over until this
 * fallback existed, which made them look like sources that half worked.
 */
fn transcript_of(session_id: &str) -> Option<String> {
    work_history::session_transcript(session_id)
        .or_else(|| cursor_history::session_transcript(session_id))
        .or_else(|| codex_history::session_transcript(session_id))
        .or_else(|| index_store::open().and_then(|c| index_store::session_transcript(&c, session_id)))
}

/// How large an export may be. Beyond this it is not one.
const MAX_EXPORT_BYTES: usize = 200 * 1024 * 1024;

/**
 * Import your history from an assistant that runs in a browser.
 *
 * None of them keep anything readable on this Mac, so the export each of them
 * gives you is the only route to the history you already have. Claude, ChatGPT
 * and Google Takeout are all read, and the format is worked out from what is
 * inside the file rather than from its name.
 *
 * Straight into the index with the text, which puts a browser assistant on the
 * same footing as one that writes to disk: searchable, quoted in the memory
 * profile, handoverable.
 */
#[tauri::command]
async fn import_export(json: String) -> Result<usize, String> {
    if json.len() > MAX_EXPORT_BYTES {
        return Err("That file is too large to be a conversation export.".into());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let conversations = imports::parse(&json)?;
        let conn = index_store::open().ok_or("Could not open the index.")?;

        let mut imported = 0usize;
        for c in &conversations {
            let _ = index_store::put_session(
                &conn,
                &c.session_id,
                c.source,
                &c.title,
                c.source,
                "",
                "",
                c.ended_at,
                c.turns.len() as u32,
                0,
            );
            // Fingerprinted by turn count, so re-importing a later export
            // updates the conversations that grew and skips the rest.
            let fingerprint = format!("export:{}:{}", c.ended_at, c.turns.len());
            if index_store::put_messages(&conn, &c.session_id, &c.turns, &fingerprint).is_some() {
                imported += 1;
            }
        }

        Ok(imported)
    })
    .await
    .unwrap_or_else(|_| Err("The import stopped unexpectedly.".into()))
}


/*
 * Where the browser sign-in lives.
 *
 * There is NO production default here on purpose. An earlier version guessed
 * `https://sidq.app`, which turned out to belong to an unrelated company: the
 * app was opening a stranger's website and asking people to sign in on it. A
 * plausible-looking domain is not the same as one you own, and the cost of
 * guessing wrong is sending your users somewhere you do not control.
 *
 * So the origin must be set explicitly at build time via SIDQ_WEB_ORIGIN. In a
 * debug build it falls back to the local dev server, which is always correct.
 * A release build without it refuses to open anything rather than picking a
 * host on the user's behalf.
 */
fn web_origin() -> Option<String> {
    if let Ok(origin) = std::env::var("SIDQ_WEB_ORIGIN") {
        if !origin.trim().is_empty() {
            return Some(origin.trim().trim_end_matches('/').to_string());
        }
    }

    // Compiled in at build time, so a signed release can carry the real domain
    // without needing the variable present on the end user's machine.
    if let Some(baked) = option_env!("SIDQ_WEB_ORIGIN") {
        if !baked.is_empty() {
            return Some(baked.trim_end_matches('/').to_string());
        }
    }

    if cfg!(debug_assertions) {
        return Some("http://localhost:5173".to_string());
    }

    None
}

/// Hand sign-in to the real browser.
///
/// Deliberately not an embedded webview. Google and Apple both refuse to
/// authenticate inside one, and the browser already holds the session and the
/// password manager, so this is both the only thing that works and the fastest
/// path for the user. The redirect brings them back through the sidq:// scheme.

/**
 * Show somebody the plans, at the moment they have run out.
 *
 * The limit card offered "See the plans" and called `open_home`, which opens a
 * window containing search, a memory profile and a source list, and no pricing
 * anywhere at all. Somebody who had just been refused a handover was shown
 * their own search results and nothing to buy.
 *
 * `/upgrade` has existed and been routed in AppShell the whole time. This is
 * the same call `open_sign_in` makes, pointed one path over.
 */
#[tauri::command]
fn open_upgrade(app: AppHandle) -> Result<(), String> {
    let origin = web_origin().ok_or_else(|| {
        "No web address is configured for this build, so the plans cannot open.".to_string()
    })?;
    telemetry::count(telemetry::Event::SawThePlans);
    app.opener()
        .open_url(format!("{}/upgrade", origin), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_sign_in(app: AppHandle) -> Result<(), String> {
    // Refuse rather than guess. The onboarding step shows this message and lets
    // the person carry on without an account, which is a working product; being
    // sent to somebody else's login page is not.
    let origin = web_origin().ok_or_else(|| {
        "No web address is configured for this build, so sign-in cannot open.".to_string()
    })?;

    // The dedicated hand-off page, not the web product's /signin. It knows to
    // bounce the session straight back through the sidq:// scheme.
    let url = format!("{}/desktop-signin", origin);
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}


/*
 * Whether setup has been completed, as its own marker file.
 *
 * This used to be inferred from the autostart flag, which was wrong twice over.
 * Autostart is enabled during the first launch, so any second launch looked
 * "already set up" even if the person closed the window on step one and never
 * came back. And someone who simply turns off "open at login" in settings would
 * be shown the whole onboarding again, every launch, forever.
 *
 * A marker file answers exactly one question and nothing else changes it.
 */
fn onboarding_marker(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("onboarded"))
}

fn has_onboarded(app: &AppHandle) -> bool {
    onboarding_marker(app).is_some_and(|path| path.exists())
}

/// Closes first run and brings the card up.
#[tauri::command]
fn finish_onboarding(app: AppHandle) -> Result<(), String> {
    // Setup is over, so no step wants the shortcut any more.
    set_onboarding_step(None);

    if let Some(path) = onboarding_marker(&app) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        // A failure here means onboarding runs again next launch, which is
        // annoying but harmless, so it is not worth refusing to finish over.
        let _ = std::fs::write(&path, "1");
    }

    if let Some(welcome) = app.get_webview_window("welcome") {
        let _ = welcome.close();
    }
    // Bring the pill up once, so the first thing after setup is the product
    // rather than an empty desktop and a shortcut they have to remember.
    if let Some(pill) = app.get_webview_window("pill") {
        let _ = show_pill(&pill);
    }
    // And the window with it. Setup ends on a working product, not on a bar
    // two pixels tall and nothing else.
    present_home(&app);
    Ok(())
}


/*
 * While setup is open, the shortcuts belong to setup.
 *
 * These are GLOBAL shortcuts, so the OS delivers them to Rust rather than to
 * whichever window has focus. The onboarding steps that say "press ⌘⇧N" were
 * listening for a keydown in their own window, which never arrived: the global
 * handler fired first, showed the overlay, and took focus away. The step could
 * not be completed and there was no way past it.
 *
 * So when the welcome window is up, the keypress is forwarded to it as an event
 * and the normal behaviour is suppressed. That is also more honest as a
 * teaching step: it advances because the real global shortcut fired, not
 * because a key happened to be pressed while the right window was focused.
 *
 * Returns true when the event was claimed, and the caller must then do nothing.
 */
fn claim_for_onboarding(app: &AppHandle, event: &str) -> bool {
    let Some(welcome) = app.get_webview_window("welcome") else {
        return false;
    };
    if !welcome.is_visible().unwrap_or(false) {
        return false;
    }

    // The step that asks you to open the picker has to be allowed to open it.
    let showing = ONBOARDING_STEP.lock().ok().and_then(|s| s.clone()).unwrap_or_default();
    if STEPS_WANTING_THE_PICKER.contains(&showing.as_str()) {
        return false;
    }

    let _ = welcome.set_focus();
    let _ = welcome.emit(event, ());
    true
}

/// Setup saying which step it is on, so the shortcut can behave accordingly.
#[tauri::command]
fn set_onboarding_step(step: Option<String>) {
    if let Ok(mut slot) = ONBOARDING_STEP.lock() {
        *slot = step;
    }
}

/*
 * The frontmost-window watcher is gone.
 *
 * It polled every five seconds, spawned two osascript processes each pass, and
 * emitted an "activity" event that nothing listened to: the card that consumed
 * it was deleted along with the rest of the planner. So it was reading which
 * app somebody had open, all day, on battery, and throwing the answer away.
 *
 * Removing it makes the privacy claim simpler and stronger. Sidq does not look
 * at your screen at all now, which is a better sentence than any careful
 * explanation of what it did with window titles.
 */

fn main() {

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            recent_work,
            hide_pill,
            expand_pill,
            plan_status,
            memory_profile,
            tap_keys,
            team_settings,
            team_folder_options,
            team_nearby,
            reveal_team_folder,
            set_team_folder,
            set_team_name,
            share_handover,
            team_handovers,
            read_team_handover,
            recent_handovers,
            invite_summary,
            redeem_invite,
            accessibility_granted,
            request_accessibility,
            open_accessibility_settings,
            notify_sample,
            picker_shortcut,
            open_picker,
            open_notification_settings,
            extension_status,
            download_extension,
            stale_sources,
            assistant_list,
            open_assistant,
            open_assistant_in_browser,
            import_export,
            handover_text,
            set_desktop_session,
            open_home,
            search_conversations,
            index_stats,
            save_transcript,
            open_sign_in,
            open_upgrade,
            finish_onboarding,
            set_onboarding_step,
            move_pill,
            aim_at,
            hand_over_into,
            projects,
            project_memory,
            memory_into,
            memory_text,
            mcp_clients,
            connect_mcp,
            mcp_config_block,
            counting,
            set_counting,
            counted_events,
            count_setup_step,
            count_ready,
            share_memory,
            unshare_memory,
            memory_link,
            team_seats,
            redeem_team_seat,
            start_team,
            join_team,
            team_code,
            share_project,
            team_projects,
            read_team_project
        ])
        .setup(|app| {
            /*
             * The pill, not the old card.
             *
             * This used to `.expect()` an "overlay" window. When that window was
             * removed from tauri.conf.json the expect became a panic on the very
             * first line of setup, so the app exited before showing anything at
             * all. Looked up rather than unwrapped now: a missing window should
             * cost a feature, never the whole launch.
             */
            let window = app.get_webview_window("pill");

            // Sit above full-screen apps too, not just normal windows. Without this
            // the pill vanishes the moment someone full-screens their editor, which
            // is exactly when they reach for it.
            #[cfg(target_os = "macos")]
            if let Some(w) = &window {
                let _ = w.set_visible_on_all_workspaces(true);
                let _ = w.set_always_on_top(true);
            }

            /*
             * First run opens the welcome window and leaves the card hidden.
             * Showing an always-on-top overlay before anyone has agreed to
             * anything is how an app gets dragged to the trash in its first
             * thirty seconds.
             *
             * "Has run before" is the autostart flag, which is enabled below on
             * the very first launch and never disabled by us again.
             */
            // Listens on 127.0.0.1 for the browser extension. Failure to bind is
            // not fatal: the shortcut still works and the extension says so.
            /*
             * Before anything else. A Sidq running off the disk image cannot
             * use its own shortcuts, and every minute it stays up is a minute
             * somebody spends concluding the feature is broken.
             */
            if hand_over_to_the_installed_copy() {
                quit_deliberately(&app.handle());
                return Ok(());
            }

            /*
             * Measure the housing before the pill can be placed.
             *
             * On the main thread, which the setup closure is and a Tauri
             * command is not. Without this the first placement of a session
             * runs unmeasured, takes the cautious branch that keeps clear of a
             * notch it cannot rule out, and sits a centimetre low until the
             * next placement moves it up. See pill_window::measure_from_setup.
             */
            if let Some(pill) = app.get_webview_window("pill") {
                // Where it was left last time, read before the first placement
                // so it does not appear centred and then jump.
                pill_window::restore_offset();
                pill_window::measure_from_setup(&pill);
            }

            /*
             * Which modifier does what, read once.
             *
             * Both the tray labels and the watcher need the answer, and they
             * must agree: a menu that names a key the app is not listening for
             * is worse than no menu.
             */
            let (grab_key, drop_key) = chosen_taps();

            /*
             * A menu bar item, so quitting is deliberate.
             *
             * Sidq has no dock window most of the time: the pill is summoned and
             * dismissed, and the main window hides rather than closing. Without
             * something in the menu bar there is no visible evidence the app is
             * running and no obvious way to quit it — which is how a background
             * process gets force-quit and never reopened.
             */
            {
                use tauri::menu::{CheckMenuItem, Menu, MenuItem};
                use tauri::tray::TrayIconBuilder;

                let open = MenuItem::with_id(app, "open", "Open Sidq", true, None::<&str>)?;
                let pick = MenuItem::with_id(app, "pick", "Pick up a conversation", true, Some("Cmd+Shift+K"))?;

                /*
                 * The two taps, written down.
                 *
                 * A shortcut nobody can see is a shortcut nobody uses, and
                 * these are worse than most: there is no chord to stumble on
                 * and nothing on screen to click. The menu is where somebody
                 * looks when they half remember that an app could do this.
                 *
                 * Disabled, because they are labels rather than commands —
                 * clicking "double-tap right ⌘" should not grab, or the label
                 * becomes a button that teaches the wrong gesture.
                 */
                let grab_hint = MenuItem::with_id(
                    app,
                    "grab_hint",
                    &gesture_hint("Grab this conversation", grab_key),
                    false,
                    None::<&str>,
                )?;
                let drop_hint = MenuItem::with_id(
                    app,
                    "drop_hint",
                    &gesture_hint("Put the last one back", drop_key),
                    false,
                    None::<&str>,
                )?;

                /*
                 * A way to turn off the thing setup switched on.
                 *
                 * Sidq enables its login item on first run and there was no
                 * off switch anywhere in the product: two commands existed for
                 * it, `autostart_enabled` and `set_autostart`, and nothing had
                 * ever called either. An app that adds itself to login items
                 * and then makes you go to System Settings to undo it is
                 * behaving badly, and the fix is one line of menu.
                 */
                let at_login = CheckMenuItem::with_id(
                    app,
                    "at_login",
                    "Open at login",
                    true,
                    login_item::is_enabled(),
                    None::<&str>,
                )?;

                let quit = MenuItem::with_id(app, "quit", "Quit Sidq", true, None::<&str>)?;
                let menu = Menu::with_items(
                    app,
                    &[&open, &pick, &grab_hint, &drop_hint, &at_login, &quit],
                )?;
                let _ = TrayIconBuilder::with_id("sidq")
                    .icon(app.default_window_icon().unwrap().clone())
                    .menu(&menu)
                    // The menu is the whole interaction; a left click that also
                    // did something would fight it.
                    .show_menu_on_left_click(true)
                    .on_menu_event(move |app, event| match event.id().as_ref() {
                        "open" => open_home(app.clone()),
                        "pick" => {
                            if let Some(w) = app.get_webview_window("pill") {
                                let _ = show_pill(&w);
                            }
                        }
                        "at_login" => {
                            // Read the state back rather than tracking it here:
                            // the checkmark and the launcher must agree, and the
                            // launcher is the one that can fail.
                            let on = login_item::is_enabled();
                            if on {
                                let _ = login_item::disable();
                            } else if running_from_a_mounted_image() {
                                /*
                                 * Registering from the disk image writes a login
                                 * item pointing at /Volumes/Sidq/Sidq.app, which
                                 * is gone the moment the image is ejected. Found
                                 * exactly that on a real machine: a LaunchAgent
                                 * aimed at a path that does not exist at login,
                                 * so it silently never started, while macOS went
                                 * on listing Sidq as a background item forever.
                                 */
                                notify(
                                    app,
                                    "Move Sidq to Applications first",
                                    "Opening at login needs Sidq installed, not run from the disk image.",
                                );
                            } else {
                                let _ = login_item::enable();
                            }
                        }
                        "quit" => {
                            quit_deliberately(app);
                        }
                        _ => {}
                    })
                    .build(app);
            }

            /*
             * Conversations from assistants running inside Sidq.
             *
             * The page emits; this indexes. An event rather than a command
             * because an event needs only `core:event` in the capability, so a
             * remote page gets exactly one narrow way to hand text to the app
             * and no access to anything else in it.
             */
            {
                use tauri::Listener;
                app.listen("assistant:conversation", move |event| {
                    if let Ok(c) = serde_json::from_str::<Conversation>(event.payload()) {
                        std::thread::spawn(move || absorb(&c));
                    }
                });
            }

            /*
             * A menu bar utility, not an ordinary app.
             *
             * Without this the bar cannot appear over another application's
             * fullscreen window however high its level is, which is most of the
             * day for anybody who works fullscreen. There is a tray menu for
             * opening the window and quitting, so nothing is lost with the Dock
             * icon.
             */
            pill_window::become_accessory();

            browser_bridge::spawn(app.handle().clone());

            // Keeps the index current in the background. Search reads from it;
            // the picker still works without it, so a failure here costs a
            // feature rather than the app.
            background::spawn(app.handle().clone());

            if !has_onboarded(&app.handle().clone()) {
                if let Some(welcome) = app.get_webview_window("welcome") {
                    let _ = welcome.show();
                    let _ = welcome.set_focus();
                }
            } else if let Some(w) = &window {
                /*
                 * ── The window comes up with the bar ─────────────────────────
                 *
                 * Launching only ever showed the pill. The window existed but
                 * was never put on screen, so the only routes to it were the
                 * tray menu and a grey link inside the picker — which is what
                 * "make sure this is ALWAYS OPEN, when the pill is on" is
                 * about, asked twice.
                 *
                 * The red button no longer puts it away either, so the two
                 * halves now agree: while Sidq is running, its window is on
                 * screen unless somebody deliberately minimised it.
                 */
                present_home(&app.handle().clone());
                /*
                 * Launching the app shows the picker.
                 *
                 * This showed nothing at all on a normal launch, on the
                 * reasoning that the pill is summoned by a shortcut and should
                 * not sit on screen. That is right for the shortcut and wrong
                 * for the Dock: double-clicking an app and getting an icon that
                 * bounces, a process that starts, and no window anywhere reads
                 * as a broken install, not as a design choice.
                 *
                 * If you opened Sidq, you wanted Sidq.
                 *
                 * It comes up collapsed: the bar, near the bottom, not asking
                 * for anything. Launching straight into the expanded picker
                 * would put a text field in front of somebody who opened the app
                 * for a reason they have not told us yet.
                 */
                let _ = pill_window::collapse(w);

                /*
                 * The window comes up with it.
                 *
                 * Launch used to show the bar alone, on the reasoning that a
                 * 24-point strip in the menu bar is the product and a window is
                 * something you ask for. In practice somebody double-clicks the
                 * app, sees nothing they recognise as having opened, and
                 * concludes it did not start — the bar is deliberately quiet
                 * enough to miss.
                 *
                 * The two are one thing: the window is where the conversations
                 * are and the bar is how you reach them in a hurry. Wispr opens
                 * both and it is right. Closing the window still only hides it,
                 * so the bar outlives it and ⌘⇧K keeps working.
                 */
                open_home(app.handle().clone());
            }

            /*
             * The browser hands the session back through sidq://auth?...
             *
             * Forwarded to the welcome window rather than acted on here: the
             * token belongs to the web layer, which already owns every other
             * path into a Supabase session. Two places writing auth state is how
             * you end up signed in on one surface and out on the other.
             */
            let deep_link_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let urls: Vec<String> = event.urls().iter().map(|u| u.to_string()).collect();
                if let Some(welcome) = deep_link_handle.get_webview_window("welcome") {
                    let _ = welcome.set_focus();
                    let _ = welcome.emit("deep-link", urls);
                }
            });


            /*
             * The picker. Cmd+Shift+K.
             *
             * This is the product, so it gets the shortcut that is easiest to
             * hit and it works from inside whatever you are already in. Unlike
             * the card it takes focus, because it is a text field and a
             * keyboard list.
             *
             * Toggling rather than only showing: pressing the summon key again
             * is what everybody tries first when they want it gone.
             */
            /*
             * Candidates, best first.
             *
             * A global shortcut is first-come on macOS, so the combination the product
             * wants is not necessarily the one it gets. ⌘⇧K is what everything is
             * written around; the rest exist because it is commonly taken, and losing
             * the picker entirely is far worse than teaching a different key. There is
             * no way to ask macOS in advance, so each is checked by trying it.
             */
            const CANDIDATES: [(Modifiers, Code, &str); 4] = [
                (Modifiers::SUPER.union(Modifiers::SHIFT), Code::KeyK, "⌘⇧K"),
                (Modifiers::SUPER.union(Modifiers::SHIFT), Code::KeyJ, "⌘⇧J"),
                (Modifiers::SUPER.union(Modifiers::ALT), Code::KeyK, "⌘⌥K"),
                (Modifiers::CONTROL.union(Modifiers::SHIFT), Code::KeyK, "⌃⇧K"),
            ];

            let pick_handle = app.handle().clone();
            let on_pick = move |_: &tauri::AppHandle, _: &Shortcut, event: ShortcutEvent| {
                if event.state() != ShortcutState::Pressed {
                    return;
                }
                /*
                 * Setup owns this key while it is open.
                 *
                 * The last setup step waits on ⌘⇧K genuinely firing, which is
                 * the only honest proof the shortcut registered at all. Opening
                 * the picker over the setup window at that moment would hide
                 * the very screen asking for the keypress.
                 */
                if claim_for_onboarding(&pick_handle, "shortcut-pill") {
                    return;
                }
                if let Some(w) = pick_handle.get_webview_window("pill") {
                    // Toggles between the two sizes. Pressing it again while the
                    // picker is open shrinks it back to the bar rather than
                    // taking it off the screen entirely.
                    let _ = pill_window::toggle(&w);
                }
            };

            /*
             * Registration failure is no longer fatal.
             *
             * This was `on_shortcut(...)?`, so a combination another app had already
             * claimed took the whole of setup down with it. The picker is reachable
             * from the tray and the pill regardless, so a lost shortcut is a far
             * smaller problem than an app that will not start.
             */
            for (mods, code, label) in CANDIDATES {
                if app
                    .global_shortcut()
                    .on_shortcut(Shortcut::new(Some(mods), code), on_pick.clone())
                    .is_ok()
                {
                    if let Ok(mut slot) = PICKER_KEY.lock() {
                        *slot = Some(label.to_string());
                    }
                    break;
                }
            }


            /*
             * ── Grab and drop, on two taps ───────────────────────────────────
             *
             * Not a chord. Every reasonable ⌘⇧-something is taken by something,
             * and a global shortcut wins against every application at once, so
             * claiming one quietly breaks that combination in the person's
             * editor and browser for a feature they use a few times a day.
             *
             * Right ⌘ grabs, left ⌃ puts the last grab back, and both are
             * settings. See double_tap for the two that were ruled out by what
             * people actually run: fn is Wispr Flow's push to talk, and right ⌥
             * opens Claude for Desktop's overlay, and right ⌃ is not a key
             * Apple has ever put on a keyboard. None of the three was
             * discoverable by reasoning about it, which is the argument for
             * this being changeable without a release.
             */
            /*
             * The gesture, where there is one.
             *
             * Everything inside this block is NSEvent, so grabbing and putting
             * back are macOS-only for now. The global shortcut registered above
             * is not a substitute: it opens the picker, which is a different
             * action, and the two tap gestures have no counterpart on Windows
             * or Linux yet.
             *
             * Seeing a modifier press with no key attached needs a low-level
             * keyboard hook off macOS, and a background process installing one
             * is a keylogger to every security product on the machine. Whatever
             * replaces this has to be a chord people opt into, not a hook.
             */
            #[cfg(target_os = "macos")]
            let taps = app.handle().clone();
            #[cfg(target_os = "macos")]
            double_tap::watch(vec![grab_key, drop_key], move |mask| {
                    let app = taps.clone();
                    /*
                     * Off the event thread. This block runs inside AppKit's own
                     * dispatch, and a grab reads every open assistant, compiles
                     * a transcript and writes a file — doing that here freezes
                     * the keyboard for the length of it.
                     */
                std::thread::spawn(move || {
                    if mask == grab_key {
                        grab_and_announce(&app);
                    } else {
                        drop_last(&app);
                    }
                });
            });

            /*
             * On by default, and the card says so on first run.
             *
             * Never from a mounted disk image, though. The launcher registers
             * whatever path is running, so opening Sidq straight out of the DMG
             * wrote a login item pointing at /Volumes/Sidq — which then either
             * failed silently once the image was ejected, or launched the disk
             * image copy, whose Accessibility grant belongs to a different path
             * than the one in Applications. That is the whole reason capture
             * was intermittent on the machine this was written on.
             *
             * The tray toggle already refused this case. The automatic enable
             * on launch did not, which is where the bad entry came from.
             */
            /*
             * Launch at login, registered as the app itself.
             *
             * mainAppService rather than a bundled agent: an agent plist with
             * RunAtLoad is started by launchd the instant it is registered, and
             * that shipped in 0.1.73 as a second copy of Sidq launching itself
             * behind the first. Registering the app adds a login item and
             * launches nothing.
             *
             * Off the setup thread because the cleanup shells out to launchctl,
             * and setup must reach the line that closes the splash card.
             */
            let mounted = running_from_a_mounted_image();
            std::thread::spawn(move || {
                login_item::unregister_stale_agent();
                login_item::remove_legacy_agent();
                if !mounted && !login_item::is_enabled() {
                    let _ = login_item::enable();
                }
            });

            /*
             * ── Take the launch card away ────────────────────────────────────
             *
             * Setup has finished by the time this runs, so the app is ready and
             * the card could close immediately. It waits anyway: a splash that
             * appears and vanishes inside a couple of frames reads as a glitch,
             * and on a fast machine that is exactly what would happen. Just
             * over a second is long enough to be a deliberate thing somebody
             * saw and short enough that nobody waits for it.
             *
             * Its own thread rather than blocking setup, because everything
             * after this — the tray, the shortcut, the pill — has to be live
             * before the card goes, or there is a moment where Sidq has
             * announced itself and cannot do anything.
             */
            let closing = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(1100));
                if let Some(splash) = closing.get_webview_window("splash") {
                    let _ = splash.close();
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            /*
             * Closing the main window hides it rather than destroying it.
             *
             * The pill is the product and it must survive the window being shut,
             * which is the shape Wispr uses: the bar stays, the window is
             * something you dismiss. Without this, closing the window on macOS
             * tears down the webview and the shortcut stops finding anything.
             */
            if window.label() == "home" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    /*
                     * Minimise rather than hide.
                     *
                     * Hiding removed the window from every list macOS keeps —
                     * no Dock icon on an accessory app, nothing in the window
                     * menu — so the only routes back were the tray and a small
                     * grey link inside the picker. "The big window should
                     * ALWAYS be open, and not only opened with search all
                     * history on the pill, that is easily missable."
                     *
                     * Minimised, it is still a real window in the Dock's right
                     * hand side, and clicking it brings it back the way it does
                     * for every other app.
                     */
                    /*
                     * ── And now it does not minimise either ──────────────────
                     *
                     * Asked for twice: "make sure the UI in main big window is
                     * ALWAYS open", then "make sure this is ALWAYS OPEN, when
                     * the pill is on."
                     *
                     * Minimising was already better than hiding — the window
                     * stayed in the Dock instead of vanishing from every list
                     * macOS keeps — but it is still gone from the screen, and
                     * the red button is the one people press to get a window
                     * out of the way without meaning to close the app.
                     *
                     * So the red button now does nothing at all while Sidq is
                     * running. The yellow one and ⌘M still minimise, because
                     * taking away the deliberate gesture for putting a window
                     * away would be a different kind of rude — this only stops
                     * the accidental one.
                     */
                    api.prevent_close();
                }
            }

            /*
             * Clicking anywhere else closes the picker.
             *
             * It opened on a click and closed only on Esc or ⌘⇧K, which is a
             * keyboard-shaped exit on a thing people reach for with a mouse.
             * Nobody presses the key, so the picker stayed open over whatever
             * they went back to.
             *
             * Losing focus is the right signal rather than a click handler:
             * it fires whichever way attention actually left, including
             * switching apps with ⌘-tab or clicking another window's title bar,
             * and it is what Spotlight and every launcher on this platform do.
             *
             * This depends on the picker being able to take the keyboard
             * at all. It stopped for one build, when the window became a
             * panel and nothing could become key any more: no focus in,
             * no focus out, and the picker could not be closed by
             * clicking. `is_expanded` is what keeps the collapsed bar
             * from acting on it.
             */
            if window.label() == "pill" {
                if let tauri::WindowEvent::Focused(false) = event {
                    if let Some(pill) = window.get_webview_window("pill") {
                        if pill_window::is_expanded(&pill) {
                            let _ = pill_window::collapse(&pill);
                        }
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running Sidq")
        .run(|app, event| {
            /*
             * Clicking the Dock icon of an already-running Sidq shows the picker.
             *
             * Without this, the second click does nothing at all: the process is
             * already up, macOS sends Reopen rather than launching again, and
             * nobody handles it. From the outside that is an app that opened
             * once and then stopped responding to its own icon.
             */
            // Reopen is a macOS run event: it is what a Dock click on a
            // running app produces, and neither Windows nor Linux has the
            // concept, so the variant does not exist in RunEvent there.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                if let Some(w) = app.get_webview_window("pill") {
                    let _ = show_pill(&w);
                }
            }

            /*
             * Cmd+Q, the Dock's Quit, "close all windows" — every one of these
             * asks the app to exit, and every one of them would take the pill
             * with it. Refused unless the tray's Quit set the flag first. That
             * is the whole "the pill stays on no matter what happens to the
             * window" guarantee, enforced at the one place all of those paths
             * funnel through.
             */
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if !QUITTING.load(std::sync::atomic::Ordering::SeqCst) {
                    api.prevent_exit();
                }
            }
        });
}
