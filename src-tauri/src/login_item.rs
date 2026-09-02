//! Launch-at-login through SMAppService, and migration off the old loose agent.
//!
//! ── Why this replaces tauri-plugin-autostart on macOS ────────────────────────
//!
//! The plugin, configured with `MacosLauncher::LaunchAgent`, wrote a loose
//! legacy agent to `~/Library/LaunchAgents/Sidq.plist`. macOS attributes loose
//! legacy agents to the code-signing team, so "Allow in the Background" showed
//! the certificate holder's personal name instead of the app. A user found this
//! with `sfltool dumpbtm` and it is exactly right: the fix is not the
//! certificate, it is the registration method.
//!
//! SMAppService registers a plist bundled inside the app
//! (`Contents/Library/LaunchAgents/app.sidq.desktop.agent.plist`) and macOS
//! groups it under the app. Same signature, but it now reads as "Sidq".
//!
//! ── Everything here fails soft ───────────────────────────────────────────────
//!
//! Launch-at-login is a convenience, never a thing the product depends on. Every
//! call returns a plain bool and a registration that errors is logged and
//! swallowed rather than propagated, because a person who could not be enrolled
//! at login still has a working app. The one hard rule from the old code is
//! kept: never register while running from a mounted disk image, or launchd
//! ends up pointed at a path that vanishes when the image ejects.

#[cfg(target_os = "macos")]
mod imp {
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject, Bool};
    use objc2::msg_send;
    use objc2_foundation::NSString;

    /// The filename SMAppService is asked to register. Must match both the
    /// bundled plist's name and its `Label`.
    const PLIST_NAME: &str = "app.sidq.desktop.agent.plist";

    /// SMAppServiceStatus. Only `enabled` means it is actually on.
    const STATUS_ENABLED: isize = 1;

    fn class() -> Option<&'static AnyClass> {
        // None on a system without ServiceManagement, which cannot happen on the
        // 13.0 minimum but is handled rather than unwrapped.
        AnyClass::get(c"SMAppService")
    }

    /// `+[SMAppService agentServiceWithPlistName:]`.
    fn agent() -> Option<Retained<AnyObject>> {
        let cls = class()?;
        let name = NSString::from_str(PLIST_NAME);
        // Class method returning a retained autoreleased instance.
        let obj: *mut AnyObject =
            unsafe { msg_send![cls, agentServiceWithPlistName: &*name] };
        if obj.is_null() {
            return None;
        }
        // SAFETY: agentServiceWithPlistName: returns a valid, autoreleased
        // SMAppService; retain it so it outlives the pool.
        Some(unsafe { Retained::retain(obj) }?)
    }

    /// Turn launch-at-login on. Returns whether it is enabled afterwards.
    pub fn enable() -> bool {
        let Some(agent) = agent() else {
            return false;
        };
        let mut err: *mut AnyObject = std::ptr::null_mut();
        // -[SMAppService registerAndReturnError:]
        let ok: Bool = unsafe { msg_send![&*agent, registerAndReturnError: &mut err] };
        if !ok.as_bool() {
            // A registration error is the operator's problem, not the user's.
            eprintln!("login item: register failed");
            return false;
        }
        true
    }

    /// Turn it off. Returns true when it ends up not enabled.
    pub fn disable() -> bool {
        let Some(agent) = agent() else {
            return true;
        };
        let mut err: *mut AnyObject = std::ptr::null_mut();
        let _: Bool = unsafe { msg_send![&*agent, unregisterAndReturnError: &mut err] };
        !is_enabled()
    }

    /// Whether macOS currently has it enabled.
    pub fn is_enabled() -> bool {
        let Some(agent) = agent() else {
            return false;
        };
        let status: isize = unsafe { msg_send![&*agent, status] };
        status == STATUS_ENABLED
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    pub fn enable() -> bool {
        false
    }
    pub fn disable() -> bool {
        true
    }
    pub fn is_enabled() -> bool {
        false
    }
}

pub use imp::{disable, enable, is_enabled};

/// Remove the loose legacy agent the old builds wrote.
///
/// Run once on startup. `bootout` unloads the running job; deleting the file
/// stops it coming back at next login. Both are best-effort: on a fresh install
/// there is nothing here, and a machine that never had the old build simply
/// finds nothing to remove.
///
/// This is what actually clears the personal name from "Allow in the
/// Background" for people upgrading — registering the new agent alone would
/// leave the old entry sitting beside it.
#[cfg(target_os = "macos")]
pub fn remove_legacy_agent() {
    let Some(home) = std::env::var_os("HOME") else {
        return;
    };
    let path = std::path::PathBuf::from(home)
        .join("Library")
        .join("LaunchAgents")
        .join("Sidq.plist");

    if !path.exists() {
        return;
    }

    // gui/<uid> is the per-user launchd domain the loose agent lived in.
    // Ignoring the result on purpose: bootout fails harmlessly when the job is
    // not loaded, which is the common case, and the file removal below is what
    // actually stops it returning at next login.
    let uid = real_uid();
    let _ = std::process::Command::new("launchctl")
        .args(["bootout", &format!("gui/{uid}/Sidq")])
        .output();

    let _ = std::fs::remove_file(&path);
}

#[cfg(not(target_os = "macos"))]
pub fn remove_legacy_agent() {}

/// The real user id, without pulling in the libc crate for one call.
#[cfg(target_os = "macos")]
fn real_uid() -> u32 {
    extern "C" {
        fn getuid() -> u32;
    }
    // SAFETY: getuid takes no arguments, touches no memory, and cannot fail.
    unsafe { getuid() }
}
