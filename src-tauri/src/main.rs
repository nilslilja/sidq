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

mod activity;
mod work_history;

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
// GlobalShortcutExt is what puts .global_shortcut() on App. Without the trait in
// scope the method simply does not exist, which is what the compiler was saying.
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as AutostartManagerExt};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
// OpenerExt puts .opener() on AppHandle. This is the supported way to hand a URL
// to the system browser; shell().open() still works but is deprecated.
use tauri_plugin_opener::OpenerExt;

/// How often we look at the frontmost window.
///
/// Five seconds is deliberate. Sub-second polling buys nothing (nobody switches
/// task meaningfully in under five seconds) and costs battery on a laptop that has
/// to last a working day.
const POLL_INTERVAL: Duration = Duration::from_secs(5);

#[derive(Default)]
struct AppState {
    /// Last activity we emitted, so we only wake the UI on an actual change.
    last: Mutex<activity::Activity>,
}

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

#[tauri::command]
fn current_activity() -> activity::Activity {
    activity::current()
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
    tauri::async_runtime::spawn_blocking(move || work_history::recent_sessions(limit.min(50)))
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
#[tauri::command]
fn hide_pill(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("pill") {
        let _ = w.hide();
    }
}

#[tauri::command]
async fn session_transcript(session_id: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || work_history::session_transcript(&session_id))
        .await
        .ok()
        .flatten()
}

#[tauri::command]
fn accessibility_granted() -> bool {
    activity::is_trusted()
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

/// Opens the real Accessibility pane in System Settings.
///
/// macOS grants this permission in exactly one place and no application can grant
/// it for you, so the honest thing is to take the person there in one click. The
/// URL scheme is Apple's own; there is nothing to fake and nothing to imitate.
#[tauri::command]
fn open_accessibility_settings(app: AppHandle) -> Result<(), String> {
    // Also fires the real system prompt, so whichever the person responds to
    // first works. Both paths end in the same checkbox.
    activity::request_permission();

    #[cfg(target_os = "macos")]
    {
        app.opener()
            .open_url(
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
                None::<&str>,
            )
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;

    Ok(())
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
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.show();
        let _ = overlay.set_focus();
    }
    Ok(())
}

#[tauri::command]
fn request_accessibility() {
    activity::request_permission();
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

/// Watches the frontmost window and emits only when it changes.
///
/// The relevance decision is NOT made here. It lives in the TypeScript focus
/// engine, which is unit tested and shared with the web app, so there is one
/// definition of "are you on task" rather than two that drift.
fn spawn_activity_watch(app: AppHandle) {
    std::thread::spawn(move || loop {
        /*
         * Do nothing while the card is hidden or setup is still open.
         *
         * Each pass spawns two osascript processes. During onboarding the card
         * is not even visible, so that was pure cost competing with the setup
         * window for the main thread, and it was a large part of why the whole
         * flow felt like it was seizing up.
         */
        let overlay_visible = app
            .get_webview_window("overlay")
            .and_then(|w| w.is_visible().ok())
            .unwrap_or(false);

        if !overlay_visible {
            std::thread::sleep(POLL_INTERVAL);
            continue;
        }

        let current = activity::current();

        let changed = {
            let state = app.state::<Arc<AppState>>();
            let mut last = state.last.lock().unwrap();
            if *last != current {
                *last = current.clone();
                true
            } else {
                false
            }
        };

        if changed {
            let _ = app.emit("activity", &current);
        }

        std::thread::sleep(POLL_INTERVAL);
    });
}

fn main() {
    let state = Arc::new(AppState::default());

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
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            toggle_overlay,
            focus_overlay,
            current_activity,
            accessibility_granted,
            recent_work,
            session_transcript,
            hide_pill,
            request_accessibility,
            resize_overlay,
            move_overlay,
            autostart_enabled,
            set_autostart,
            open_sign_in,
            open_accessibility_settings,
            finish_onboarding
        ])
        .setup(|app| {
            let window = app
                .get_webview_window("overlay")
                .expect("overlay window is declared in tauri.conf.json");

            // Sit above full-screen apps too, not just normal windows. Without this
            // the card vanishes the moment someone full-screens their editor, which
            // is exactly when they need it.
            #[cfg(target_os = "macos")]
            {
                let _ = window.set_visible_on_all_workspaces(true);
                let _ = window.set_always_on_top(true);
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
            if !has_onboarded(&app.handle().clone()) {
                if let Some(welcome) = app.get_webview_window("welcome") {
                    let _ = welcome.show();
                    let _ = welcome.set_focus();
                }
            } else {
                window.show()?;
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

            // Cmd/Ctrl+Shift+S toggles the card. Chosen to avoid collisions with
            // the common editor and browser shortcuts.
            let toggle = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyS);
            let handle = app.handle().clone();
            app.global_shortcut().on_shortcut(toggle, move |_, _, event| {
                if event.state() != ShortcutState::Pressed {
                    return;
                }
                // Setup owns the shortcuts while it is open. See the note on
                // `claim_for_onboarding` below.
                if claim_for_onboarding(&handle, "shortcut-hide") {
                    return;
                }
                if let Some(w) = handle.get_webview_window("overlay") {
                    let _ = toggle_overlay(w);
                }
            })?;

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
                if let Some(w) = pick_handle.get_webview_window("pill") {
                    if w.is_visible().unwrap_or(false) {
                        let _ = w.hide();
                    } else {
                        // Centred on every summon. The picker should appear where
                        // the eyes already are, not where it was left last time.
                        let _ = w.center();
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            })?;

            // Quick capture. The whole point is that it works from inside any other
            // application, so it has to be a global shortcut rather than anything
            // the card itself owns.
            let capture = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyN);
            let capture_handle = app.handle().clone();
            app.global_shortcut().on_shortcut(capture, move |_, _, event| {
                if event.state() != ShortcutState::Pressed {
                    return;
                }
                if claim_for_onboarding(&capture_handle, "shortcut-capture") {
                    return;
                }
                if let Some(w) = capture_handle.get_webview_window("overlay") {
                    let _ = w.show();
                    let _ = w.set_focus();
                    let _ = w.emit("quick-capture", ());
                }
            })?;

            // On by default, and the card says so on first run.
            let launcher = app.autolaunch();
            if !launcher.is_enabled().unwrap_or(false) {
                let _ = launcher.enable();
            }

            spawn_activity_watch(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Sidq");
}
