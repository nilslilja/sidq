//! Launch-at-login, and getting the signer's name out of Login Items.
//!
//! ── Why not the autostart plugin ─────────────────────────────────────────────
//!
//! `MacosLauncher::LaunchAgent` writes a loose agent to
//! `~/Library/LaunchAgents/Sidq.plist`. macOS calls that a legacy agent and
//! attributes it to the code-signing team, so "Allow in the Background" shows
//! the certificate holder's personal name rather than the app. A user found
//! this with `sfltool dumpbtm`. The certificate is not the lever — the
//! registration method is.
//!
//! ── Why the main app, and not a bundled agent ────────────────────────────────
//!
//! The first attempt bundled an agent plist and registered it with
//! `agentServiceWithPlistName:`. That plist carried `RunAtLoad`, and launchd
//! honours `RunAtLoad` the moment the job is loaded — not only at login. So
//! registering it started a second copy of Sidq on the spot: two processes, two
//! launch cards stacked on screen, and a splash that appeared frozen because it
//! belonged to an app nobody knew was running.
//!
//! `SMAppService.mainAppService` is the right tool for "open this app at
//! login". It registers the bundle itself, needs no plist, and adding something
//! to the login-item list does not launch it — so the double-launch is not a
//! bug that was tuned out, it is a class of bug this approach does not have.
//!
//! ── Everything here fails soft ───────────────────────────────────────────────
//!
//! Launch-at-login is a convenience and never something the product depends on.
//! Every call returns a plain bool; a registration that fails leaves a working
//! app that simply does not open itself at login.

/// What macOS reports about the app's login-item registration.
#[cfg(target_os = "macos")]
mod imp {
    use objc2::msg_send;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject, Bool};
    use objc2_foundation::NSString;

    /// The agent registered by 0.1.73 and 0.1.74, kept only so it can be undone.
    const STALE_AGENT_PLIST: &str = "app.sidq.desktop.agent.plist";

    /// SMAppServiceStatus.enabled. Anything else is not on.
    const STATUS_ENABLED: isize = 1;

    fn class() -> Option<&'static AnyClass> {
        AnyClass::get(c"SMAppService")
    }

    /// `+[SMAppService mainAppService]` — the app itself as a login item.
    fn main_app() -> Option<Retained<AnyObject>> {
        let cls = class()?;
        let obj: *mut AnyObject = unsafe { msg_send![cls, mainAppService] };
        if obj.is_null() {
            return None;
        }
        // SAFETY: mainAppService returns a valid autoreleased SMAppService.
        unsafe { Retained::retain(obj) }
    }

    /// The bundled-agent service 0.1.73/0.1.74 registered, for unregistering.
    fn stale_agent() -> Option<Retained<AnyObject>> {
        let cls = class()?;
        let name = NSString::from_str(STALE_AGENT_PLIST);
        let obj: *mut AnyObject = unsafe { msg_send![cls, agentServiceWithPlistName: &*name] };
        if obj.is_null() {
            return None;
        }
        // SAFETY: as above.
        unsafe { Retained::retain(obj) }
    }

    pub fn enable() -> bool {
        let Some(svc) = main_app() else { return false };
        let mut err: *mut AnyObject = std::ptr::null_mut();
        let ok: Bool = unsafe { msg_send![&*svc, registerAndReturnError: &mut err] };
        ok.as_bool()
    }

    pub fn disable() -> bool {
        let Some(svc) = main_app() else { return true };
        let mut err: *mut AnyObject = std::ptr::null_mut();
        let _: Bool = unsafe { msg_send![&*svc, unregisterAndReturnError: &mut err] };
        !is_enabled()
    }

    pub fn is_enabled() -> bool {
        let Some(svc) = main_app() else { return false };
        let status: isize = unsafe { msg_send![&*svc, status] };
        status == STATUS_ENABLED
    }

    /// Undo the bundled-agent registration that 0.1.73 and 0.1.74 created.
    ///
    /// Without this, anyone who installed those two keeps a registered agent
    /// with `RunAtLoad` set, and keeps getting a second copy of Sidq at login.
    pub fn unregister_stale_agent() {
        let Some(svc) = stale_agent() else { return };
        let mut err: *mut AnyObject = std::ptr::null_mut();
        let _: Bool = unsafe { msg_send![&*svc, unregisterAndReturnError: &mut err] };
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
    pub fn unregister_stale_agent() {}
}

pub use imp::{disable, enable, is_enabled, unregister_stale_agent};

/// Delete the loose legacy agent older builds wrote, and unload it.
///
/// This is the part that actually clears the signer's name from "Allow in the
/// Background" on an upgrade: registering the app properly adds a good entry,
/// but the old loose one sits there beside it until it is removed.
///
/// Shells out, so never call it on the setup thread.
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

    // bootout fails harmlessly when the job is not loaded; removing the file is
    // what stops it coming back at next login.
    let _ = std::process::Command::new("launchctl")
        .args(["bootout", &format!("gui/{}/Sidq", real_uid())])
        .output();
    let _ = std::fs::remove_file(&path);
}

#[cfg(not(target_os = "macos"))]
pub fn remove_legacy_agent() {}

#[cfg(target_os = "macos")]
fn real_uid() -> u32 {
    extern "C" {
        fn getuid() -> u32;
    }
    // SAFETY: getuid takes no arguments, touches no memory, and cannot fail.
    unsafe { getuid() }
}
