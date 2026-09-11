//! Connecting Sidq to an assistant, without anybody editing JSON by hand.
//!
//! ── Why this is code and not a documentation page ────────────────────────────
//!
//! The instruction "add this block to
//! ~/Library/Application Support/Claude/claude_desktop_config.json" is four
//! things a person can get wrong: finding a file inside a hidden folder, editing
//! JSON without a validator, merging into a key that may or may not exist, and
//! not breaking the config they already have for other servers.
//!
//! Every one of those failures looks identical from the outside — the server
//! does not appear — and the person's conclusion is that Sidq is broken. So the
//! app does it, and the only thing asked of anybody is restarting the client.
//!
//! ── The rule this file follows ───────────────────────────────────────────────
//!
//! Never overwrite a config. Read it, add one key under `mcpServers`, write it
//! back with everything else intact. Somebody with four MCP servers configured
//! is exactly the person most likely to try this, and losing their setup to a
//! convenience button is worse than making them edit the file.

use std::path::PathBuf;

/// The key Sidq claims inside `mcpServers`. Stable, so re-running replaces.
const SERVER_KEY: &str = "sidq";

/// A client that reads a JSON config with an `mcpServers` object in it.
pub struct Client {
    pub id: &'static str,
    pub label: &'static str,
    /// Relative to `anchor`, never absolute.
    path: &'static str,
    /// Which directory `path` hangs off.
    anchor: Anchor,
}

/**
 * Where a client's config lives, said in a way that is true on every platform.
 *
 * "Library/Application Support/Claude" is macOS's answer to a question Windows
 * answers with AppData and Linux with .local/share. Writing the macOS answer
 * into a constant meant this list was correct on exactly one platform, and
 * silently wrong on the others — the connect button would write a config file
 * to a path nothing reads.
 */
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Anchor {
    /// Dotfiles, which sit in the home directory on every platform.
    Home,
    /// Per-user application data, wherever this platform keeps it.
    AppData,
}

pub const CLIENTS: [Client; 3] = [
    Client {
        id: "claude-desktop",
        label: "Claude Desktop",
        path: "Claude/claude_desktop_config.json",
        anchor: Anchor::AppData,
    },
    // Dotfiles, and the same place on every platform.
    Client {
        id: "claude-code",
        label: "Claude Code",
        path: ".claude.json",
        anchor: Anchor::Home,
    },
    Client {
        id: "cursor",
        label: "Cursor",
        path: ".cursor/mcp.json",
        anchor: Anchor::Home,
    },
];

/// Where this client keeps its config on this machine.
fn config_path(client: &Client) -> Option<PathBuf> {
    let root = match client.anchor {
        Anchor::Home => home()?,
        Anchor::AppData => crate::net::app_data()?,
    };
    Some(root.join(client.path))
}

fn home() -> Option<PathBuf> {
    crate::net::home()
}

/**
 * Where the sidecar is, as the client will have to spawn it.
 *
 * Tauri's `externalBin` puts it in `Contents/MacOS` beside the app binary, so
 * this is derived from the running executable rather than assumed to be in
 * /Applications — plenty of people run an app straight from the disk image or
 * out of a Developer folder, and a hardcoded path is wrong for all of them.
 *
 * During `tauri dev` there is no bundle, and the sibling is the debug build of
 * the same binary, which is the right thing to point at anyway.
 */
pub fn sidecar() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let beside = exe.parent()?.join("sidq-mcp");
    beside.exists().then_some(beside)
}

/// The block a client needs, as it will appear in their config.
pub fn config_block(binary: &std::path::Path) -> serde_json::Value {
    serde_json::json!({ "command": binary.to_string_lossy(), "args": [] })
}

/// Whether a client's config file exists, so the UI can offer only real ones.
pub fn installed(client: &Client) -> bool {
    config_path(client).is_some_and(|p| p.exists())
}

/**
 * Add Sidq to one client's config, keeping everything already in it.
 *
 * Returns the file written, or `None` if there was nothing to write into or the
 * existing file is not JSON we should touch. A config that fails to parse is
 * left completely alone: it is somebody's working setup with a syntax error in
 * it, and rewriting it from scratch would destroy the thing they are about to
 * fix.
 */
pub fn connect(client: &Client) -> Option<PathBuf> {
    let binary = sidecar()?;
    let path = config_path(client)?;

    let mut root: serde_json::Value = match std::fs::read_to_string(&path) {
        Ok(existing) if !existing.trim().is_empty() => serde_json::from_str(&existing).ok()?,
        // No file yet is fine and common — Claude Code writes ~/.claude.json
        // only once something has been configured. A missing directory is not.
        _ => serde_json::json!({}),
    };

    if !root.is_object() {
        return None;
    }

    root.as_object_mut()?
        .entry("mcpServers")
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()?
        .insert(SERVER_KEY.to_string(), config_block(&binary));

    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).ok()?;
    }
    std::fs::write(&path, serde_json::to_string_pretty(&root).ok()? + "\n").ok()?;
    Some(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// `connect` against a config that is already there, without touching $HOME.
    fn merge_into(existing: Option<&str>) -> serde_json::Value {
        let mut root: serde_json::Value = match existing {
            Some(s) if !s.trim().is_empty() => serde_json::from_str(s).unwrap(),
            _ => json!({}),
        };
        root.as_object_mut()
            .unwrap()
            .entry("mcpServers")
            .or_insert_with(|| json!({}))
            .as_object_mut()
            .unwrap()
            .insert(
                SERVER_KEY.to_string(),
                config_block(std::path::Path::new("/x/sidq-mcp")),
            );
        root
    }

    #[test]
    fn it_keeps_every_other_server_already_configured() {
        /*
         * The failure that would matter most. Somebody with four MCP servers is
         * the person most likely to press this button, and a convenience that
         * eats their setup is worse than making them edit the file themselves.
         */
        let before =
            r#"{"mcpServers":{"github":{"command":"gh-mcp"},"postgres":{"command":"pg"}}}"#;
        let after = merge_into(Some(before));
        let servers = after["mcpServers"].as_object().unwrap();

        assert_eq!(servers.len(), 3);
        assert_eq!(servers["github"]["command"], "gh-mcp");
        assert_eq!(servers["postgres"]["command"], "pg");
        assert_eq!(servers["sidq"]["command"], "/x/sidq-mcp");
    }

    #[test]
    fn it_keeps_keys_that_have_nothing_to_do_with_mcp() {
        // ~/.claude.json holds far more than MCP servers. Rewriting it as a
        // config with one key in it would wipe somebody's whole setup.
        let before = r#"{"theme":"dark","projects":{"/a":{"allowedTools":[]}},"mcpServers":{}}"#;
        let after = merge_into(Some(before));

        assert_eq!(after["theme"], "dark");
        assert!(after["projects"]["/a"].is_object());
        assert_eq!(after["mcpServers"]["sidq"]["command"], "/x/sidq-mcp");
    }

    #[test]
    fn running_it_twice_leaves_one_entry_rather_than_two() {
        let once = merge_into(Some(&merge_into(None).to_string()));
        assert_eq!(once["mcpServers"].as_object().unwrap().len(), 1);
    }

    #[test]
    fn an_empty_or_missing_config_still_gets_a_valid_one() {
        for start in [None, Some(""), Some("   ")] {
            let after = merge_into(start);
            assert_eq!(after["mcpServers"]["sidq"]["command"], "/x/sidq-mcp");
        }
    }

    #[test]
    fn the_block_is_shaped_the_way_a_client_expects() {
        let block = config_block(std::path::Path::new(
            "/Applications/Sidq.app/Contents/MacOS/sidq-mcp",
        ));
        assert!(block["command"].as_str().unwrap().ends_with("sidq-mcp"));
        assert!(block["args"].is_array());
    }

    #[test]
    fn every_client_path_is_relative_to_home() {
        // An absolute path here would join away the home directory entirely and
        // write into somebody's filesystem root.
        for client in &CLIENTS {
            assert!(
                !client.path.starts_with('/'),
                "{} has an absolute path",
                client.id
            );
        }
    }
}
