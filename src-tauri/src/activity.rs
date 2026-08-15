//! Reading what the user is actually doing.
//!
//! Deliberately NOT a screenshot pipeline. The frontmost application name plus its
//! window title identify the activity precisely, cost nothing, take under a
//! millisecond, and never leave the machine. A vision model over screenshots would
//! be dollars per user per day, slower, less accurate, and would mean shipping the
//! contents of someone's screen to a server.
//!
//! macOS needs Accessibility permission to read the window *title*. The app name is
//! available without it, so the companion degrades to app-level awareness rather
//! than failing outright when permission is refused.

use serde::Serialize;

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
pub struct Activity {
    /// e.g. "Google Chrome". Empty when it cannot be determined.
    pub app: String,
    /// e.g. "pricing page - Figma". Empty without Accessibility permission.
    pub window_title: String,
    /// False when we are running blind, so the UI can say so honestly.
    pub has_permission: bool,
}

#[cfg(target_os = "macos")]
mod imp {
    use super::Activity;
    use std::process::Command;

    /// Runs a snippet of AppleScript and returns trimmed stdout.
    ///
    /// Shelling out rather than linking the whole Accessibility API: reading a
    /// title through AppleScript is a few lines instead of a pile of unsafe FFI,
    /// and at one poll every five seconds the spawn cost is acceptable.
    ///
    /// It is NOT acceptable at one poll per second, which is why the permission
    /// check below is a direct call instead of "did a title come back".
    fn osascript(script: &str) -> Option<String> {
        let out = Command::new("osascript").arg("-e").arg(script).output().ok()?;
        if !out.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if text.is_empty() {
            None
        } else {
            Some(text)
        }
    }

    pub fn current() -> Activity {
        // App name works without Accessibility permission.
        let app = osascript(
            r#"tell application "System Events" to get name of first application process whose frontmost is true"#,
        )
        .unwrap_or_default();

        // Window title does not. A failure here is the normal unpermitted state,
        // not an error worth surfacing.
        let title = osascript(
            r#"tell application "System Events" to tell (first application process whose frontmost is true) to get value of attribute "AXTitle" of window 1"#,
        );

        Activity {
            has_permission: title.is_some(),
            window_title: title.unwrap_or_default(),
            app,
        }
    }

    /*
     * Is Accessibility granted, cheaply.
     *
     * This exists because onboarding polls the answer every second or so while
     * the person is in System Settings, and the obvious implementation, calling
     * `current()` and checking whether a window title came back, spawns two
     * osascript processes per poll. Each is 100-300ms, and the title one blocks
     * against the very permission being waited on. The result was a window that
     * froze solid for the whole of setup.
     *
     * AXIsProcessTrusted is a single C call into a framework already linked into
     * every macOS process. It answers in microseconds, spawns nothing, and never
     * prompts. It is the one thing worth a line of FFI in this file.
     */
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
    }

    pub fn is_trusted() -> bool {
        // SAFETY: AXIsProcessTrusted takes no arguments, dereferences nothing,
        // and returns a plain bool. It is callable from any thread and has no
        // preconditions. The framework is linked above.
        unsafe { AXIsProcessTrusted() }
    }

    /// Triggers the system Accessibility prompt once, so the user is asked in
    /// context rather than discovering a silently broken feature.
    pub fn request_permission() {
        let _ = Command::new("osascript")
            .arg("-e")
            .arg(r#"tell application "System Events" to get name of first application process whose frontmost is true"#)
            .output();
    }
}

#[cfg(target_os = "windows")]
mod imp {
    use super::Activity;

    // Windows needs GetForegroundWindow + GetWindowTextW + the owning process name.
    // Left unimplemented rather than faked: an activity reader that silently
    // returns nothing is worse than one that says it is not wired up yet.
    /// No equivalent permission on this platform.
    pub fn is_trusted() -> bool {
        false
    }

    pub fn current() -> Activity {
        Activity {
            app: String::new(),
            window_title: String::new(),
            has_permission: false,
        }
    }

    pub fn request_permission() {}
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
mod imp {
    use super::Activity;

    // Linux is genuinely hard: X11 exposes _NET_ACTIVE_WINDOW, but Wayland
    // deliberately does not let one app inspect another's windows. On Wayland this
    // feature cannot exist without a compositor-specific portal.
    pub fn is_trusted() -> bool {
        false
    }

    pub fn current() -> Activity {
        Activity::default()
    }

    pub fn request_permission() {}
}

pub use imp::{current, is_trusted, request_permission};
