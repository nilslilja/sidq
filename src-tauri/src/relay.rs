//! Relay: when Claude Code hits its limit, the work carries on in Codex.
//!
//! ── What it does ─────────────────────────────────────────────────────────────
//!
//! `wall` already notices the moment Claude Code stops for a usage limit, and
//! until now that produced a notification and an aimed picker: help, but still
//! a person deciding, choosing and pasting at the worst moment of their day.
//! With relay on, Sidq compiles the stopped conversation, writes it to a file,
//! and opens Codex in the same folder in Terminal with one instruction: read
//! that file and carry on. The next session is claimed into the same thread by
//! the indexer, so the conversation stays one conversation across both.
//!
//! ── Why it is off until turned on ────────────────────────────────────────────
//!
//! Everywhere else Sidq never presses send: it puts words in front of an
//! assistant and leaves the decision to the person. Relay starts an agent. It
//! is only ever the person's own Codex, in the person's own folder, under
//! Codex's own approval settings, and only after they switched it on here.
//!
//! Nothing is sent anywhere by Sidq. The handover is a file on this Mac.

use std::path::{Path, PathBuf};

/// The setting that turns relay on. Absent means off.
pub const SETTING: &str = "relay_to_codex";

pub fn enabled(conn: &rusqlite::Connection) -> bool {
    crate::index_store::setting(conn, SETTING).as_deref() == Some("on")
}

pub fn set(conn: &rusqlite::Connection, on: bool) -> Option<()> {
    crate::index_store::put_setting(conn, SETTING, if on { "on" } else { "off" })
}

/// Where Codex is. An app launched from the Dock inherits almost no PATH, so
/// the usual install locations are checked directly. `SIDQ_RELAY_AGENT`
/// overrides, which is how the relay is tested without starting a real agent.
pub fn agent() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("SIDQ_RELAY_AGENT") {
        return Some(PathBuf::from(p));
    }
    let home = crate::net::home();
    let mut candidates: Vec<PathBuf> = ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"]
        .iter()
        .map(PathBuf::from)
        .collect();
    if let Some(home) = home {
        for rel in [
            ".local/bin/codex",
            ".npm-global/bin/codex",
            ".bun/bin/codex",
            ".volta/bin/codex",
        ] {
            candidates.push(home.join(rel));
        }
    }
    candidates.into_iter().find(|p| p.is_file())
}

/// The one instruction the next agent starts with.
pub fn prompt_for(handover: &Path, title: &str) -> String {
    format!(
        "Claude Code hit its usage limit partway through \"{title}\". The whole conversation \
         is in {}. Read that file first, then carry on from where it stopped. Do not redo \
         work it finished; check the repository as it is now before changing anything.",
        handover.display()
    )
}

/// Single-quoted for zsh, with any single quote inside closed and reopened.
fn quoted(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

/// The script Terminal runs: go to the project, then become the agent.
pub fn script(project: &Path, agent: &Path, prompt: &str) -> String {
    format!(
        "#!/bin/zsh\ncd {} || exit 1\nexec {} {}\n",
        quoted(&project.to_string_lossy()),
        quoted(&agent.to_string_lossy()),
        quoted(prompt)
    )
}

/**
 * Write the handover and the script, then hand the script to `launch`.
 *
 * Returns the script's path when something was launched. `None` when there is
 * no agent, no project folder to continue in, or nothing to hand over, in which
 * case the caller falls back to the notification it always showed.
 */
pub fn start(
    dir: &Path,
    project: &Path,
    title: &str,
    handover: &str,
    agent: Option<&Path>,
    launch: impl Fn(&Path) -> bool,
) -> Option<PathBuf> {
    let agent = agent?;
    if handover.trim().is_empty() || !project.is_dir() {
        return None;
    }
    std::fs::create_dir_all(dir).ok()?;
    let stamp = crate::index_store::now_millis();
    let file = dir.join(format!("{stamp}.md"));
    std::fs::write(&file, handover).ok()?;

    let command = dir.join(format!("{stamp}.command"));
    std::fs::write(&command, script(project, agent, &prompt_for(&file, title))).ok()?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&command, std::fs::Permissions::from_mode(0o755)).ok()?;
    }
    launch(&command).then_some(command)
}

/// Where relay keeps its handovers: Sidq's own folder, never the person's repo.
pub fn folder() -> Option<PathBuf> {
    Some(crate::net::app_data()?.join("app.sidq.desktop/relay"))
}

/// Open a `.command` file in Terminal. `open` rather than AppleScript, so Sidq
/// needs no permission to control Terminal.
#[cfg(target_os = "macos")]
pub fn in_terminal(command: &Path) -> bool {
    std::process::Command::new("/usr/bin/open")
        .args(["-a", "Terminal"])
        .arg(command)
        .status()
        .is_ok_and(|s| s.success())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sidq-relay-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_script_goes_to_the_project_and_becomes_the_agent() {
        let s = script(
            Path::new("/work/my app"),
            Path::new("/opt/homebrew/bin/codex"),
            "go on",
        );
        assert_eq!(
            s,
            "#!/bin/zsh\ncd '/work/my app' || exit 1\nexec '/opt/homebrew/bin/codex' 'go on'\n"
        );
    }

    /// A title comes from the conversation, which the person or the model wrote.
    /// Nothing in it may escape the quotes and run.
    #[test]
    fn nothing_in_a_title_can_run_as_a_command() {
        let s = script(
            Path::new("/p"),
            Path::new("/c"),
            &prompt_for(Path::new("/h.md"), "it's'; rm -rf ~; '"),
        );
        let line = s.lines().nth(2).unwrap();
        assert!(line.starts_with("exec '/c' '"));
        assert!(line.contains(r"it'\''s'\''; rm -rf ~; '\''"));
        assert!(line.ends_with('\''));
    }

    #[test]
    fn the_agent_is_told_to_read_the_handover_first() {
        let p = prompt_for(Path::new("/x/relay/1.md"), "Checkout");
        assert!(
            p.contains("\"Checkout\"")
                && p.contains("/x/relay/1.md")
                && p.contains("Read that file first")
        );
    }

    #[test]
    fn a_relay_writes_the_handover_and_an_executable_script_then_launches_it() {
        let dir = scratch("launch");
        let project = scratch("project");
        let launched = std::cell::RefCell::new(None);
        let got = start(
            &dir,
            &project,
            "T",
            "the conversation",
            Some(Path::new("/c")),
            |p| {
                *launched.borrow_mut() = Some(p.to_path_buf());
                true
            },
        )
        .unwrap();
        assert_eq!(launched.borrow().as_ref(), Some(&got));
        let body = std::fs::read_to_string(&got).unwrap();
        let md = std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .find(|e| e.path().extension().is_some_and(|x| x == "md"))
            .unwrap();
        assert_eq!(
            std::fs::read_to_string(md.path()).unwrap(),
            "the conversation"
        );
        assert!(body.contains(&md.path().display().to_string()));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&got).unwrap().permissions().mode() & 0o111,
                0o111
            );
        }
    }

    #[test]
    fn with_no_agent_or_no_project_nothing_is_launched() {
        let dir = scratch("none");
        let project = scratch("p2");
        let never = |_: &Path| -> bool { panic!("must not launch") };
        assert!(start(&dir, &project, "T", "text", None, never).is_none());
        assert!(start(
            &dir,
            Path::new("/nonexistent/project"),
            "T",
            "text",
            Some(Path::new("/c")),
            never
        )
        .is_none());
        assert!(start(&dir, &project, "T", "  ", Some(Path::new("/c")), never).is_none());
    }

    /**
     * Opens a real Terminal window with a stand-in for Codex that records
     * where it ran and what it was told, then checks the record.
     *
     *   cargo test --lib real_relay -- --ignored --nocapture
     */
    #[test]
    #[ignore = "opens a Terminal window"]
    #[cfg(target_os = "macos")]
    fn real_relay() {
        let dir = scratch("real");
        let project = scratch("real-project");
        let marker = dir.join("agent-ran.txt");
        let agent = dir.join("fake-codex");
        std::fs::write(
            &agent,
            format!(
                "#!/bin/zsh\npwd > '{}'\nprint -r -- \"$1\" >> '{}'\nexit\n",
                marker.display(),
                marker.display()
            ),
        )
        .unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&agent, std::fs::Permissions::from_mode(0o755)).unwrap();

        let script = start(
            &dir,
            &project,
            "Checkout",
            "the whole conversation",
            Some(&agent),
            in_terminal,
        )
        .expect("launched");
        let waited = std::time::Instant::now();
        while !marker.exists() && waited.elapsed() < std::time::Duration::from_secs(20) {
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
        std::thread::sleep(std::time::Duration::from_millis(300));
        let record = std::fs::read_to_string(&marker).expect("the agent never ran");
        println!("script: {}\nrecord:\n{record}", script.display());
        let mut lines = record.lines();
        assert_eq!(
            lines
                .next()
                .map(std::path::PathBuf::from)
                .map(|p| p.canonicalize().unwrap()),
            Some(project.canonicalize().unwrap())
        );
        assert!(record.contains("Read that file first") && record.contains("\"Checkout\""));
    }

    #[test]
    fn it_is_off_until_turned_on() {
        let conn = crate::index_store::tests::memory();
        assert!(!enabled(&conn));
        set(&conn, true).unwrap();
        assert!(enabled(&conn));
        set(&conn, false).unwrap();
        assert!(!enabled(&conn));
    }
}
