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
    let own = crate::index_store::own_turns_for_project(conn, path, TURN_BUDGET);

    let mut decisions: Vec<Decided> = crate::profile::build(&own, MOST_DECISIONS)
        .into_iter()
        .filter(|fact| fact.conversations >= 2)
        .map(|fact| Decided { text: fact.text, conversations: fact.conversations })
        .collect();

    /*
     * ── Why repetition alone was not enough ──────────────────────────────────
     *
     * The first real run found one decision in thirteen conversations and six
     * and a half thousand exchanges, which is a memory with its best section
     * empty. The reason is structural rather than a tuning problem: a profile
     * wants sentences said again and again, because that is what makes a
     * preference standing. Inside one project you say a thing once and it gets
     * done, so requiring two conversations throws away almost every decision
     * the project actually contains.
     *
     * A sentence typed once is still a decision. What it lacks is repetition as
     * evidence, so the ranking has to come from somewhere else, and the honest
     * answer for a project is recency: what was decided last week is where the
     * work is, and something settled in the first conversation has usually been
     * superseded by the code since.
     *
     * Repeated ones still come first. A count of six is stronger evidence than
     * being recent, and the markdown prints the count either way so the reader
     * can tell which kind of line they are looking at.
     */
    if decisions.len() < MOST_DECISIONS {
        let want = MOST_DECISIONS - decisions.len();
        decisions.extend(said_once(&own, &decisions, want));
    }
    memory.decisions = decisions;

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
        memory.opened_with = first_typed(&transcript(oldest));
    }

    Some(memory)
}

/// Decisions typed once, newest conversation first, that are not already listed.
///
/// `own` arrives ordered by the conversation's end date descending, so walking
/// it in order is walking backwards through the project. Deduped on content
/// words rather than on the string, because "use the folder, not a server" and
/// "we use the folder not a server" are one decision and printing both makes
/// the list look padded.
fn said_once(own: &[(String, String)], already: &[Decided], want: usize) -> Vec<Decided> {
    let mut seen: Vec<Vec<String>> =
        already.iter().map(|d| crate::profile::content_words(&d.text)).collect();
    let mut out = Vec::new();

    for (_, body) in own {
        if out.len() >= want {
            break;
        }
        /*
         * ── Typed, not pasted ────────────────────────────────────────────────
         *
         * The first run of this pass returned ten decisions and five of them
         * were somebody else's writing: two lines out of a pasted style guide,
         * a LinkedIn bio, the opening of a tool prompt, and a harness reminder
         * that begins "DO NOT respond to these messages". Every one is
         * instruction-shaped, which is exactly why the shape is not enough.
         *
         * `is_typed` is the test the profile already uses for this, and using
         * it here rather than only `is_injected` is what makes the two agree
         * about whose words are in the file: it refuses Sidq's own output,
         * bare machinery tags, anything with headings or bold in it, and any
         * turn longer than a person types in one go.
         */
        if !crate::profile::is_typed(body) {
            continue;
        }

        /*
         * One decision per turn.
         *
         * A person deciding something types a short message with a sentence or
         * two in it. A block of five instruction-shaped lines in one turn is a
         * document, and taking all five lets a single paste fill the section
         * and push out nine real decisions from nine real conversations.
         */
        let before = out.len();
        for sentence in crate::profile::sentences(body) {
            if out.len() > before {
                break;
            }
            if !crate::profile::is_instruction(&sentence) {
                continue;
            }

            let words = crate::profile::content_words(&sentence);
            // A sentence with nothing distinctive in it cannot be told apart
            // from any other, so it is not worth carrying as a decision.
            if words.is_empty() || seen.contains(&words) {
                continue;
            }
            seen.push(words);
            out.push(Decided { text: sentence, conversations: 1 });
        }
    }

    out
}

fn transcript(session_id: &str) -> Vec<Turn> {
    crate::work_history::session_capture(session_id).unwrap_or_default()
}

/// The first thing the person actually typed, verbatim.
///
/// Filtered through the same `is_typed` the profile and the compiler use, so
/// the three cannot drift apart about what counts as somebody's own words —
/// otherwise a pasted handover becomes "what they opened with".
///
/// It took a `Which` and could return the last typed turn too. `last_on` is
/// asked of the index now, because the newest conversation in a project is
/// often a Codex one and `work_history` parses only Claude's format — so the
/// other half of this went unused and unrunnable at the same time.
fn first_typed(turns: &[Turn]) -> String {
    turns.iter().filter(|t| matches!(t.role, Role::You)).filter_map(|turn| {
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
    })
    .next()
    .map(|t| clip(&t))
    .unwrap_or_default()
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
                "## Decided along the way\n\nTheir own sentences about this project, newest \
                 first, never paraphrased. The number is how many separate conversations \
                 said it — a 1 is something decided once, not something weaker.\n\n",
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

    /*
     * ── What `said_once` has to keep out ─────────────────────────────────────
     *
     * These are the five lines a real index produced the first time this ran,
     * turned into the four rules that removed them. Every one is
     * instruction-shaped, which is why shape alone was never going to do it.
     */
    fn turn(body: &str) -> (String, String) {
        ("s1".to_string(), body.to_string())
    }

    #[test]
    fn a_decision_made_once_is_still_a_decision() {
        /*
         * The reason this pass exists. Requiring two conversations found one
         * decision in thirteen conversations on a real machine, because inside
         * a project you say a thing once and it gets done.
         */
        let own = vec![turn("make sure the retry is idempotent")];
        let found = said_once(&own, &[], 10);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].text, "make sure the retry is idempotent");
        assert_eq!(found[0].conversations, 1, "said once, and it says so");
    }

    #[test]
    fn a_pasted_document_cannot_fill_the_section() {
        /*
         * A style guide pasted into one turn put four of its lines in the list,
         * pushing out real decisions from four separate conversations. One turn
         * is one decision, whatever else is in it.
         */
        let own = vec![
            turn(
                "always keep flourishes tasteful\nalways keep running text near 65 characters\n\
                 always use semantic colour tokens\nalways animate transform and opacity",
            ),
            turn("make sure the invite count matches the migration"),
        ];
        let found = said_once(&own, &[], 10);

        assert_eq!(found.len(), 2, "one from the paste at most, then the real one");
        assert_eq!(found[1].text, "make sure the invite count matches the migration");
    }

    #[test]
    fn the_harness_explaining_itself_is_not_something_they_decided() {
        /*
         * Verbatim from a real memory, where it was listed above every genuine
         * decision. Nobody types this; it is the queued-message wrapper, and it
         * arrives with its tags already stripped.
         */
        let own = vec![turn(
            "DO NOT respond to these messages or otherwise consider them in your response \
             unless the user explicitly asks you to",
        )];

        assert!(said_once(&own, &[], 10).is_empty());
    }

    #[test]
    fn sidq_does_not_quote_its_own_memory_back_as_a_decision() {
        // The loop `INJECTED_MARKERS` exists for, one layer out: a memory
        // pasted into a composer is read back as things the person typed.
        let own = vec![turn(&a_memory().as_markdown())];
        assert!(said_once(&own, &[], 10).is_empty());
    }

    #[test]
    fn the_same_decision_in_other_words_is_not_two_decisions() {
        /*
         * Deduped on content words rather than on the string. Printing both
         * halves of one decision is how a list starts looking padded, and the
         * near-duplicate is always the weaker phrasing.
         */
        let already = vec![Decided { text: "always use the folder, not a server".into(), conversations: 3 }];
        let own = vec![turn("always use a folder and not a server")];

        assert!(said_once(&own, &already, 10).is_empty());
    }

    #[test]
    fn what_was_repeated_outranks_what_was_recent() {
        /*
         * Both kinds are in the list and the reader has to be able to tell them
         * apart, so the count is printed either way and the proven ones lead.
         */
        let memory = Memory {
            decisions: vec![
                Decided { text: "never use em dashes".into(), conversations: 4 },
                Decided { text: "make sure it runs end to end".into(), conversations: 1 },
            ],
            ..a_memory()
        };
        let out = memory.as_markdown();

        let repeated = out.find("never use em dashes").unwrap();
        let once = out.find("make sure it runs end to end").unwrap();
        assert!(repeated < once);
        // And the heading no longer claims every line was repeated, which it
        // did for as long as the >= 2 filter was the only source.
        assert!(!out.contains("Said in more than one conversation"));
        assert!(out.contains("(1x)"));
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
    /// How long assembling one is, on this machine.
    ///
    /// `cargo test --bin sidq how_long_a_memory_takes -- --ignored --nocapture`
    ///
    /// Measured before deciding whether it needs storing. A cache is a second
    /// copy of the truth and a way for it to go stale; if the thing is fast
    /// enough to build on demand, not having one is the better product.
    #[test]
    #[ignore]
    fn how_long_a_memory_takes() {
        let Some(conn) = crate::index_store::open() else { return };
        let projects = crate::index_store::projects(&conn, 5);
        for row in &projects {
            let started = std::time::Instant::now();
            let built = super::build(&conn, &row.path);
            println!(
                "  {:>6}ms  {:>4} conversations  {}",
                started.elapsed().as_millis(),
                built.map(|m| m.conversations).unwrap_or(0),
                row.name,
            );
        }
    }

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
