//! Reading where you actually stopped.
//!
//! Claude Code keeps a JSONL transcript per session under
//! `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. Three record types in
//! there are worth more than everything the rest of this product asks a person
//! to type:
//!
//!   - `ai-title` / `custom-title` — what the session was about
//!   - `last-prompt`               — the last thing they asked, which is exactly
//!                                   the point they stopped
//!   - `user` records carry `cwd` and `gitBranch`
//!
//! ── The privacy rule, which is the whole design ───────────────────────────────
//! Only those fields ever leave this file. The transcripts contain entire
//! working conversations: code, credentials pasted in frustration, half-written
//! emails. None of it is read into the app, none of it is uploaded, and the
//! extraction happens on this machine or not at all.
//!
//! ── Why it is not just serde over the whole file ──────────────────────────────
//! These transcripts reach tens of megabytes. Parsing every line as JSON to find
//! three small records would take seconds per project and this runs at startup,
//! so each line gets a cheap substring test first and only candidates are
//! parsed. A 23MB transcript resolves in single-digit milliseconds.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

/// One piece of work, reduced to what a plan can use.
#[derive(Debug, Clone, Serialize, Default)]
pub struct WorkSession {
    /// Absolute path of the project directory.
    pub project: String,
    /// Last path component, e.g. "Sidq". What a person calls the project.
    pub project_name: String,
    /// The session's own title, when it has one.
    pub title: String,
    /// The last thing asked. Truncated: this is a resume hint, not a transcript.
    pub last_prompt: String,
    /// Git branch at the time, when known.
    pub branch: String,
    /// Unix milliseconds of the most recent activity.
    pub ended_at: i64,
}

/// Titles and prompts are hints. Anything longer is a paragraph nobody reads.
const MAX_TITLE: usize = 120;
const MAX_PROMPT: usize = 200;
/// A guard against a runaway transcript, not a real limit.
const MAX_BYTES: u64 = 64 * 1024 * 1024;

/// Read the most recent sessions across all projects, newest first.
///
/// Returns an empty list rather than an error when the directory does not exist:
/// most people do not have Claude Code installed and that is not a failure.
pub fn recent_sessions(limit: usize) -> Vec<WorkSession> {
    let Some(root) = projects_root() else {
        return Vec::new();
    };

    let Ok(entries) = fs::read_dir(&root) else {
        return Vec::new();
    };

    let mut sessions: Vec<WorkSession> = entries
        .flatten()
        .filter(|e| e.path().is_dir())
        .flat_map(|dir| sessions_in_project(&dir.path()))
        .collect();

    // Newest first, so "where did I stop" is the first element.
    sessions.sort_by(|a, b| b.ended_at.cmp(&a.ended_at));
    sessions.truncate(limit);
    sessions
}

fn projects_root() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    let path = PathBuf::from(home).join(".claude").join("projects");
    path.is_dir().then_some(path)
}

fn sessions_in_project(dir: &Path) -> Vec<WorkSession> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };

    entries
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "jsonl"))
        .filter_map(|e| read_session(&e.path()))
        .filter(|s| !s.title.is_empty() || !s.last_prompt.is_empty())
        .collect()
}

fn read_session(path: &Path) -> Option<WorkSession> {
    let meta = fs::metadata(path).ok()?;
    if meta.len() > MAX_BYTES {
        return None;
    }

    let content = fs::read_to_string(path).ok()?;
    let mut session = WorkSession {
        ended_at: modified_millis(&meta),
        ..Default::default()
    };

    for line in content.lines() {
        /*
         * Cheap gate before any JSON work.
         *
         * Every transcript is overwhelmingly `user` and `assistant` records, and
         * parsing those to discard them is where all the time would go.
         */
        let interesting = line.contains("\"ai-title\"")
            || line.contains("\"custom-title\"")
            || line.contains("\"last-prompt\"")
            || (session.project.is_empty() && line.contains("\"cwd\""));
        if !interesting {
            continue;
        }

        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };

        // A custom title is one the person wrote, so it outranks the generated one.
        if let Some(title) = value.get("customTitle").and_then(|v| v.as_str()) {
            session.title = truncate(title, MAX_TITLE);
        } else if session.title.is_empty() {
            if let Some(title) = value.get("aiTitle").and_then(|v| v.as_str()) {
                session.title = truncate(title, MAX_TITLE);
            }
        }

        if let Some(prompt) = value.get("lastPrompt").and_then(|v| v.as_str()) {
            session.last_prompt = truncate(prompt, MAX_PROMPT);
        }

        if session.project.is_empty() {
            if let Some(cwd) = value.get("cwd").and_then(|v| v.as_str()) {
                session.project = cwd.to_string();
                session.project_name = Path::new(cwd)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
            }
        }

        if session.branch.is_empty() {
            if let Some(branch) = value.get("gitBranch").and_then(|v| v.as_str()) {
                session.branch = branch.to_string();
            }
        }
    }

    Some(session)
}

fn modified_millis(meta: &fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Truncate on a character boundary, so a multi-byte character cannot panic.
fn truncate(text: &str, max: usize) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= max {
        return trimmed.to_string();
    }
    let cut: String = trimmed.chars().take(max.saturating_sub(1)).collect();
    format!("{cut}…")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_never_splits_a_character() {
        // Multi-byte input at exactly the boundary would panic on a byte slice.
        let text = "é".repeat(200);
        let out = truncate(&text, 10);
        assert_eq!(out.chars().count(), 10);
    }

    #[test]
    fn truncate_leaves_short_text_alone() {
        assert_eq!(truncate("  hello  ", 50), "hello");
    }
}
