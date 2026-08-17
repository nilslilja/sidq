// Sidq desktop companion.
//
// A small always-on-top card that knows what you are working on. It does three
// things and nothing else: shows the current task, notices when the window in front
// of you stopped matching it, and tells you when to stop.
//
// Design rule throughout: the failure mode for an always-on overlay is not missing
// a distraction, it is being annoying enough to get quit. Everything here errs
// toward silence and toward staying out of the way.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod browser_bridge;
mod handover;
mod cursor_history;
mod work_history;


use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
// GlobalShortcutExt is what puts .global_shortcut() on App. Without the trait in
// scope the method simply does not exist, which is what the compiler was saying.
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as AutostartManagerExt};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
// OpenerExt puts .opener() on AppHandle. This is the supported way to hand a URL
// to the system browser; shell().open() still works but is deprecated.
use tauri_plugin_opener::OpenerExt;

/// Show or hide the card. Bound to a global shortcut so it can be dismissed
/// without reaching for the mouse mid-task.
#[tauri::command]
fn toggle_overlay(window: WebviewWindow) -> Result<(), String> {
    let visible = window.is_visible().map_err(|e| e.to_string())?;
    if visible {
        window.hide().map_err(|e| e.to_string())?;
    } else {
        window.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Bring the card forward and focus it, for quick capture.
///
/// Separate from `toggle_overlay` because capture must always end with the card
/// visible AND focused: a shortcut that sometimes hides the thing you are trying
/// to type into is worse than no shortcut.
#[tauri::command]
fn focus_overlay(window: WebviewWindow) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

/// Whether the app launches at login, and setting it.
///
/// Default on, because an overlay you have to remember to start is an overlay you
/// stop using in a week. The user is told this on first run rather than finding
/// out later, which is the difference between a default and a trick.
#[tauri::command]
fn autostart_enabled(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|e| e.to_string())
    } else {
        manager.disable().map_err(|e| e.to_string())
    }
}


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
 * Put the pill where it always goes and show it.
 *
 * Horizontally centred, a fixed distance from the top, every single time. It is
 * deliberately not movable and does not remember a position: it is on screen for
 * a few seconds at a time, and a window you can drag is a window you have to
 * decide about before you can use it.
 */
fn show_pill(w: &tauri::WebviewWindow) -> tauri::Result<()> {
    if let (Ok(Some(monitor)), Ok(size)) = (w.current_monitor(), w.outer_size()) {
        let screen = monitor.size();
        let x = (screen.width as i32 - size.width as i32) / 2;
        let y = (screen.height as f64 * 0.16) as i32;
        let _ = w.set_position(tauri::PhysicalPosition::new(x.max(0), y));
    }
    w.show()?;
    w.set_focus()
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
#[tauri::command]
async fn save_transcript(
    session_id: String,
    title: String,
    source: String,
    resume_point: String,
    when: String,
    project: String,
) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let transcript = work_history::session_transcript(&session_id)
            .or_else(|| cursor_history::session_transcript(&session_id))?;

        /*
         * The instruction goes in with it.
         *
         * A transcript on its own produced a model that commented on the
         * conversation instead of continuing it. The preamble is the difference
         * between a handover and a paste.
         */
        let text = handover::wrap(
            &handover::Handover {
                source: &source,
                title: &title,
                resume_point: &resume_point,
                when: &when,
                project: &project,
            },
            &transcript,
        );

        let home = std::env::var_os("HOME")?;
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
        Some(path.to_string_lossy().to_string())
    })
    .await
    .ok()
    .flatten()
}

#[tauri::command]
fn hide_pill(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("pill") {
        let _ = w.hide();
    }
}

#[tauri::command]
async fn session_transcript(session_id: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        // Both id spaces are uuids, so trying one then the other cannot collide
        // and saves threading a source tag through the picker for no gain.
        work_history::session_transcript(&session_id)
            .or_else(|| cursor_history::session_transcript(&session_id))
    })
    .await
    .ok()
    .flatten()
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
 * Open the browser at the page that connects the web assistants.
 *
 * ChatGPT, Gemini and Perplexity keep nothing readable on this Mac, so the only
 * honest route in is the browser they are already signed into. Same reasoning as
 * sign-in below: refuse rather than guess a host.
 */
#[tauri::command]
fn open_connect_page(app: AppHandle) -> Result<(), String> {
    let origin = web_origin().ok_or_else(|| {
        "No web address is configured for this build, so the connect page cannot open."
            .to_string()
    })?;
    app.opener()
        .open_url(format!("{}/connect", origin), None::<&str>)
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
    Ok(())
}


/*
 * Nudge the card with the arrow keys.
 *
 * Deliberately NOT a global shortcut. ⌘ and ⌘⇧ with arrows are "move/select to
 * end of line" in every text field on the system, and registering those globally
 * would break text editing in every other application on the machine to save one
 * drag. So this is a command the overlay calls from its own keydown handler, and
 * it only does anything while the card actually has focus.
 */
#[tauri::command]
fn move_overlay(window: WebviewWindow, dx: f64, dy: f64) -> Result<(), String> {
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;

    window
        .set_position(tauri::LogicalPosition::new(
            position.x as f64 / scale + dx,
            position.y as f64 / scale + dy,
        ))
        .map_err(|e| e.to_string())
}

/// Lets the card grow and shrink as its content changes without the user resizing.
#[tauri::command]
fn resize_overlay(window: WebviewWindow, height: f64) -> Result<(), String> {
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    // Width is whatever the user dragged it to; height always follows content.
    // Clamping height to a guess is what causes a card to be cut in half.
    window
        .set_size(tauri::LogicalSize::new(
            size.width as f64 / scale,
            height.clamp(64.0, 640.0),
        ))
        .map_err(|e| e.to_string())
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

    let _ = welcome.set_focus();
    let _ = welcome.emit(event, ());
    true
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
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            toggle_overlay,
            focus_overlay,
            recent_work,
            session_transcript,
            hide_pill,
            save_transcript,
            resize_overlay,
            move_overlay,
            autostart_enabled,
            set_autostart,
            open_sign_in,
            open_connect_page,
            finish_onboarding
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
            browser_bridge::spawn(app.handle().clone());

            if !has_onboarded(&app.handle().clone()) {
                if let Some(welcome) = app.get_webview_window("welcome") {
                    let _ = welcome.show();
                    let _ = welcome.set_focus();
                }
            } else if let Some(w) = &window {
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
                 */
                let _ = show_pill(w);
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
            let pick = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyK);
            let pick_handle = app.handle().clone();
            app.global_shortcut().on_shortcut(pick, move |_, _, event| {
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
                    if w.is_visible().unwrap_or(false) {
                        let _ = w.hide();
                    } else {
                        let _ = show_pill(&w);
                    }
                }
            })?;


            // On by default, and the card says so on first run.
            let launcher = app.autolaunch();
            if !launcher.is_enabled().unwrap_or(false) {
                let _ = launcher.enable();
            }
            Ok(())
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
            if let tauri::RunEvent::Reopen { .. } = event {
                if let Some(w) = app.get_webview_window("pill") {
                    let _ = show_pill(&w);
                }
            }
        });
}
