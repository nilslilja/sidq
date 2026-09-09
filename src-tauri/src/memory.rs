//! What you are working on, assembled from your own words.
//!
//! ── Why this is not a summary ────────────────────────────────────────────────
//!
//! Every line here is a sentence somebody actually typed, returned verbatim,
//! with the number of conversations it came from beside it. Nothing is
//! paraphrased and nothing is generated, for the same reason `profile` gives:
//! the value of "the retry has to be idempotent" is that it is the exact
//! sentence, and a model rewriting it into "prefers safe retries" has destroyed
//! the only thing worth carrying.
//!
//! It also means no model is involved, so it costs nothing to run, works with
//! the wifi off, and nothing leaves the machine.
//!
//! ── Why it is per project and not per conversation ───────────────────────────
//!
//! A handover carries one conversation, which is the right unit when you know
//! which one you want. Most of the time you do not: the thing you are working on
//! is spread over nine conversations in four assistants, and no single one of
//! them is the answer to "where was I".
//!
//! ── The inverted predicate ───────────────────────────────────────────────────
//!
//! `profile` deliberately discards repetition inside one project — its comment
//! calls that a task rather than a preference, and it is right, for a profile.
//! A project memory wants exactly the tasks. Same machinery, keyed by
//! conversation instead of by project, which is the whole difference.

use crate::capture::{Block, Role, Turn};

/// Conversation names carried. A glance at what this has involved, not a log.
const MOST_TITLES: usize = 12;

/// Conversations read for one project's memory. Beyond this it is history.
const MOST_CONVERSATIONS: usize = 40;

/// Turns fed to the sentence grouper. Matches `profile`'s own budget.
const TURN_BUDGET: usize = 4_000;

/// Decisions carried. More than a profile's, because this is one subject.
const MOST_DECISIONS: usize = 10;

/// What Sidq knows about one thing somebody is building.
#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    /// What a person calls it.
    pub name: String,
    /// Full path, which is the identity.
    pub path: String,
    /// The first thing they asked, in the earliest conversation about it.
    pub opened_with: String,
    /// The last thing they asked, in the most recent one.
    pub last_on: String,
    /// Sentences they kept repeating while building this, and how often.
    ///
    /// Deliberately few. `profile::is_instruction` is strict, and over one
    /// project most of what gets said is the work rather than a rule about it —
    /// on a real 6,428-turn project this found one. That is the honest number,
    /// and `recent_work` is what carries the rest.
    pub decisions: Vec<Decided>,
    /// What the conversations were called, newest first.
    pub recent_work: Vec<String>,
    /// Which assistants this was built in.
    pub assistants: Vec<String>,
    pub conversations: usize,
    pub turns: usize,
    pub minutes: usize,
}

/// One thing decided about this project, and the evidence for it.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Decided {
    pub text: String,
    /// How many separate conversations it was said in. The count is the proof.
    pub conversations: usize,
}

/// Assemble the memory for one project. Reads, computes, writes nothing.
pub fn build(conn: &rusqlite::Connection, path: &str) -> Option<Memory> {
    let row = crate::index_store::projects(conn, 200)
        .into_iter()
        .find(|p| p.path == path)?;

    let mut memory = Memory {
        name: row.name,
        path: path.to_string(),
        conversations: row.conversations,
        turns: row.turns,
        minutes: row.minutes,
        assistants: crate::index_store::assistants_for_project(conn, path),
        recent_work: crate::index_store::titles_for_project(conn, path, MOST_TITLES),
        ..Default::default()
    };

    /*
     * Decisions: the same grouping the profile uses, pointed at one project and
     * keyed by conversation. A sentence said in six conversations about this
     * thing is a decision about this thing.
     */
    memory.decisions = crate::profile::build(
        &crate::index_store::own_turns_for_project(conn, path, TURN_BUDGET),
        MOST_DECISIONS,
    )
    .into_iter()
    .filter(|fact| fact.conversations >= 2)
    .map(|fact| Decided { text: fact.text, conversations: fact.conversations })
    .collect();

    /*
     * The arc, across the project rather than across one conversation.
     *
     * Newest first out of the index, so the last thing asked is at the front and
     * the earliest is at the back.
     */
    let sessions = crate::index_store::sessions_for_project(conn, path, MOST_CONVERSATIONS);
    /*
     * Asked of the index rather than of the newest transcript.
     *
     * Reading it back out of the file returned nothing, because the newest
     * conversation in this project is a Codex one and `work_history` only parses
     * Claude's format. The digest has the answer for every source the picker can
     * list, which is all of them.
     */
    memory.last_on = clip(&crate::index_store::last_prompt_for_project(conn, path));
    if let Some((oldest, _)) = sessions.last() {
        memory.opened_with = first_typed(&transcript(oldest), Which::First);
    }

    Some(memory)
}

fn transcript(session_id: &str) -> Vec<Turn> {
    crate::work_history::session_capture(session_id).unwrap_or_default()
}

enum Which {
    First,
    Last,
}

/// The first or last thing the person actually typed, verbatim.
///
/// Filtered through the same `is_typed` the profile and the compiler use, so
/// the three cannot drift apart about what counts as somebody's own words —
/// otherwise a pasted handover becomes "what they opened with".
fn first_typed(turns: &[Turn], which: Which) -> String {
    let mut said = turns.iter().filter(|t| matches!(t.role, Role::You)).filter_map(|turn| {
        let text: String = turn
            .blocks
            .iter()
            .filter_map(|b| match b {
                Block::Said(t) => Some(t.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join(" ");
        crate::profile::is_typed(&text).then_some(text)
    });

    let picked = match which {
        Which::First => said.next(),
        Which::Last => said.last(),
    };
    picked.map(|t| clip(&t)).unwrap_or_default()
}

/// Long enough to recognise, short enough that a memory is not a transcript.
fn clip(text: &str) -> String {
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() <= 200 {
        return flat;
    }
    flat.chars().take(200).collect::<String>().trim_end().to_string() + "…"
}

/*
 * ── What was here, and why it is not ─────────────────────────────────────────
 *
 * Interruptions and failed tools were both read as project signals, on the
 * strength of `capture`'s own comments calling them the most informative things
 * in a transcript. Run against this machine they were noise, and the diagnostic
 * is the only reason that was found before anybody saw it.
 *
 * Interruptions: in an agentic transcript the person redirects constantly, so
 * every ordinary instruction came back filed under "where they stopped it". The
 * printed list was five normal prompts, none of them a rejection of anything.
 *
 * Failed tools: the top entries were `Bash` 39 times and `ExitPlanMode` 8. Those
 * are facts about a harness, not about the work — `ExitPlanMode` "failing" is
 * somebody declining a plan. A count of tool names tells the next assistant
 * nothing it can act on.
 *
 * Both stay in `capture` and both still feed `selection`, where they are
 * genuinely load-bearing. They are just not what a project is about.
 */

/// The marker that opens every memory, and the reason it is a fixed string.
///
/// `profile` keeps a list of these because Sidq reads its own output back: paste
/// something into a composer, and the screen reader picks it up a few seconds
/// later attributed to the person who pasted it. Without this line in that list,
/// a memory delivered into ChatGPT becomes "things Nils typed", feeds the next
/// memory, and compounds.
pub const HEADER: &str = "# What I am working on";

impl Memory {
    /**
     * The memory as a person and an assistant both read it.
     *
     * Markdown, and legible, for the same reason the team folder is: this is
     * going to leave the machine the moment somebody puts it in front of an
     * assistant, and they should be able to read every word of it first.
     *
     * Quoted throughout. The counts are not decoration — they are why a line is
     * here, and an assistant that can see "said in 6 conversations" can weigh it
     * against something said once.
     */
    pub fn as_markdown(&self) -> String {
        let mut out = format!("{HEADER}: {}\n\n", self.name);

        out.push_str(&format!(
            "{} conversations across {}, {} exchanges, about {} hours of work.\n\n",
            self.conversations,
            if self.assistants.is_empty() {
                "one assistant".to_string()
            } else {
                self.assistants.join(", ")
            },
            self.turns,
            self.minutes / 60,
        ));

        if !self.opened_with.is_empty() {
            out.push_str(&format!("It started with: {}\n\n", self.opened_with));
        }
        if !self.last_on.is_empty() {
            out.push_str(&format!("Where it got to: {}\n\n", self.last_on));
        }

        if !self.recent_work.is_empty() {
            out.push_str("## What has been worked on\n\n");
            for title in &self.recent_work {
                out.push_str(&format!("- {title}\n"));
            }
            out.push('\n');
        }

        if !self.decisions.is_empty() {
            out.push_str(
                "## Decided along the way\n\nSaid in more than one conversation about this \
                 project, in their own words. The count is how many.\n\n",
            );
            for d in &self.decisions {
                out.push_str(&format!("- {} ({}x)\n", d.text, d.conversations));
            }
            out.push('\n');
        }

        out.push_str(
            "Nothing above was generated. Every line is quoted from conversations already \
             on this machine.\n",
        );
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn a_memory() -> Memory {
        Memory {
            name: "Sidq".into(),
            path: "/w/Sidq".into(),
            opened_with: "build the whole thing".into(),
            last_on: "ship the release".into(),
            decisions: vec![Decided { text: "never use em dashes".into(), conversations: 4 }],
            recent_work: vec!["Pricing page copy".into()],
            assistants: vec!["claude-code".into()],
            conversations: 13,
            turns: 6429,
            minutes: 240,
        }
    }

    #[test]
    fn it_carries_the_count_because_the_count_is_the_evidence() {
        // Same rule the profile is built on: a quoted line with a number beside
        // it can be checked. A claim about somebody cannot.
        let out = a_memory().as_markdown();
        assert!(out.contains("never use em dashes (4x)"));
    }

    #[test]
    fn it_says_it_is_quoted_rather_than_written() {
        let out = a_memory().as_markdown();
        assert!(out.contains("Nothing above was generated"));
    }

    #[test]
    fn it_opens_on_the_marker_that_stops_sidq_eating_it() {
        /*
         * The loop this closes is already documented in `profile`: Sidq reads
         * its own output back out of the composer it was pasted into. The header
         * has to be both fixed and listed there, or a memory becomes "things
         * they typed" and feeds the next one.
         */
        assert!(a_memory().as_markdown().starts_with(HEADER));
        assert!(
            crate::profile::is_injected(&a_memory().as_markdown()),
            "the profile has to recognise a memory as machinery, not as speech"
        );
    }

    #[test]
    fn an_empty_project_still_reads_as_a_sentence() {
        let out = Memory { name: "Thing".into(), ..Default::default() }.as_markdown();
        assert!(out.contains("0 conversations"));
        assert!(!out.contains("It started with"));
    }
}

#[cfg(test)]
mod diagnostics {
    /**
     * The memory for the biggest thing on this machine, printed.
     *
     * `cargo test --bin sidq real_memory -- --ignored --nocapture`
     *
     * Ignored, like the other diagnostics here, and for the reason `profile`
     * gives about its own: a memory that is subtly wrong looks exactly like one
     * that is right until somebody reads it. This is the only way to read it
     * before it is put in front of an assistant.
     */
    #[test]
    #[ignore]
    fn real_memory() {
        let Some(conn) = crate::index_store::open() else {
            println!("no index on this machine");
            return;
        };

        // A pass first, so project_path is populated on rows written before the
        // column existed.
        crate::indexer::sweep(&conn);

        let projects = crate::index_store::projects(&conn, 10);
        if projects.is_empty() {
            println!("no project has been indexed yet");
            return;
        }

        println!("\n=== projects Sidq can see ===");
        for p in &projects {
            println!("  {:>4} turns  {:>3} conversations  {}", p.turns, p.conversations, p.path);
        }

        let Some(memory) = super::build(&conn, &projects[0].path) else { return };
        println!("\n=== {} ===", memory.name);
        println!("{} conversations, {} turns, {} minutes, in {}",
            memory.conversations, memory.turns, memory.minutes, memory.assistants.join(" and "));
        println!("\nopened with: {}", memory.opened_with);
        println!("last on:     {}", memory.last_on);

        println!("\nrecent work ({}):", memory.recent_work.len());
        for w in &memory.recent_work {
            println!("  {w}");
        }

        println!("\ndecided ({}):", memory.decisions.len());
        for d in &memory.decisions {
            println!("  [{}x] {}", d.conversations, d.text);
        }
    }
}
