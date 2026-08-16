//! Reading Cursor, with no setup at all.
//!
//! The export route was the reason this existed for ChatGPT and Gemini, and it
//! is unusable: OpenAI mails you a link "in a few days", Google's takes a walk
//! through Takeout, and nobody finishes either. A source that needs a tutorial
//! is not a source.
//!
//! Cursor needs none of it. Everything is already on the disk, in SQLite, and it
//! updates as you work:
//!
//!   - `workspaceStorage/<hash>/workspace.json` — which folder this is
//!   - `workspaceStorage/<hash>/state.vscdb`    — `composer.composerData` holds
//!     one entry per conversation with its name and timestamps, and
//!     `aiService.generations` holds every prompt with a millisecond stamp
//!   - `globalStorage/state.vscdb`              — `cursorDiskKV`, keyed
//!     `bubbleId:<composerId>:<uuid>`, holds the messages themselves
//!
//! Bubbles carry `type` 1 for the person and 2 for the assistant, and `text` is
//! the body, so a whole conversation comes back verbatim exactly as it does for
//! Claude Code.
//!
//! ── Same privacy rule as the transcripts ──────────────────────────────────────
//! Listing reads names and timestamps only. Message bodies are read for one
//! conversation, when somebody picks it. Both databases are opened read-only.

use crate::work_history::WorkSession;
use rusqlite::{Connection, OpenFlags};
use serde_json::Value;
use std::path::{Path, PathBuf};

const SOURCE: &str = "cursor";

/// A pause longer than this is not work. Matches the Claude Code reader.
const ACTIVE_GAP_MS: i64 = 30 * 60 * 1_000;

/// Editors that keep chat in the VS Code storage layout. All read identically.
const EDITORS: [&str; 3] = ["Cursor", "Windsurf", "Code"];

fn support_dir() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(PathBuf::from(home).join("Library").join("Application Support"))
}

/**
 * Open a database read-only, tolerating the editor having it open.
 *
 * Cursor holds these while it runs, so a writable handle would fail exactly
 * when someone is most likely to be using Sidq. Read-only plus a short busy
 * timeout gets a consistent snapshot without ever touching their data.
 */
fn open_ro(path: &Path) -> Option<Connection> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .ok()?;
    let _ = conn.busy_timeout(std::time::Duration::from_millis(500));
    Some(conn)
}

fn read_key(conn: &Connection, table: &str, key: &str) -> Option<String> {
    let sql = format!("SELECT value FROM {table} WHERE key = ?1");
    conn.query_row(&sql, [key], |row| row.get::<_, String>(0)).ok()
}

/// Every conversation across every workspace of every supported editor.
pub fn recent_sessions(limit: usize) -> Vec<WorkSession> {
    let Some(support) = support_dir() else {
        return Vec::new();
    };

    let mut out: Vec<WorkSession> = EDITORS
        .iter()
        .map(|editor| support.join(editor).join("User").join("workspaceStorage"))
        .filter(|dir| dir.is_dir())
        .flat_map(|dir| {
            std::fs::read_dir(&dir)
                .into_iter()
                .flatten()
                .flatten()
                .flat_map(|entry| sessions_in_workspace(&entry.path()))
                .collect::<Vec<_>>()
        })
        .collect();

    out.sort_by(|a, b| b.ended_at.cmp(&a.ended_at));
    out.truncate(limit);
    out
}

fn sessions_in_workspace(dir: &Path) -> Vec<WorkSession> {
    let Some(conn) = open_ro(&dir.join("state.vscdb")) else {
        return Vec::new();
    };

    // The folder this workspace points at. Absent for a window opened on no
    // folder at all, which is legitimate and simply means no project name.
    let (project, project_name) = std::fs::read_to_string(dir.join("workspace.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|v| v.get("folder")?.as_str().map(str::to_string))
        .map(|folder| {
            let path = folder.strip_prefix("file://").unwrap_or(&folder).to_string();
            let name = Path::new(&path)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            (path, name)
        })
        .unwrap_or_default();

    // Prompt timestamps for the whole workspace, used to attribute turns and
    // working time to whichever conversation was open at the time.
    let stamps: Vec<i64> = read_key(&conn, "ItemTable", "aiService.generations")
        .and_then(|raw| serde_json::from_str::<Vec<Value>>(&raw).ok())
        .map(|rows| rows.iter().filter_map(|r| as_millis(r.get("unixMs"))).collect())
        .unwrap_or_default();

    let Some(raw) = read_key(&conn, "ItemTable", "composer.composerData") else {
        return Vec::new();
    };
    let Ok(data) = serde_json::from_str::<Value>(&raw) else {
        return Vec::new();
    };

    data.get("allComposers")
        .and_then(|c| c.as_array())
        .map(|composers| {
            composers
                .iter()
                .filter(|c| !c.get("isArchived").and_then(|v| v.as_bool()).unwrap_or(false))
                .filter_map(|c| composer_to_session(c, &project, &project_name, &stamps))
                .collect()
        })
        .unwrap_or_default()
}

/// Cursor writes these as numbers in some builds and strings in others.
fn as_millis(value: Option<&Value>) -> Option<i64> {
    let v = value?;
    v.as_i64().or_else(|| v.as_str()?.parse().ok())
}

fn composer_to_session(
    composer: &Value,
    project: &str,
    project_name: &str,
    stamps: &[i64],
) -> Option<WorkSession> {
    let id = composer.get("composerId")?.as_str()?.to_string();
    let created = as_millis(composer.get("createdAt")).unwrap_or(0);
    let ended = as_millis(composer.get("lastUpdatedAt")).unwrap_or(created);

    /*
     * A conversation with no name was opened and never used. Cursor leaves the
     * name unset until the first exchange, so this is the cleanest available
     * signal for "nothing happened here" and it keeps empty rows out of the
     * picker without needing to read any message bodies to find out.
     */
    let title = composer.get("name")?.as_str()?.trim().to_string();
    if title.is_empty() {
        return None;
    }

    /*
     * Turns and working time, attributed by time window.
     *
     * Cursor does not link a prompt to its conversation, so prompts that fall
     * between this conversation being created and last touched are counted as
     * belonging to it. That is approximate when two are used in one sitting, and
     * it is the honest maximum available without opening every message.
     */
    let mut within: Vec<i64> = stamps
        .iter()
        .copied()
        .filter(|ms| *ms >= created && *ms <= ended)
        .collect();
    within.sort_unstable();

    let active: i64 = within
        .windows(2)
        .map(|w| w[1] - w[0])
        .filter(|d| *d >= 0 && *d <= ACTIVE_GAP_MS)
        .sum();

    Some(WorkSession {
        session_id: id,
        project: project.to_string(),
        project_name: project_name.to_string(),
        title,
        last_prompt: composer
            .get("subtitle")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        branch: String::new(),
        ended_at: ended,
        turns: within.len() as u32,
        active_minutes: (active / 60_000) as u32,
        source: SOURCE,
    })
}

/**
 * The whole conversation for one Cursor composer, verbatim.
 *
 * Ordered by rowid. The bubble keys carry a random uuid rather than an index, so
 * insertion order is the only chronology available, and for an append-only log
 * that is the right one.
 */
pub fn session_transcript(composer_id: &str) -> Option<String> {
    // Untrusted: it crosses from the webview and is concatenated into a LIKE
    // pattern below. Anything that is not a plain id is refused outright.
    let safe = !composer_id.is_empty()
        && composer_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !safe {
        return None;
    }

    let support = support_dir()?;
    let conn = EDITORS
        .iter()
        .map(|e| support.join(e).join("User").join("globalStorage").join("state.vscdb"))
        .filter(|p| p.is_file())
        .find_map(|p| open_ro(&p))?;

    let mut stmt = conn
        .prepare("SELECT value FROM cursorDiskKV WHERE key LIKE ?1 ORDER BY rowid")
        .ok()?;
    let rows = stmt
        .query_map([format!("bubbleId:{composer_id}:%")], |row| {
            row.get::<_, String>(0)
        })
        .ok()?;

    let mut out = String::new();
    for row in rows.flatten() {
        let Ok(bubble) = serde_json::from_str::<Value>(&row) else {
            continue;
        };
        let text = bubble.get("text").and_then(|t| t.as_str()).unwrap_or("").trim();
        if text.is_empty() {
            continue;
        }

        // 1 is the person, 2 is the assistant. Anything else is bookkeeping.
        let role = match bubble.get("type").and_then(|t| t.as_i64()) {
            Some(1) => "You",
            Some(2) => "Assistant",
            _ => continue,
        };

        out.push_str(role);
        out.push_str(":\n");
        out.push_str(text);
        out.push_str("\n\n");
    }

    (!out.trim().is_empty()).then_some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Manual diagnostic. `cargo test --bin sidq real_cursor -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_cursor() {
        let sessions = recent_sessions(10);
        println!("\n{} cursor conversations\n", sessions.len());
        for s in &sessions {
            println!(
                "  turns {:>4}  active {:>4}m  {:<44} {}",
                s.turns,
                s.active_minutes,
                s.title.chars().take(44).collect::<String>(),
                s.project_name
            );
        }
        if let Some(first) = sessions.first() {
            match session_transcript(&first.session_id) {
                Some(text) => println!(
                    "\n  transcript of {:?}: {} chars, {} messages",
                    first.title,
                    text.chars().count(),
                    text.matches("\nYou:\n").count() + text.matches("\nAssistant:\n").count()
                ),
                None => println!("\n  NO transcript for {}", first.session_id),
            }
        }
    }

    #[test]
    fn reads_timestamps_written_as_either_numbers_or_strings() {
        // Cursor has shipped both shapes. Parsing only one silently zeroes every
        // date, which puts every conversation at the epoch and ranks them last.
        assert_eq!(as_millis(Some(&serde_json::json!(1_772_742_281_802i64))), Some(1_772_742_281_802));
        assert_eq!(as_millis(Some(&serde_json::json!("1772742281802"))), Some(1_772_742_281_802));
        assert_eq!(as_millis(Some(&serde_json::json!("not a number"))), None);
        assert_eq!(as_millis(None), None);
    }

    #[test]
    fn refuses_a_composer_id_that_could_alter_the_query() {
        // The id is interpolated into a LIKE pattern, so anything but a plain
        // identifier is rejected rather than escaped.
        assert_eq!(session_transcript("' OR 1=1 --"), None);
        assert_eq!(session_transcript("%"), None);
        assert_eq!(session_transcript(""), None);
    }

    #[test]
    fn skips_a_conversation_that_was_opened_and_never_used() {
        // Cursor leaves `name` unset until the first exchange.
        let unnamed = serde_json::json!({ "composerId": "abc", "createdAt": 1 });
        assert!(composer_to_session(&unnamed, "", "", &[]).is_none());
    }

    #[test]
    fn counts_only_the_prompts_inside_a_conversation_window() {
        let composer = serde_json::json!({
            "composerId": "abc",
            "name": "Real work",
            "createdAt": 1_000,
            "lastUpdatedAt": 100_000,
        });
        // Two inside the window, one long before it, one long after.
        let stamps = [500, 2_000, 3_000, 500_000];

        let session = composer_to_session(&composer, "/p", "p", &stamps).unwrap();

        assert_eq!(session.turns, 2);
        assert_eq!(session.source, "cursor");
        assert_eq!(session.session_id, "abc");
    }

    #[test]
    fn excludes_the_gap_where_nothing_happened() {
        let composer = serde_json::json!({
            "composerId": "abc",
            "name": "Long day",
            "createdAt": 0,
            "lastUpdatedAt": 100_000_000,
        });
        let min = 60_000;
        // Ten minutes, then three hours away, then ten more.
        let stamps = [0, 10 * min, 190 * min, 200 * min];

        let session = composer_to_session(&composer, "/p", "p", &stamps).unwrap();

        assert_eq!(session.active_minutes, 20);
    }
}
