//! Recall: Claude Code already knowing what was said elsewhere, before it answers.
//!
//! ── What it does ─────────────────────────────────────────────────────────────
//!
//! Every Sidq feature before this waited for a press: open the pill, pick a
//! conversation, paste. Recall has none. Claude Code runs a hook each time the
//! person sends a message; Sidq answers it with the few turns from their other
//! conversations (Cursor, ChatGPT, last week's Claude Code session) that are
//! about the same thing, quoted, and Claude reads them before replying. When
//! nothing clears the bar in `semantic::RECALL_MIN`, it adds nothing at all.
//!
//! ── What it promises ─────────────────────────────────────────────────────────
//!
//! Found on the Mac by the on-device model, from the local index. Sidq sends
//! nothing anywhere; the text goes to Claude Code, which is where the person
//! was already typing. Off until the person turns it on, and turning it off
//! removes exactly the entry Sidq added and nothing else in their settings.
//!
//! A hook that fails must never cost somebody their message, so every failure
//! here is silence: no output, exit 0, the prompt goes through untouched.

use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use crate::embed::Embedder;
use crate::semantic::{self, Passage};

/// The first line of every recall. Also in `profile::INJECTED_MARKERS`, so a
/// recall that ends up in a transcript is never indexed as something said.
pub const RECALL_HEADER: &str =
    "Sidq recalled this from the person's own past conversations with assistants";

/// Turns handed to Claude per message. Three is a few hundred words: enough to
/// carry a decision, too little to crowd out the message itself.
const RECALL_LIMIT: usize = 3;

/// Seconds Claude Code waits for the hook. Recall takes well under one; this is
/// the ceiling for a first run that has to load the model.
const HOOK_TIMEOUT: u64 = 10;

/// What Claude reads. `None` when there is nothing worth saying.
pub fn recall_context(found: &[Passage]) -> Option<String> {
    if found.is_empty() {
        return None;
    }
    let mut out = format!(
        "{RECALL_HEADER}, found on their Mac because they are about what they just asked. \
         Quoted, not summarised. Use them only if they bear on the message, and say so when \
         you rely on one.\n"
    );
    for p in found {
        let assistant = crate::sources::label(&p.source).unwrap_or(p.source.as_str());
        let who = if p.role == "You" {
            "they said"
        } else {
            "the assistant said"
        };
        out.push_str(&format!(
            "\n- {assistant}, {}, {who}:\n  \"{}\"\n",
            semantic::day_label(p.ended_at),
            p.excerpt.replace('\n', " ")
        ));
    }
    Some(out)
}

/// Claude Code's shape for adding context to a prompt.
pub fn hook_output(context: &str) -> Value {
    json!({
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": context
        }
    })
}

/**
 * Answer one UserPromptSubmit hook. `input` is the JSON Claude Code writes to
 * stdin; the return value is what to write to stdout, if anything.
 *
 * Reads `user_prompt`, and `prompt` as older versions called it.
 */
pub fn run_recall(
    input: &str,
    conn: Option<&rusqlite::Connection>,
    model: Option<&Embedder>,
) -> Option<String> {
    let event: Value = serde_json::from_str(input).ok()?;
    let prompt = event
        .get("user_prompt")
        .or_else(|| event.get("prompt"))
        .and_then(Value::as_str)?;
    let project = event.get("cwd").and_then(Value::as_str);
    let session = event.get("session_id").and_then(Value::as_str);

    let found = semantic::recall(conn?, model?, prompt, project, session, RECALL_LIMIT);
    let context = recall_context(&found)?;
    Some(hook_output(&context).to_string())
}

/// Claude Code's user settings, where hooks live.
fn settings_path() -> Option<PathBuf> {
    Some(crate::net::home()?.join(".claude/settings.json"))
}

/// The command Claude Code runs. Shell form with the path quoted, because the
/// exec form's `args` field is newer than some installs, and an install that
/// ignored it would start the MCP server instead and hang every prompt.
pub fn command_for(binary: &Path) -> String {
    let path = binary.to_string_lossy().replace('\'', r"'\''");
    format!("'{path}' hook recall")
}

/// Whether a hook entry is Sidq's recall, whatever path it was installed from.
fn is_ours(hook: &Value) -> bool {
    hook.get("command")
        .and_then(Value::as_str)
        .is_some_and(|c| c.contains("sidq-mcp") && c.ends_with("hook recall"))
}

/// Settings with Sidq's recall hook present exactly once. `None` when the file
/// is not the shape Claude Code writes, which is left for its owner to fix.
pub fn with_recall(root: Value, command: &str) -> Option<Value> {
    let mut root = without_recall(root);
    let hooks = root
        .as_object_mut()?
        .entry("hooks")
        .or_insert_with(|| json!({}))
        .as_object_mut()?;
    hooks
        .entry("UserPromptSubmit")
        .or_insert_with(|| json!([]))
        .as_array_mut()?
        .push(json!({
            "hooks": [{ "type": "command", "command": command, "timeout": HOOK_TIMEOUT }]
        }));
    Some(root)
}

/// Settings with every Sidq recall hook removed, and any list or map that only
/// Sidq's entry was holding open removed with it. Everything else untouched.
pub fn without_recall(mut root: Value) -> Value {
    let Some(hooks) = root.get_mut("hooks").and_then(Value::as_object_mut) else {
        return root;
    };
    if let Some(groups) = hooks
        .get_mut("UserPromptSubmit")
        .and_then(Value::as_array_mut)
    {
        for group in groups.iter_mut() {
            if let Some(inner) = group.get_mut("hooks").and_then(Value::as_array_mut) {
                inner.retain(|h| !is_ours(h));
            }
        }
        groups.retain(|g| {
            g.get("hooks")
                .and_then(Value::as_array)
                .map_or(true, |inner| !inner.is_empty())
        });
        if groups.is_empty() {
            hooks.remove("UserPromptSubmit");
        }
    }
    if hooks.is_empty() {
        if let Some(map) = root.as_object_mut() {
            map.remove("hooks");
        }
    }
    root
}

pub fn has_recall(root: &Value) -> bool {
    root.pointer("/hooks/UserPromptSubmit")
        .and_then(Value::as_array)
        .is_some_and(|groups| {
            groups.iter().any(|g| {
                g.get("hooks")
                    .and_then(Value::as_array)
                    .is_some_and(|inner| inner.iter().any(is_ours))
            })
        })
}

fn read_settings(path: &Path) -> Option<Value> {
    match std::fs::read_to_string(path) {
        Ok(text) if !text.trim().is_empty() => serde_json::from_str(&text).ok(),
        Ok(_) => Some(json!({})),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Some(json!({})),
        Err(_) => None,
    }
}

fn write_settings(path: &Path, root: &Value) -> Option<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).ok()?;
    }
    std::fs::write(path, serde_json::to_string_pretty(root).ok()? + "\n").ok()
}

/// Turn recall on for Claude Code. Returns the file written.
pub fn install_recall(binary: &Path) -> Option<PathBuf> {
    let path = settings_path()?;
    let root = read_settings(&path)?;
    if !root.is_object() {
        return None;
    }
    write_settings(&path, &with_recall(root, &command_for(binary))?)?;
    Some(path)
}

/// Turn recall off. Leaves the file alone if Sidq's hook was never in it.
pub fn remove_recall() -> Option<()> {
    let path = settings_path()?;
    let root = read_settings(&path)?;
    if !has_recall(&root) {
        return Some(());
    }
    write_settings(&path, &without_recall(root))
}

pub fn recall_installed() -> bool {
    settings_path()
        .and_then(|p| read_settings(&p))
        .is_some_and(|root| has_recall(&root))
}

#[cfg(test)]
mod tests {
    use super::*;

    const BIN: &str = "/Applications/Sidq.app/Contents/MacOS/sidq-mcp";

    fn installed(root: Value) -> Value {
        with_recall(root, &command_for(Path::new(BIN))).unwrap()
    }

    #[test]
    fn turning_it_on_keeps_every_other_setting_and_hook() {
        let before = json!({
            "theme": "dark",
            "hooks": {
                "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "~/lint.sh" }] }],
                "Stop": [{ "hooks": [{ "type": "command", "command": "say done" }] }]
            }
        });
        let after = installed(before);
        assert_eq!(after["theme"], "dark");
        assert_eq!(after["hooks"]["Stop"][0]["hooks"][0]["command"], "say done");
        let groups = after["hooks"]["UserPromptSubmit"].as_array().unwrap();
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0]["hooks"][0]["command"], "~/lint.sh");
        assert!(has_recall(&after));
    }

    #[test]
    fn turning_it_on_twice_installs_it_once() {
        let twice = installed(installed(json!({})));
        assert_eq!(
            twice["hooks"]["UserPromptSubmit"].as_array().unwrap().len(),
            1
        );
    }

    #[test]
    fn turning_it_off_leaves_exactly_what_was_there_before() {
        let before = json!({
            "theme": "dark",
            "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "say done" }] }] }
        });
        assert_eq!(without_recall(installed(before.clone())), before);
        assert_eq!(without_recall(installed(json!({}))), json!({}));
    }

    /// A settings file that is not an object is somebody's mistake to fix, not
    /// ours to overwrite.
    #[test]
    fn a_settings_file_of_the_wrong_shape_is_left_alone() {
        assert!(with_recall(json!([1, 2]), "x hook recall").is_none());
    }

    #[test]
    fn the_command_survives_a_path_with_spaces_and_quotes() {
        let cmd = command_for(Path::new(
            "/Users/o'neil/My Apps/Sidq.app/Contents/MacOS/sidq-mcp",
        ));
        assert_eq!(
            cmd,
            r"'/Users/o'\''neil/My Apps/Sidq.app/Contents/MacOS/sidq-mcp' hook recall"
        );
        assert!(is_ours(&json!({ "command": cmd })));
    }

    #[test]
    fn what_claude_reads_is_marked_as_machinery_so_it_is_never_indexed_as_speech() {
        let p = Passage {
            session_id: "s".into(),
            source: "cursor".into(),
            title: "t".into(),
            project: "p".into(),
            project_path: "/p".into(),
            ended_at: 1_790_356_615_000,
            role: "You".into(),
            ord: 0,
            excerpt: "use pnpm, never npm".into(),
        };
        let text = recall_context(&[p]).unwrap();
        assert!(text.contains("Cursor, 25 Sep 2026, they said"));
        assert!(text.contains("\"use pnpm, never npm\""));
        assert!(crate::profile::is_injected(&text));
        assert!(recall_context(&[]).is_none());
    }

    #[test]
    fn a_hook_with_nothing_to_say_or_bad_input_says_nothing() {
        assert_eq!(run_recall("not json", None, None), None);
        assert_eq!(
            run_recall(r#"{"user_prompt":"hello there friend"}"#, None, None),
            None
        );
    }

    #[test]
    fn the_hook_answers_in_claude_codes_shape() {
        let out = hook_output("ctx");
        assert_eq!(
            out["hookSpecificOutput"]["hookEventName"],
            "UserPromptSubmit"
        );
        assert_eq!(out["hookSpecificOutput"]["additionalContext"], "ctx");
    }
}
