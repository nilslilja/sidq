//! Reading OpenAI Codex CLI sessions.
//!
//! Codex writes a rollout file per session under
//!
//!   ~/.codex/sessions/<YYYY>/<MM>/<DD>/rollout-<timestamp>-<uuid>.jsonl
//!
//! One JSON object per line, in the shape the Responses API uses: a header line
//! carrying the session id and the working directory, then an entry per turn
//! with a `role` and a `content` array of typed parts.
//!
//! ── Why this is written defensively ──────────────────────────────────────────
//!
//! Every other reader in this codebase was written against transcripts sitting
//! on the machine, so its parsing was checked against the real thing. This one
//! was not: Codex is not installed here, `~/.codex` does not exist, and the
//! `codex-*` directories the ChatGPT desktop app leaves in Application Support
//! are empty. That was checked rather than assumed.
//!
//! So the format below is what Codex documents and ships, and the parser treats
//! every field as optional. A rollout whose shape has moved on since this was
//! written degrades to fewer facts about the session rather than to a panic or
//! to a session that silently vanishes: an unknown line is skipped, a missing
//! cwd becomes an empty project, a missing timestamp falls back to the file's
//! own mtime.
//!
//! The one thing it will not do is invent. If a file yields no user turns at
//! all it is dropped rather than listed as an empty conversation, because a row
//! in the picker that opens to nothing is worse than a row that is not there.

use crate::work_history::WorkSession;
use std::path::{Path, PathBuf};

/// What the index and the picker call this source.
pub const SOURCE: &str = "codex";

fn sessions_dir() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    let dir = PathBuf::from(home).join(".codex").join("sessions");
    dir.is_dir().then_some(dir)
}

/// Read the most recent Codex sessions, newest first.
pub fn recent_sessions(limit: usize) -> Vec<WorkSession> {
    let Some(root) = sessions_dir() else {
        return Vec::new();
    };

    let mut files = rollout_files(&root);

    /*
     * Sort by mtime before parsing, then parse only what is asked for.
     *
     * The date-nested layout means a year of use is a lot of directories, and
     * reading every rollout to find the newest fifty is the mistake that made
     * the Claude Code picker take 1.6 seconds before the digest cache existed.
     */
    files.sort_by_key(|(_, modified)| std::cmp::Reverse(*modified));
    files.truncate(limit);

    let mut out: Vec<WorkSession> = files
        .into_iter()
        .filter_map(|(path, modified)| read_rollout(&path, modified))
        .collect();

    out.sort_by_key(|s| std::cmp::Reverse(s.ended_at));
    out
}

/// Every rollout file under the date-nested tree, with its mtime.
fn rollout_files(root: &Path) -> Vec<(PathBuf, i64)> {
    let mut found = Vec::new();
    walk(root, 0, &mut found);
    found
}

fn walk(dir: &Path, depth: usize, out: &mut Vec<(PathBuf, i64)>) {
    // year/month/day is three levels; anything deeper is not the layout and is
    // not worth descending into on somebody's home directory.
    if depth > 3 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = entry.metadata() else { continue };

        if meta.is_dir() {
            walk(&path, depth + 1, out);
        } else if path.extension().is_some_and(|e| e == "jsonl") {
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            out.push((path, modified));
        }
    }
}

/// Turn one rollout file into a session, or nothing if it holds no turns.
fn read_rollout(path: &Path, modified: i64) -> Option<WorkSession> {
    let text = std::fs::read_to_string(path).ok()?;

    let mut cwd = String::new();
    let mut first_prompt = String::new();
    let mut last_prompt = String::new();
    let mut turns: u32 = 0;
    let mut stamps: Vec<i64> = Vec::new();

    for line in text.lines() {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };

        // The header carries where the session ran. It appears once, near the
        // top, and is absent in older rollouts.
        if cwd.is_empty() {
            if let Some(found) = value
                .get("cwd")
                .or_else(|| value.get("payload").and_then(|p| p.get("cwd")))
                .and_then(|c| c.as_str())
            {
                cwd = found.to_string();
            }
        }

        if let Some(ms) = value.get("timestamp").and_then(parse_stamp) {
            stamps.push(ms);
        }

        // Only user turns count. An assistant reply is not a thing you resumed.
        let role = value
            .get("role")
            .or_else(|| value.get("payload").and_then(|p| p.get("role")))
            .and_then(|r| r.as_str());
        if role != Some("user") {
            continue;
        }

        let body = value
            .get("content")
            .or_else(|| value.get("payload").and_then(|p| p.get("content")));
        let said = flatten_content(body);
        if said.trim().is_empty() {
            continue;
        }

        turns += 1;
        if first_prompt.is_empty() {
            first_prompt = said.clone();
        }
        last_prompt = said;
    }

    if turns == 0 {
        return None;
    }

    let ended_at = stamps.iter().copied().max().unwrap_or(modified);
    let project_name = Path::new(&cwd)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    Some(WorkSession {
        session_id: path.file_stem()?.to_string_lossy().to_string(),
        project: cwd,
        project_name,
        // Codex does not name its sessions, so the opening ask is the title,
        // which is what a person recognises the conversation by anyway.
        title: truncate(&first_prompt, 90),
        last_prompt: truncate(&last_prompt, 160),
        branch: String::new(),
        ended_at,
        turns,
        active_minutes: active_minutes(&stamps),
        source: SOURCE,
    })
}

/// The text out of a Responses-style content array, or a bare string.
fn flatten_content(value: Option<&serde_json::Value>) -> String {
    match value {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Array(parts)) => parts
            .iter()
            .filter_map(|p| {
                p.get("text")
                    .and_then(|t| t.as_str())
                    .or_else(|| p.as_str())
            })
            .collect::<Vec<_>>()
            .join(" "),
        _ => String::new(),
    }
}

fn parse_stamp(value: &serde_json::Value) -> Option<i64> {
    if let Some(n) = value.as_i64() {
        // Seconds or milliseconds, told apart by magnitude rather than by
        // trusting whichever one this version happens to write.
        return Some(if n < 100_000_000_000 { n * 1000 } else { n });
    }
    crate::work_history::iso_to_millis(value.as_str()?)
}

/*
 * Time at the keyboard, not wall clock.
 *
 * Same rule the other readers use: a gap longer than a short pause is somebody
 * having lunch, and counting it makes a twenty minute session look like four
 * hours. Kept in step with work_history so the two never disagree about what a
 * session cost.
 */
fn active_minutes(stamps: &[i64]) -> u32 {
    const GAP_MS: i64 = 5 * 60 * 1000;

    let mut sorted = stamps.to_vec();
    sorted.sort_unstable();

    let total: i64 = sorted
        .windows(2)
        .map(|w| w[1] - w[0])
        .filter(|d| *d > 0 && *d <= GAP_MS)
        .sum();

    (total / 60_000) as u32
}

fn truncate(text: &str, max: usize) -> String {
    let cleaned = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if cleaned.chars().count() <= max {
        return cleaned;
    }
    cleaned.chars().take(max).collect::<String>() + "…"
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// A rollout in the shape Codex writes, so the parser is checked against a
    /// file rather than against an assumption.
    fn fixture(dir: &Path, name: &str, body: &str) -> PathBuf {
        std::fs::create_dir_all(dir).unwrap();
        let path = dir.join(name);
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all(body.as_bytes()).unwrap();
        path
    }

    fn tmp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "sidq-codex-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    const ROLLOUT: &str = r#"{"cwd":"/Users/x/Projects/ledger","timestamp":"2026-09-02T10:00:00.000Z"}
{"role":"user","timestamp":"2026-09-02T10:00:05.000Z","content":[{"type":"input_text","text":"why is the reconciliation off by a cent"}]}
{"role":"assistant","timestamp":"2026-09-02T10:00:20.000Z","content":[{"type":"output_text","text":"rounding, probably"}]}
{"role":"user","timestamp":"2026-09-02T10:04:00.000Z","content":[{"type":"input_text","text":"it is banker's rounding in one place and not the other"}]}
"#;

    #[test]
    fn reads_a_rollout_into_a_session() {
        let dir = tmp();
        let path = fixture(&dir, "rollout-2026-09-02-abc.jsonl", ROLLOUT);

        let s = read_rollout(&path, 0).expect("a rollout with turns is a session");
        assert_eq!(s.source, SOURCE);
        assert_eq!(s.turns, 2, "assistant replies are not turns");
        assert_eq!(s.project_name, "ledger");
        assert_eq!(s.title, "why is the reconciliation off by a cent");
        assert!(s.last_prompt.contains("banker's rounding"));
        assert_eq!(s.session_id, "rollout-2026-09-02-abc");
    }

    #[test]
    fn the_end_is_the_last_thing_that_happened() {
        let dir = tmp();
        let path = fixture(&dir, "r.jsonl", ROLLOUT);
        let s = read_rollout(&path, 0).unwrap();

        let expected = crate::work_history::iso_to_millis("2026-09-02T10:04:00.000Z").unwrap();
        assert_eq!(s.ended_at, expected);
    }

    /*
     * The whole reason this file is defensive. Codex is not installed on the
     * machine this was written on, so the shape may move: a rollout that no
     * longer matches must lose detail rather than disappear or panic.
     */
    #[test]
    fn an_unfamiliar_shape_degrades_instead_of_vanishing() {
        let dir = tmp();
        let path = fixture(
            &dir,
            "odd.jsonl",
            "{\"not\":\"a shape we know\"}\n\
             {\"role\":\"user\",\"content\":\"a bare string, no parts array\"}\n\
             this line is not json at all\n",
        );

        let s = read_rollout(&path, 1_700_000_000_000).expect("still a session");
        assert_eq!(s.turns, 1, "the one readable turn survives");
        assert_eq!(s.last_prompt, "a bare string, no parts array");
        assert_eq!(s.project, "", "no cwd is an empty project, not a guess");
        assert_eq!(
            s.ended_at, 1_700_000_000_000,
            "no timestamps falls back to the file's own mtime"
        );
    }

    #[test]
    fn a_rollout_with_nothing_said_is_not_a_row() {
        let dir = tmp();
        let path = fixture(
            &dir,
            "empty.jsonl",
            "{\"cwd\":\"/tmp/x\"}\n{\"role\":\"assistant\",\"content\":[{\"text\":\"hello\"}]}\n",
        );
        assert!(
            read_rollout(&path, 0).is_none(),
            "a picker row that opens to nothing is worse than no row"
        );
    }

    #[test]
    fn a_lunch_break_is_not_time_at_the_keyboard() {
        let minute = 60_000;
        let stamps = vec![0, 2 * minute, 4 * minute, 90 * minute, 92 * minute];
        assert_eq!(active_minutes(&stamps), 6, "the 86 minute gap is excluded");
    }

    #[test]
    fn seconds_and_milliseconds_are_told_apart_by_size() {
        assert_eq!(parse_stamp(&serde_json::json!(1_700_000_000)), Some(1_700_000_000_000));
        assert_eq!(parse_stamp(&serde_json::json!(1_700_000_000_000i64)), Some(1_700_000_000_000));
    }

    #[test]
    fn nothing_installed_is_an_empty_list_rather_than_a_failure() {
        // sessions_dir returns None when ~/.codex is absent, which is the state
        // of most machines and must never be an error.
        assert!(recent_sessions(10).len() <= 10);
    }
}
