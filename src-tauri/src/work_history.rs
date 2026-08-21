//! Reading where you actually stopped, everywhere Claude writes it down.
//!
//! Claude keeps a JSONL transcript per session, in the same format, in more than
//! one place. Reading only the first missed Cowork entirely, which is often
//! where the longest conversations are:
//!
//!   - `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`
//!     Claude Code from a terminal.
//!
//!   - `~/Library/Application Support/Claude/local-agent-mode-sessions/`
//!     `<workspace>/<account>/local_<uuid>/.claude/projects/...`
//!     Cowork. Every session nests its own `.claude` directory laid out exactly
//!     like the one above, so one parser reads both.
//!
//! Three record types in there are worth more than everything the rest of this
//! product asks a person to type:
//!
//!   - `ai-title` / `custom-title` — what the session was about
//!   - `last-prompt`               — the last thing they asked, which is exactly
//!                                   the point they stopped
//!   - `user` records carry `cwd` and `gitBranch`
//!
//! ── The privacy rule, which is the whole design ───────────────────────────────
//! Two very different reads live in this file and the difference is the rule.
//!
//! `recent_sessions` runs unprompted, so it takes only the fields above: enough
//! to label and rank a session, never its contents.
//!
//! `session_transcript` returns an entire conversation verbatim, and runs only
//! when someone picks that session by hand. Transcripts hold code, credentials
//! pasted in frustration, half-written emails, so nothing reads one on a timer
//! or in the background.
//!
//! Neither is uploaded. Both happen on this machine or not at all, which is also
//! why a full handover costs nothing and works with the wifi off.
//!
//! ── Why it is not just serde over the whole file ──────────────────────────────
//! These transcripts reach tens of megabytes. Parsing every line as JSON to find
//! three small records would take seconds per project and this runs at startup,
//! so each line gets a cheap substring test first and only candidates are
//! parsed. A 23MB transcript resolves in single-digit milliseconds.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

/// One piece of work, reduced to what the picker needs to rank and label it.
/*
 * camelCase across the boundary.
 *
 * Without this the webview received `project_name` and `ended_at` while every
 * consumer in TypeScript reads `projectName` and `endedAt`, so each one saw
 * undefined: the resume line rendered "undefined in undefined" and the ranker
 * scored real sessions as NaN. Nothing failed loudly because the types on the
 * other side claimed the camelCase shape and no mapper ever existed to produce
 * it. The test below pins the wire format so it cannot drift back.
 */
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkSession {
    /// Filename stem of the transcript. What `session_transcript` is called with.
    pub session_id: String,
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
    /// User turns. One turn is a passing question, not work to resume.
    pub turns: u32,
    /// Minutes actually worked, excluding the gaps where nothing happened.
    pub active_minutes: u32,
    /// Which assistant wrote this. Constant here; other readers will differ.
    pub source: &'static str,
}

/// Titles and prompts are hints. Anything longer is a paragraph nobody reads.
const MAX_TITLE: usize = 120;
const MAX_PROMPT: usize = 200;
/// A guard against a runaway transcript, not a real limit.
const MAX_BYTES: u64 = 64 * 1024 * 1024;

/// Which assistant these transcripts belong to.
/*
 * ── The Claude surfaces on this Mac ──────────────────────────────────────────
 * Every session used to be labelled `claude-code`, including the ones from
 * Cowork. They were being read — the roots below have covered both for a while
 * — but a Cowork conversation arrived in the picker, the index and the handover
 * calling itself Claude Code, so as far as anything downstream could tell there
 * was one Claude on this machine.
 *
 * There is not. There are two that write transcripts here, and the surface a
 * conversation came from is part of what it is.
 *
 * The two that do not appear: the Claude desktop app keeps no conversations on
 * disk at all — checked directly, its IndexedDB, Local Storage, Session Storage
 * and HTTP cache hold none — and claude.ai in a browser is the extension's job.
 */
const SOURCE_CLI: &str = "claude-code";
const SOURCE_COWORK: &str = "cowork";

/**
 * Ceiling on a handed-over conversation, in characters.
 *
 * Not a summary and not a sample: the whole point of the handover is that the
 * next model sees what was actually said, in order, in the person's own words.
 * A limit exists only because transcripts here reach 28MB and nothing will
 * accept that. When one is over, the *end* is kept, because the recent stretch
 * is what carries the current direction.
 */
const MAX_TRANSCRIPT_CHARS: usize = 400_000;

/**
 * The entire conversation for one session, verbatim.
 *
 * Deliberately not summarised. A summary is the thing every assistant can
 * already do on request, and it loses exactly what makes a handover work: the
 * back and forth, the corrections, the decisions that got reversed, the tone.
 * Handing the next model a paragraph about a conversation produces an assistant
 * that has read about your work. Handing it the conversation produces one that
 * was there.
 *
 * Read only when someone explicitly picks a session. Never at startup, never in
 * the background, and it goes to their own clipboard rather than to a server.
 */
pub fn session_transcript(session_id: &str) -> Option<String> {
    // The id crosses from the webview, so it is untrusted. Anything that is not
    // a plain filename stem is refused rather than sanitised, since there is no
    // legitimate id that needs fixing up.
    let safe = !session_id.is_empty()
        && session_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !safe {
        return None;
    }

    let path = find_transcript(session_id)?;
    let meta = fs::metadata(&path).ok()?;
    if meta.len() > MAX_BYTES {
        return None;
    }

    let content = fs::read_to_string(&path).ok()?;
    let mut out = String::new();

    for line in content.lines() {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let role = match value.get("type").and_then(|t| t.as_str()) {
            Some("user") => "You",
            Some("assistant") => "Assistant",
            _ => continue,
        };

        let body = message_text(&value);
        if body.trim().is_empty() {
            continue;
        }

        out.push_str(role);
        out.push_str(":\n");
        out.push_str(body.trim());
        out.push_str("\n\n");
    }

    Some(clamp_to_tail(strip_boilerplate(&out)))
}

/**
 * The same conversation, with everything that was hidden.
 *
 * `session_transcript` above returns what was said, which is what the picker
 * lists and the index searches. This returns what actually happened: the
 * reasoning nobody saw, every tool call and result, and the points where a
 * person stopped the model mid-answer.
 *
 * They are separate functions on purpose. Search wants the spoken half — the
 * words a person would remember and type into a search box — and indexing the
 * other 86% would multiply the index for results nobody is looking for. A
 * handover wants all of it, because the hidden part is the only part the
 * receiving model could not have produced by being asked.
 */
pub fn session_capture(session_id: &str) -> Option<Vec<crate::capture::Turn>> {
    use crate::capture::{blocks_of, Role, Turn};

    let safe = !session_id.is_empty()
        && session_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !safe {
        return None;
    }

    let path = find_transcript(session_id)?;
    if fs::metadata(&path).ok()?.len() > MAX_BYTES {
        return None;
    }

    let content = fs::read_to_string(&path).ok()?;
    let mut turns: Vec<Turn> = Vec::new();

    for line in content.lines() {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };

        /*
         * Sidechains are the assistant talking to itself in a subagent.
         *
         * Real reasoning, and not this conversation's. Carrying it in would
         * hand the next model a second, interleaved thread with no marker
         * saying which turn belongs to which.
         */
        if value.get("isSidechain").and_then(|v| v.as_bool()) == Some(true) {
            continue;
        }

        let role = match value.get("type").and_then(|t| t.as_str()) {
            Some("user") => Role::You,
            Some("assistant") => Role::Assistant,
            _ => continue,
        };

        let mut blocks = blocks_of(&value);
        if blocks.is_empty() {
            continue;
        }

        // Consecutive records from the same speaker are one turn. Every
        // assistant reply that calls a tool is split across several records,
        // and left alone that reads as a dozen separate replies.
        match turns.last_mut() {
            Some(last) if last.role == role => last.blocks.append(&mut blocks),
            _ => turns.push(Turn { role, blocks }),
        }
    }

    (!turns.is_empty()).then_some(turns)
}

/// Locate `<session-id>.jsonl` under any project directory.
fn find_transcript(session_id: &str) -> Option<PathBuf> {
    let name = format!("{session_id}.jsonl");

    project_roots()
        .iter()
        .flat_map(|(root, _)| read_dirs(root))
        .map(|dir| dir.join(&name))
        .find(|candidate| candidate.is_file())
}

/**
 * The human-readable text of one record.
 *
 * Message content is either a plain string or a list of typed blocks. Tool
 * results are skipped: they are frequently enormous file dumps, and they say
 * what a machine did rather than what either party meant. Tool *calls* are kept
 * as a single line each, because "it went and read the config here" is part of
 * the thread of reasoning and losing it makes the conversation read as jumpy.
 */
fn message_text(record: &serde_json::Value) -> String {
    let Some(content) = record.get("message").and_then(|m| m.get("content")) else {
        return String::new();
    };

    match content {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(blocks) => blocks
            .iter()
            .filter_map(|block| match block.get("type").and_then(|t| t.as_str()) {
                Some("text") => block
                    .get("text")
                    .and_then(|t| t.as_str())
                    .map(|s| s.to_string()),
                Some("tool_use") => block
                    .get("name")
                    .and_then(|n| n.as_str())
                    .map(|name| format!("[used {name}]")),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

/**
 * Remove what a machine wrote, keep everything a person did.
 *
 * Measured on a real 625,000 character transcript this recovers about 6%. That
 * is a lot less than it sounds like it should be, and the reason is the good
 * one: tool *results* are already dropped when the transcript is assembled, so
 * what is left is very nearly all conversation. There is no clever compression
 * hiding here, and anything that claimed a big saving would be deleting
 * somebody's words.
 *
 * Three things go, none of which anyone typed:
 *
 *   - `<system-reminder>` and command wrapper blocks, which are harness
 *     plumbing injected around messages.
 *   - The "continued from a previous conversation" preamble, which describes a
 *     summarisation that already happened and means nothing to the next model.
 *   - Runs of blank lines left behind by the above.
 *
 * `[used X]` markers stay. They are 4.5% on their own and it is tempting, but
 * they are the only trace of what the assistant actually went and did, and a
 * conversation reads as jumpy without them.
 */
fn strip_boilerplate(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;

    // Paired blocks, removed by scanning rather than regex to avoid the
    // dependency. Each open tag consumes through its matching close.
    const BLOCKS: [(&str, &str); 4] = [
        ("<system-reminder>", "</system-reminder>"),
        ("<command-name>", "</command-name>"),
        ("<command-message>", "</command-message>"),
        ("<local-command-stdout>", "</local-command-stdout>"),
    ];

    'outer: while !rest.is_empty() {
        // The earliest opening tag of any kind, so blocks are removed in the
        // order they appear rather than one type at a time.
        let next = BLOCKS
            .iter()
            .filter_map(|(open, close)| rest.find(open).map(|i| (i, *open, *close)))
            .min_by_key(|(i, _, _)| *i);

        match next {
            Some((at, open, close)) => {
                out.push_str(&rest[..at]);
                let after_open = at + open.len();
                match rest[after_open..].find(close) {
                    Some(end) => rest = &rest[after_open + end + close.len()..],
                    // Unclosed tag: keep the remainder rather than swallow the
                    // rest of somebody's conversation.
                    None => {
                        out.push_str(&rest[at..]);
                        break 'outer;
                    }
                }
            }
            None => {
                out.push_str(rest);
                break;
            }
        }
    }

    // The preamble describing an earlier summarisation.
    if let Some(at) = out.find("This session is being continued from a previous conversation") {
        if let Some(end) = out[at..].find("\n\n") {
            out.replace_range(at..at + end + 2, "");
        }
    }

    collapse_blank_runs(&out)
}

/// Three or more consecutive newlines become two.
fn collapse_blank_runs(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut newlines = 0;
    for ch in text.chars() {
        if ch == '\n' {
            newlines += 1;
            if newlines <= 2 {
                out.push(ch);
            }
        } else {
            newlines = 0;
            out.push(ch);
        }
    }
    out
}

/// Keep the most recent MAX_TRANSCRIPT_CHARS, cut at a message boundary.
fn clamp_to_tail(text: String) -> String {
    if text.chars().count() <= MAX_TRANSCRIPT_CHARS {
        return text;
    }

    let skip = text.chars().count() - MAX_TRANSCRIPT_CHARS;
    let tail: String = text.chars().skip(skip).collect();

    // Start at a speaker rather than mid-sentence, so the handover does not open
    // halfway through somebody's paragraph.
    let start = tail
        .find("\nYou:\n")
        .or_else(|| tail.find("\nAssistant:\n"))
        .map(|i| i + 1)
        .unwrap_or(0);

    format!(
        "[Earlier part of this conversation omitted for length.]\n\n{}",
        &tail[start..]
    )
}

/// Read the most recent sessions across all projects, newest first.
///
/// Returns an empty list rather than an error when the directory does not exist:
/// most people do not have Claude Code installed and that is not a failure.
pub fn recent_sessions(limit: usize) -> Vec<WorkSession> {
    let titles = cowork_titles();

    let mut sessions: Vec<WorkSession> = project_roots()
        .iter()
        .flat_map(|(root, source)| {
            read_dirs(root)
                .into_iter()
                .flat_map(move |dir| sessions_in_project(&dir, source))
        })
        .map(|mut session| {
            /*
             * Cowork writes the conversation's real title beside the
             * transcript rather than inside it, so a session whose JSONL has
             * no `ai-title` record still has a name — it is just in another
             * directory. Without this those rows fall back to the last prompt,
             * which is whatever half-sentence the person happened to end on.
             */
            if session.source == SOURCE_COWORK {
                if let Some(title) = titles.get(&session.session_id) {
                    if session.title.is_empty() || title.len() > session.title.len() {
                        session.title = title.clone();
                    }
                }
            }
            session
        })
        .collect();

    // Newest first, so "where did I stop" is the first element.
    sessions.sort_by(|a, b| b.ended_at.cmp(&a.ended_at));
    sessions.truncate(limit);
    sessions
}

/**
 * Every place Claude writes a transcript on this Mac.
 *
 * There is more than one, which is easy to miss because they hold the identical
 * JSONL format. Reading only the first meant Cowork conversations — often the
 * longest and most involved someone has — were invisible.
 *
 *   ~/.claude/projects
 *       Claude Code from a terminal.
 *
 *   ~/Library/Application Support/Claude/local-agent-mode-sessions/
 *       <workspace>/<account>/local_<uuid>/.claude/projects
 *       Cowork. Each session carries its own nested .claude directory, laid out
 *       exactly like the one above, so the same parser reads both.
 */
fn project_roots() -> Vec<(PathBuf, &'static str)> {
    let Some(home) = std::env::var_os("HOME") else {
        return Vec::new();
    };
    let home = PathBuf::from(home);
    let mut roots = Vec::new();

    let cli = home.join(".claude").join("projects");
    if cli.is_dir() {
        roots.push((cli, SOURCE_CLI));
    }

    /*
     * Cowork nests two levels of opaque id before the session folders, so this
     * walks rather than globs: workspace, then account, then one directory per
     * conversation, each containing a full .claude/projects tree of its own.
     */
    let cowork = home
        .join("Library")
        .join("Application Support")
        .join("Claude")
        .join("local-agent-mode-sessions");

    for workspace in read_dirs(&cowork) {
        for account in read_dirs(&workspace) {
            for session in read_dirs(&account) {
                let nested = session.join(".claude").join("projects");
                if nested.is_dir() {
                    roots.push((nested, SOURCE_COWORK));
                }
            }
        }
    }

    roots
}

/**
 * Cowork's own titles, keyed by the transcript they belong to.
 *
 * `claude-code-sessions` holds one small JSON per conversation with the title
 * Claude generated or the person set, and `cliSessionId` in it is the stem of
 * the transcript file. It is metadata only — no conversation content — so this
 * reads a few kilobytes rather than opening anything large.
 */
fn cowork_titles() -> std::collections::HashMap<String, String> {
    let mut out = std::collections::HashMap::new();
    let Some(home) = std::env::var_os("HOME") else {
        return out;
    };

    let root = PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("Claude")
        .join("claude-code-sessions");

    for workspace in read_dirs(&root) {
        for account in read_dirs(&workspace) {
            let Ok(entries) = fs::read_dir(&account) else { continue };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().is_none_or(|e| e != "json") {
                    continue;
                }
                let Ok(text) = fs::read_to_string(&path) else { continue };
                let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else { continue };

                let id = value.get("cliSessionId").and_then(|v| v.as_str());
                let title = value.get("title").and_then(|v| v.as_str());
                if let (Some(id), Some(title)) = (id, title) {
                    if !title.trim().is_empty() {
                        out.insert(id.to_string(), title.to_string());
                    }
                }
            }
        }
    }

    out
}

/// Sub-directories of `dir`, or nothing if it cannot be read.
fn read_dirs(dir: &Path) -> Vec<PathBuf> {
    fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect()
}

fn sessions_in_project(dir: &Path, source: &'static str) -> Vec<WorkSession> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };

    entries
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "jsonl"))
        .filter_map(|e| read_session(&e.path(), source))
        .filter(|s| !s.title.is_empty() || !s.last_prompt.is_empty())
        .collect()
}

fn read_session(path: &Path, source: &'static str) -> Option<WorkSession> {
    let meta = fs::metadata(path).ok()?;
    if meta.len() > MAX_BYTES {
        return None;
    }

    let content = fs::read_to_string(path).ok()?;
    let mut session = WorkSession {
        session_id: path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default(),
        ended_at: modified_millis(&meta),
        source,
        ..Default::default()
    };

    /*
     * Every user turn's timestamp, for the active-time calculation below.
     *
     * Collected by substring rather than by parsing the record: user records are
     * the bulk of the file and carry the whole message body, so running serde
     * over all of them to reach one 19-character field is most of the cost of
     * reading the transcript at all.
     */
    let mut stamps: Vec<i64> = Vec::new();

    for line in content.lines() {
        if is_user_record(line) {
            session.turns += 1;
            if let Some(ms) = extract_timestamp(line) {
                stamps.push(ms);
            }
        }

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

    session.active_minutes = active_minutes(&mut stamps);

    /*
     * Prefer the last real turn over the file's mtime.
     *
     * mtime moves when anything touches the file, so a session that was merely
     * opened reads as recent work. The last thing actually typed does not lie.
     */
    if let Some(last) = stamps.last() {
        session.ended_at = *last;
    }

    Some(session)
}

/// True for `user` records, tested without parsing the line.
fn is_user_record(line: &str) -> bool {
    line.contains("\"type\":\"user\"") || line.contains("\"type\": \"user\"")
}

/// Pull `"timestamp":"2026-08-15T09:00:00..."` out of a line without serde.
fn extract_timestamp(line: &str) -> Option<i64> {
    let key = "\"timestamp\":\"";
    let start = line.find(key)? + key.len();
    let rest = line.get(start..)?;
    iso_to_millis(rest.get(..19)?)
}

/// Parse `YYYY-MM-DDTHH:MM:SS` (always UTC in these transcripts) to epoch millis.
fn iso_to_millis(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() < 19 || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' {
        return None;
    }
    let num = |a: usize, z: usize| -> Option<i64> { s.get(a..z)?.parse().ok() };
    let days = days_from_civil(num(0, 4)?, num(5, 7)?, num(8, 10)?);
    let secs = days * 86_400 + num(11, 13)? * 3_600 + num(14, 16)? * 60 + num(17, 19)?;
    Some(secs * 1_000)
}

/// Days since the Unix epoch for a civil date. Hinnant's algorithm.
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// A pause longer than this is lunch or tomorrow, not thinking time.
const ACTIVE_GAP_MS: i64 = 30 * 60 * 1_000;

/**
 * Minutes actually worked, from the turn timestamps.
 *
 * Wall-clock between the first and last message is wrong by a lot, because real
 * sessions get resumed across days: one transcript on this machine spans 79
 * hours while holding about 19 hours of work. Gaps beyond a short pause are
 * excluded so this measures time at the keyboard.
 */
fn active_minutes(stamps: &mut [i64]) -> u32 {
    stamps.sort_unstable();
    /*
     * A long gap contributes nothing, rather than contributing the cap.
     *
     * Clamping instead would credit three hours away as half an hour of work,
     * which quietly inflates every session left open overnight. Under-counting
     * the few minutes someone kept working after their last message is the
     * smaller and more honest error.
     */
    let total: i64 = stamps
        .windows(2)
        .map(|w| w[1] - w[0])
        .filter(|d| *d >= 0 && *d <= ACTIVE_GAP_MS)
        .sum();
    (total / 60_000) as u32
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
    /**
     * What the capture recovers, on this machine's real transcripts.
     *
     * cargo test --bin sidq real_capture -- --ignored --nocapture
     */
    /**
     * What each Claude surface actually contributes, on this machine.
     *
     * cargo test --bin sidq real_sources -- --ignored --nocapture
     */
    #[test]
    #[ignore]
    fn real_sources() {
        use std::collections::HashMap;

        let sessions = super::recent_sessions(500);
        let mut by_source: HashMap<&str, usize> = HashMap::new();
        for s in &sessions {
            *by_source.entry(s.source).or_default() += 1;
        }

        println!("\n  roots:");
        for (root, source) in super::project_roots() {
            println!("    [{source}] {}", root.display());
        }

        println!("\n  sessions by source:");
        let mut rows: Vec<_> = by_source.into_iter().collect();
        rows.sort_by_key(|(_, n)| std::cmp::Reverse(*n));
        for (source, n) in rows {
            println!("    {source:<14} {n}");
        }

        let titles = super::cowork_titles();
        println!("\n  cowork titles found: {}", titles.len());
        for s in sessions.iter().filter(|s| s.source == super::SOURCE_COWORK).take(4) {
            println!("    {} — {}", &s.session_id[..8], s.title);
        }
        println!();
    }

    #[test]
    #[ignore]
    fn real_capture() {
        use crate::capture::Block;

        let sessions = super::recent_sessions(20);
        let session = sessions
            .iter()
            .max_by_key(|s| s.turns)
            .expect("some conversation exists");

        let spoken = super::session_transcript(&session.session_id).unwrap_or_default();
        let turns = super::session_capture(&session.session_id).expect("capture");

        let (mut said, mut thought, mut did, mut saw, mut stopped) = (0, 0, 0, 0, 0);
        let mut thinking_chars = 0usize;
        for turn in &turns {
            for block in &turn.blocks {
                match block {
                    Block::Said(t) => { said += 1; let _ = t; }
                    Block::Thought(t) => { thought += 1; thinking_chars += t.chars().count(); }
                    Block::Did { .. } => did += 1,
                    Block::Saw { .. } => saw += 1,
                    Block::Interrupted => stopped += 1,
                }
            }
        }

        let brief = crate::compiler::Brief {
            source: &session.source,
            when: "today",
            project: &session.project_name,
            resume_point: &session.last_prompt,
            profile: &[],
        };
        let compiled = crate::compiler::compile(
            &turns,
            &brief,
            crate::compiler::Target::for_source(&session.source),
        );

        println!("\n  {}", session.title);
        println!("  {} turns", turns.len());
        println!("  said {said} · thought {thought} · ran {did} · returned {saw} · stopped {stopped}");
        println!("  reasoning recovered: {thinking_chars} chars");
        println!("  spoken handover:   {} chars", spoken.chars().count());
        println!("  compiled handover: {} chars\n", compiled.chars().count());
        // The brief is what a cold model reads first; print it so it can be
        // judged the way the receiving model will experience it.
        for line in compiled.lines().take(26) {
            println!("  | {line}");
        }
        println!();
    }

    use super::*;

    #[test]
    fn serialises_the_keys_typescript_actually_reads() {
        // The TS interface is the contract, and it is camelCase. A rename here
        // silently turns every field into undefined on the other side.
        let json = serde_json::to_string(&WorkSession::default()).unwrap();

        for key in [
            "sessionId",
            "projectName",
            "lastPrompt",
            "endedAt",
            "activeMinutes",
        ] {
            assert!(json.contains(&format!("\"{key}\"")), "missing {key} in {json}");
        }
        assert!(!json.contains("project_name"), "snake_case leaked: {json}");
    }

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

    #[test]
    fn parses_an_iso_timestamp_to_epoch_millis() {
        // 1970-01-01T00:00:00Z is the epoch by definition, so this pins the
        // civil-date arithmetic rather than merely checking it is self-consistent.
        assert_eq!(iso_to_millis("1970-01-01T00:00:00"), Some(0));
        assert_eq!(iso_to_millis("1970-01-02T00:00:00"), Some(86_400_000));
        assert_eq!(iso_to_millis("2026-08-15T09:00:00"), Some(1_786_784_400_000));
    }

    #[test]
    fn rejects_a_malformed_timestamp_instead_of_guessing() {
        assert_eq!(iso_to_millis("not-a-date"), None);
        assert_eq!(iso_to_millis("2026/08/15T09:00:00"), None);
    }

    #[test]
    fn reads_the_timestamp_out_of_a_real_line() {
        let line = r#"{"type":"user","timestamp":"2026-08-15T09:00:00.123Z","cwd":"/x"}"#;
        assert_eq!(extract_timestamp(line), Some(1_786_784_400_000));
    }

    #[test]
    fn active_minutes_excludes_the_gap_where_nothing_happened() {
        let base = 1_700_000_000_000;
        let min = 60_000;
        // Ten minutes of work, then away for three hours, then ten more.
        let mut stamps = vec![base, base + 10 * min, base + 190 * min, base + 200 * min];

        // 20 minutes worked, not the 200 minutes of wall-clock between the ends.
        assert_eq!(active_minutes(&mut stamps), 20);
    }

    #[test]
    fn active_minutes_counts_a_short_pause_as_thinking() {
        let base = 1_700_000_000_000;
        let mut stamps = vec![base, base + 5 * 60_000, base + 15 * 60_000];

        assert_eq!(active_minutes(&mut stamps), 15);
    }

    #[test]
    fn active_minutes_handles_a_single_turn() {
        assert_eq!(active_minutes(&mut [1_700_000_000_000]), 0);
        assert_eq!(active_minutes(&mut []), 0);
    }

    #[test]
    fn identifies_user_records_without_parsing() {
        assert!(is_user_record(r#"{"type":"user","message":{}}"#));
        assert!(!is_user_record(r#"{"type":"assistant","message":{}}"#));
        assert!(!is_user_record(r#"{"type":"ai-title","aiTitle":"x"}"#));
    }

    #[test]
    fn refuses_a_session_id_that_could_escape_the_directory() {
        // The id arrives from the webview, so traversal must be impossible.
        assert_eq!(session_transcript("../../../etc/passwd"), None);
        assert_eq!(session_transcript("a/b"), None);
        assert_eq!(session_transcript(""), None);
    }

    #[test]
    fn extracts_text_from_both_content_shapes() {
        let plain: serde_json::Value =
            serde_json::from_str(r#"{"message":{"content":"hello"}}"#).unwrap();
        assert_eq!(message_text(&plain), "hello");

        let blocks: serde_json::Value = serde_json::from_str(
            r#"{"message":{"content":[
                {"type":"text","text":"first"},
                {"type":"tool_use","name":"Read"},
                {"type":"tool_result","content":"a huge file dump"},
                {"type":"text","text":"second"}
            ]}}"#,
        )
        .unwrap();

        // Tool results are dropped; the call itself is kept as one line.
        assert_eq!(message_text(&blocks), "first\n[used Read]\nsecond");
    }

    #[test]
    fn keeps_the_end_of_an_oversized_conversation_and_says_so() {
        let long = format!(
            "You:\n{}\n\nAssistant:\nthe important recent part\n\n",
            "x".repeat(MAX_TRANSCRIPT_CHARS)
        );

        let out = clamp_to_tail(long);

        assert!(out.starts_with("[Earlier part of this conversation omitted"));
        assert!(out.contains("the important recent part"));
        assert!(out.chars().count() < MAX_TRANSCRIPT_CHARS + 200);
    }

    /**
     * A manual diagnostic, not part of the suite.
     *
     * Ignored because it reads whatever is actually in ~/.claude on the machine
     * it runs on, so it can neither assert nor be relied on in CI. It exists
     * because fixtures kept agreeing with code that was wrong about real files:
     * titles read as empty for a whole afternoon because the field is `aiTitle`,
     * and active time was 4x over because sessions resume across days.
     *
     * Run with: cargo test --bin sidq real_history -- --ignored --nocapture
     */
    #[test]
    #[ignore]
    fn real_history() {
        let sessions = recent_sessions(10);
        println!("\n{} sessions\n", sessions.len());
        for s in &sessions {
            println!(
                "  turns {:>5}  active {:>5}m  {:<46} {}",
                s.turns,
                s.active_minutes,
                s.title.chars().take(46).collect::<String>(),
                s.branch
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
                None => println!("\n  no transcript resolved for {}", first.session_id),
            }
        }
    }

    #[test]
    fn strips_harness_blocks_nobody_typed() {
        let input = "You:\nreal question\n<system-reminder>ignore this</system-reminder>\nmore\n";
        let out = strip_boilerplate(input);

        assert!(out.contains("real question"));
        assert!(out.contains("more"));
        assert!(!out.contains("system-reminder"));
        assert!(!out.contains("ignore this"));
    }

    #[test]
    fn strips_several_block_kinds_in_the_order_they_appear() {
        let input = "a<command-name>x</command-name>b<system-reminder>y</system-reminder>c";
        assert_eq!(strip_boilerplate(input), "abc");
    }

    #[test]
    fn keeps_everything_when_a_tag_is_never_closed() {
        // Swallowing to end-of-string here would delete the rest of somebody's
        // conversation because one tag was malformed.
        let input = "important<system-reminder>never closed and then more text";
        let out = strip_boilerplate(input);

        assert!(out.contains("important"));
        assert!(out.contains("more text"));
    }

    #[test]
    fn keeps_the_tool_markers() {
        // 4.5% of a real transcript, and the only trace of what the assistant
        // actually did. A conversation reads as jumpy without them.
        let out = strip_boilerplate("You:\nask\n[used Read]\nAssistant:\nanswer");
        assert!(out.contains("[used Read]"));
    }

    #[test]
    fn collapses_blank_runs_left_behind() {
        assert_eq!(collapse_blank_runs("a\n\n\n\n\nb"), "a\n\nb");
        assert_eq!(collapse_blank_runs("a\n\nb"), "a\n\nb");
        assert_eq!(collapse_blank_runs("a\nb"), "a\nb");
    }

    #[test]
    fn leaves_an_ordinary_conversation_untouched() {
        // The common case must cost nothing and change nothing.
        let plain = "You:\nwhat about the retry\n\nAssistant:\nit drops the second event\n";
        assert_eq!(strip_boilerplate(plain), plain);
    }

    #[test]
    fn leaves_a_conversation_that_fits_completely_alone() {
        let text = "You:\nhi\n\nAssistant:\nhello\n\n".to_string();
        assert_eq!(clamp_to_tail(text.clone()), text);
    }
}
