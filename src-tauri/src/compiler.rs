//! Formatting a captured conversation for the model that will read it.
//!
//! The same conversation is not the same prompt to every assistant. Claude was
//! trained with XML-delimited context and follows tag boundaries closely.
//! ChatGPT and Gemini treat markdown headings as structure. Handing all three
//! the same block of prose and hoping is what "paste your transcript in" has
//! always meant, and it is why pasted transcripts get summarised back at you
//! instead of continued.
//!
//! ── Where the instruction goes ───────────────────────────────────────────────
//! Twice: once before the conversation and once after it. The second copy is
//! not redundancy for its own sake — instructions at the very end of a long
//! context are followed considerably more reliably than instructions buried
//! before a hundred thousand tokens of material, and a handover is by
//! definition a long context. The first copy is what stops the model reading
//! two thousand lines before learning why.
//!
//! ── Why not just a summary ───────────────────────────────────────────────────
//! Because anybody can ask for one. The value here is the part that cannot be
//! asked for: reasoning the person never saw, calls that failed, and the places
//! they stopped the model mid-sentence.

use crate::capture::{Block, Role, Turn};

/**
 * How large the finished handover may be, in characters.
 *
 * Roughly 150,000 tokens: large enough to carry a long conversation whole,
 * small enough to paste into a 200k window and still leave room for an answer.
 *
 * The real conversation this was measured against compiled to 2,014,478
 * characters, which is not a handover, it is a denial of service on somebody's
 * context. With the budget it comes to 643,193.
 *
 * That is over the number, and the overshoot is real: `weight` measures the raw
 * text, and XML escaping expands every `<` in a conversation about code into
 * four characters. The budget is a ceiling on what is selected, not on what is
 * emitted. Tightening it to be exact would mean formatting twice to find out,
 * and 7% is not worth a second pass over half a megabyte.
 */
const MAX_CHARS: usize = 600_000;

/**
 * Keep the end.
 *
 * Whole turns are dropped from the front until it fits, never a fraction of
 * one: half a turn hands the next model a sentence with no speaker and no
 * conclusion. The end is what matters, because a handover is by definition a
 * request to continue from where it stopped.
 *
 * How many were dropped is stated in the output. Silently truncating somebody's
 * conversation and presenting the remainder as the whole thing is the one
 * failure here that would be worse than the file being too large.
 */
fn fit(turns: &[Turn]) -> (&[Turn], usize) {
    let mut total = 0usize;
    let mut first = turns.len();

    for (i, turn) in turns.iter().enumerate().rev() {
        total += weight(turn);
        if total > MAX_CHARS {
            break;
        }
        first = i;
    }

    (&turns[first..], first)
}

/// Roughly how many characters a turn will occupy once formatted.
fn weight(turn: &Turn) -> usize {
    turn.blocks
        .iter()
        .map(|b| match b {
            Block::Said(t) | Block::Thought(t) => t.chars().count() + 24,
            Block::Did { tool, input } => tool.chars().count() + input.chars().count() + 24,
            Block::Saw { output, .. } => output.chars().count() + 32,
            Block::Interrupted => 24,
        })
        .sum()
}

/// Which assistant is going to read this.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Target {
    /// Claude, in any surface. XML tags.
    Claude,
    /// ChatGPT, Gemini, and anything else. Markdown headings.
    Markdown,
}

impl Target {
    /// Read off the name of the assistant the conversation came from.
    ///
    /// The source is the best guess available at the point a file is written,
    /// and it is usually right: people carry a conversation onward within the
    /// same family more often than across. Wrong guesses cost formatting, not
    /// content.
    pub fn for_source(source: &str) -> Self {
        let lower = source.to_lowercase();
        if lower.contains("claude") || lower.contains("cowork") {
            Target::Claude
        } else {
            Target::Markdown
        }
    }
}

/// What the receiving model is being asked to do, and who it is talking to.
#[derive(Clone, Copy)]
pub struct Brief<'a> {
    pub source: &'a str,
    pub when: &'a str,
    pub project: &'a str,
    /// The last thing asked. Where the conversation stopped.
    pub resume_point: &'a str,
    /**
     * Standing instructions this person has given assistants, in their words.
     *
     * Carried with the conversation rather than offered as a separate thing to
     * copy. A continuation without them arrives at an assistant that knows what
     * was being built and nothing about who is building it, and re-litigates
     * every convention on the first turn.
     */
    pub profile: &'a [String],
}

/**
 * Describe what is actually in this file.
 *
 * The instruction used to promise reasoning, tool calls and interruptions every
 * time. Run against a real conversation with extended thinking switched off, it
 * announced 561 blocks of private reasoning and delivered none — which teaches
 * the receiving model that the framing is decoration and the next claim can be
 * ignored too.
 */
fn contents_of(turns: &[Turn]) -> String {
    let (mut thought, mut ran, mut stopped) = (false, false, false);
    for turn in turns {
        for block in &turn.blocks {
            match block {
                Block::Thought(_) => thought = true,
                Block::Did { .. } | Block::Saw { .. } => ran = true,
                Block::Interrupted => stopped = true,
                Block::Said(_) => {}
            }
        }
    }

    let mut parts: Vec<&str> = Vec::new();
    if thought {
        parts.push("the assistant's private reasoning, which was never shown to anyone");
    }
    if ran {
        parts.push("every tool it ran and what came back, including the failures");
    }
    if stopped {
        parts.push("the points where the person stopped it mid-answer");
    }

    match parts.len() {
        0 => String::new(),
        1 => format!(" It includes {}.", parts[0]),
        _ => {
            /*
             * Semicolons, because the clauses have commas inside them.
             * "…what came back, including the failures and the points where…"
             * reads as one item; the reader has to backtrack to find the seam.
             */
            format!(" It includes: {}.", parts.join("; "))
        }
    }
}

/**
 * Orient a model that has no idea what any of this is.
 *
 * The old version opened with "You are being handed a complete record of a
 * conversation with claude-code" and went straight into markup. That assumes
 * the reader already knows what it is looking at, what it is for, and what it
 * is allowed to do about it, and a cold model given a vague paste has none of
 * those. It also assumed the answer was always "continue coding", when the
 * conversation might be an argument about pricing, a piece of writing, or a
 * decision somebody wants a second opinion on.
 *
 * So this says four things, in the order a stranger needs them: what this is,
 * who they are talking to, where the work got to, and what they may do with it.
 * The last one is deliberately wide open. The person may want to carry on, or
 * to disagree with something in it, or to ask what you would have done — and
 * guessing narrowly is how a handover turns into a summary nobody asked for.
 *
 * Nothing here names the tool that produced the file. A model asked to react to
 * a product name it has never heard of will ask what the product is instead of
 * reading what it was given.
 */
fn instruction(brief: &Brief, contents: &str, arc: &str, has_reasoning: bool) -> String {
    let mut out = String::new();

    out.push_str(
        "WHAT THIS IS\n\n\
A complete record of a conversation that happened somewhere else, given to you \
so it can carry on here. ",
    );
    out.push_str(&format!(
        "It was between the person you are talking to now and {}, {}",
        brief.source, brief.when
    ));
    if !brief.project.is_empty() {
        out.push_str(&format!(", working on {}", brief.project));
    }
    out.push_str(".");
    out.push_str(contents);
    out.push_str(
        "\n\nThey were there for all of it. Do not summarise it back to them; \
that spends the turn on something they already know.\n",
    );

    if !brief.profile.is_empty() {
        out.push_str(
            "\nWHO YOU ARE TALKING TO\n\n\
Standing instructions this person has given assistants before, in their own \
words. Apply them here unless they say otherwise.\n\n",
        );
        for rule in brief.profile {
            out.push_str(&format!("- {rule}\n"));
        }
    }

    out.push_str("\nWHERE IT GOT TO\n\n");
    out.push_str(arc);
    /*
     * The resume point, unless the arc already ends on it.
     *
     * They come from the same place most of the time, and printing both gave
     * "By the end they were on: X" followed immediately by "The last thing they
     * asked was: X" — which reads as a file padding itself.
     */
    let resume = brief.resume_point.trim();
    let already = !resume.is_empty()
        && arc.contains(&resume.chars().take(60).collect::<String>());
    if !resume.is_empty() && !already {
        out.push_str(&format!("\n\nThe last thing they asked was: {resume}"));
    }

    out.push_str(
        "\n\nWHAT YOU CAN DO WITH IT\n\n\
Whatever they ask for next. Most often that is picking the work up from where \
it stopped, so if they say nothing in particular, do that and say what you \
would do next.\n\n\
But do not assume this is a coding task, or a task at all. They may want to \
argue with a decision in here, ask what you would have done differently, take \
the thinking somewhere new, or simply talk about it. Answer what they actually \
ask.\n\n\
Where a decision was revisited later, the later one stands.\n",
    );

    /*
     * Only said when there is reasoning to say it about.
     *
     * This sentence used to be unconditional, which meant a handover carrying
     * no reasoning still told the model how to weigh reasoning against replies
     * — instructions about material that is not in the file, which is the same
     * class of mistake as announcing contents that are not there.
     */
    if has_reasoning {
        out.push_str(
            "\nSome of what follows is the assistant's private reasoning, marked as \
not visible. The person never read it. Where it disagrees with what was \
actually replied, the reply is what was decided, and do not quote the reasoning \
back to them as though they had seen it.\n",
        );
    }

    out
}

/**
 * Where the conversation started, and where it ended.
 *
 * Both taken verbatim from the person's own turns. A conversation that opens
 * with "help me name the tiers" and closes on "the refund wording is wrong" has
 * travelled, and a model that only sees the end will carry on down a branch
 * that was abandoned two hours earlier.
 */
fn arc_of(turns: &[Turn]) -> String {
    /*
     * Only what a person typed.
     *
     * Assistants inject a great deal into the user's side of a transcript, and
     * the first record in a resumed conversation is very often one of them.
     * Without this filter a real handover opened with "It opened with:
     * <task-notification><task-id>bud0xytj7</task-id>…", which tells the next
     * model nothing except that the file is full of machinery.
     *
     * Same test the memory profile uses, so the two cannot drift apart about
     * what counts as somebody's own words.
     */
    let said = |turn: &Turn| -> Option<String> {
        turn.blocks.iter().find_map(|b| match b {
            Block::Said(t) if !t.trim().is_empty() && crate::profile::is_typed(t) => {
                Some(t.trim().chars().take(200).collect::<String>())
            }
            _ => None,
        })
    };

    let mine: Vec<String> = turns
        .iter()
        .filter(|t| t.role == Role::You)
        .filter_map(said)
        .collect();

    let exchanges = format!(
        "{} exchange{}.",
        turns.len(),
        if turns.len() == 1 { "" } else { "s" }
    );

    match (mine.first(), mine.last()) {
        (Some(first), Some(last)) if mine.len() > 1 => format!(
            "It opened with: {first}\n\nBy the end they were on: {last}\n\n{exchanges}"
        ),
        (Some(only), _) => format!("It began and stayed on: {only}\n\n{exchanges}"),
        _ => exchanges,
    }
}

fn role_name(role: &Role) -> &'static str {
    match role {
        Role::You => "person",
        Role::Assistant => "assistant",
    }
}

/// Escape the three characters that would otherwise close a tag early.
///
/// Conversations about code contain `<` and `&` constantly, and one unescaped
/// angle bracket turns the rest of the document into malformed markup that the
/// receiving model has to guess its way through.
fn escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

fn claude_body(turns: &[Turn]) -> String {
    let mut out = String::new();
    out.push_str("<conversation>\n");

    for turn in turns {
        out.push_str(&format!("<turn from=\"{}\">\n", role_name(&turn.role)));
        for block in &turn.blocks {
            match block {
                Block::Said(text) => {
                    out.push_str(&format!("<said>{}</said>\n", escape(text)));
                }
                Block::Thought(text) => {
                    // Tagged as unseen so the model knows this was never part of
                    // the exchange and must not be quoted back as if it were.
                    out.push_str(&format!(
                        "<reasoning visible=\"false\">{}</reasoning>\n",
                        escape(text)
                    ));
                }
                Block::Did { tool, input } => {
                    out.push_str(&format!(
                        "<ran tool=\"{}\">{}</ran>\n",
                        escape(tool),
                        escape(input)
                    ));
                }
                Block::Saw { output, failed, .. } => {
                    out.push_str(&format!(
                        "<returned failed=\"{failed}\">{}</returned>\n",
                        escape(output)
                    ));
                }
                Block::Interrupted => {
                    out.push_str("<stopped-by-person/>\n");
                }
            }
        }
        out.push_str("</turn>\n");
    }

    out.push_str("</conversation>\n");
    out
}

fn markdown_body(turns: &[Turn]) -> String {
    let mut out = String::new();

    for turn in turns {
        out.push_str(&format!("## {}\n\n", role_name(&turn.role)));
        for block in &turn.blocks {
            match block {
                Block::Said(text) => out.push_str(&format!("{text}\n\n")),
                Block::Thought(text) => {
                    out.push_str(&format!("**Reasoning (never shown):**\n{text}\n\n"))
                }
                Block::Did { tool, input } => {
                    out.push_str(&format!("**Ran `{tool}`:** `{input}`\n\n"))
                }
                Block::Saw { output, failed, .. } => out.push_str(&format!(
                    "**{}:**\n```\n{output}\n```\n\n",
                    if *failed { "Failed" } else { "Returned" }
                )),
                Block::Interrupted => out.push_str("**The person stopped it here.**\n\n"),
            }
        }
    }

    out
}

/// The finished file.
pub fn compile(turns: &[Turn], brief: &Brief, target: Target) -> String {
    let (kept, dropped) = fit(turns);
    // Described from what survived the budget, not from the original: a turn
    // that was dropped is not in the file and must not be announced as if it
    // were.
    let has_reasoning = kept
        .iter()
        .any(|t| t.blocks.iter().any(|b| matches!(b, Block::Thought(_))));

    /*
     * The brief now quotes the person's own words — how the conversation opened,
     * how it ended, and their standing instructions. Those go inside
     * `<instructions>`, so for the XML target they need escaping exactly like
     * the conversation does. One `Vec<String>` in somebody's opening message
     * closed the tag early and the rest of the brief became malformed markup.
     */
    let escaped: Vec<String>;
    let quoted = match target {
        Target::Claude => {
            escaped = brief.profile.iter().map(|r| escape(r)).collect();
            Brief { profile: &escaped, ..*brief }
        }
        Target::Markdown => Brief { profile: brief.profile, ..*brief },
    };
    let arc = match target {
        Target::Claude => escape(&arc_of(kept)),
        Target::Markdown => arc_of(kept),
    };

    let instruction = instruction(&quoted, &contents_of(kept), &arc, has_reasoning);

    let mut body = match target {
        Target::Claude => claude_body(kept),
        Target::Markdown => markdown_body(kept),
    };

    if dropped > 0 {
        // Said at the top, where the model reads it before the first turn and
        // knows the conversation has a beginning it cannot see.
        let note = format!(
            "The first {dropped} turns of this conversation are not included; \
it was too long to carry whole. What follows is everything after them.\n\n"
        );
        body = match target {
            Target::Claude => format!("<truncated>{}</truncated>\n{body}", escape(note.trim())),
            Target::Markdown => format!("_{}_\n\n{body}", note.trim()),
        };
    }

    match target {
        Target::Claude => format!(
            "<handover>\n<instructions>\n{instruction}\n</instructions>\n\n{body}\n\
<instructions>\n{instruction}\n</instructions>\n</handover>\n"
        ),
        Target::Markdown => format!(
            "# Continue this conversation\n\n{instruction}\n\n---\n\n{body}\n---\n\n\
# Reminder\n\n{instruction}\n"
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RULES: [&str; 1] = ["never use em dashes in the copy"];

    fn brief() -> Brief<'static> {
        Brief {
            source: "Claude Code",
            when: "yesterday",
            project: "Sidq",
            resume_point: "carry on with the tiers",
            profile: &[],
        }
    }

    fn turns() -> Vec<Turn> {
        vec![
            Turn { role: Role::You, blocks: vec![Block::Said("fix the ranking".into())] },
            Turn {
                role: Role::Assistant,
                blocks: vec![
                    Block::Thought("recency alone would rank the mango note first".into()),
                    Block::Did { tool: "Read".into(), input: "{\"path\":\"a.rs\"}".into() },
                    Block::Saw { tool_use_id: "t1".into(), output: "ok".into(), failed: false },
                    Block::Said("Weighted by substance instead.".into()),
                ],
            },
            Turn { role: Role::You, blocks: vec![Block::Interrupted] },
        ]
    }

    #[test]
    fn claude_gets_xml_and_chatgpt_gets_markdown() {
        let x = compile(&turns(), &brief(), Target::Claude);
        let m = compile(&turns(), &brief(), Target::Markdown);

        assert!(x.contains("<conversation>") && x.contains("<turn from=\"person\">"));
        assert!(!m.contains("<conversation>"));
        assert!(m.contains("## person"));
    }

    #[test]
    fn the_reasoning_travels_and_is_marked_as_unseen() {
        /*
         * The single reason this exists. It must arrive, and it must be labelled
         * — a model that mistakes private reasoning for something that was said
         * will quote it back to a person who never read it.
         */
        for target in [Target::Claude, Target::Markdown] {
            let out = compile(&turns(), &brief(), target);
            assert!(out.contains("mango note first"), "reasoning must survive");
            assert!(
                out.contains("visible=\"false\"") || out.contains("never shown"),
                "and be marked unseen"
            );
        }
    }

    #[test]
    fn the_interruption_survives() {
        // Where somebody stopped the model is the clearest statement in the
        // file of what they did not want.
        assert!(compile(&turns(), &brief(), Target::Claude).contains("<stopped-by-person/>"));
        assert!(compile(&turns(), &brief(), Target::Markdown).contains("stopped it here"));
    }

    #[test]
    fn the_instruction_appears_at_both_ends() {
        /*
         * The copy at the end is the one that gets followed. An instruction
         * sitting before a hundred thousand tokens of conversation competes
         * with all of it; the same words after the material do not.
         */
        for target in [Target::Claude, Target::Markdown] {
            let out = compile(&turns(), &brief(), target);
            assert_eq!(out.matches("Do not summarise it back").count(), 2, "{target:?}");
        }
    }

    #[test]
    fn angle_brackets_in_code_do_not_break_the_markup() {
        /*
         * Conversations about code are full of `<` and `&`. One unescaped
         * bracket turns the rest of the document into malformed markup the
         * receiving model has to guess its way through.
         */
        let turns = vec![Turn {
            role: Role::You,
            blocks: vec![Block::Said("use Vec<String> & not a slice".into())],
        }];
        let out = compile(&turns, &brief(), Target::Claude);

        assert!(out.contains("Vec&lt;String&gt; &amp; not"));
        // Twice over: the conversation body, and the brief, which quotes how
        // the conversation opened.
        assert!(!out.contains("Vec<String>"), "not in the body and not in the brief");
    }

    #[test]
    fn an_oversized_conversation_keeps_the_end_and_says_what_it_dropped() {
        /*
         * Measured, not hypothetical: the largest conversation on the machine
         * this was built on compiled to 2,014,478 characters, which is not a
         * handover but a denial of service on somebody's context window.
         *
         * The end is what a handover is for. Dropping from the front is right;
         * dropping silently is not.
         */
        let big = "x".repeat(20_000);
        let many: Vec<Turn> = (0..80)
            .map(|i| Turn {
                role: Role::Assistant,
                blocks: vec![Block::Said(format!("turn {i} {big}"))],
            })
            .chain(std::iter::once(Turn {
                role: Role::You,
                blocks: vec![Block::Said("the last thing said".into())],
            }))
            .collect();

        let out = compile(&many, &brief(), Target::Markdown);

        assert!(out.chars().count() < MAX_CHARS + 4_000, "must fit the budget");
        assert!(out.contains("the last thing said"), "the end has to survive");
        assert!(out.contains("are not included"), "and it must say so");
        assert!(!out.contains("turn 0 "), "the front is what goes");
    }

    #[test]
    fn a_conversation_that_fits_is_not_touched() {
        let out = compile(&turns(), &brief(), Target::Markdown);
        assert!(!out.contains("not included"));
    }

    #[test]
    fn a_claude_conversation_is_compiled_for_claude() {
        assert_eq!(Target::for_source("claude-code"), Target::Claude);
        assert_eq!(Target::for_source("Cowork"), Target::Claude);
        assert_eq!(Target::for_source("ChatGPT"), Target::Markdown);
        assert_eq!(Target::for_source("Cursor"), Target::Markdown);
    }

    #[test]
    fn the_instruction_names_where_it_stopped() {
        // An unanswered last question is a better starting point than a topic.
        assert!(compile(&turns(), &brief(), Target::Claude).contains("carry on with the tiers"));
    }

    #[test]
    fn it_never_names_the_tool_that_produced_it() {
        /*
         * Tested against a real failure. A handover reached Gemini and it
         * replied by asking what "sidq" was and offering that it might be a
         * typo for "sql" — reacting to a product name instead of reading what
         * it had been given.
         */
        let neutral = Brief { project: "the pricing page", ..brief() };
        for target in [Target::Claude, Target::Markdown] {
            let out = compile(&turns(), &neutral, target);
            // The brief explains itself from first principles instead of naming
            // a product and hoping the reader recognises it.
            assert!(out.contains("WHAT THIS IS"));
            assert!(out.contains("a conversation that happened somewhere else"));
            assert!(!out.to_lowercase().contains("sidq"));
        }
    }

    #[test]
    fn it_says_who_the_person_is_and_not_only_what_they_were_doing() {
        /*
         * A continuation without the standing instructions arrives at an
         * assistant that knows what was being built and nothing about who is
         * building it, and re-litigates every convention on the first turn.
         */
        let rules: Vec<String> = RULES.iter().map(|s| s.to_string()).collect();
        let brief = Brief {
            source: "Claude Code", when: "yesterday", project: "Sidq",
            resume_point: "carry on with the tiers", profile: &rules,
        };

        let out = compile(&turns(), &brief, Target::Markdown);
        assert!(out.contains("WHO YOU ARE TALKING TO"));
        assert!(out.contains("never use em dashes in the copy"));
    }

    #[test]
    fn it_says_where_the_conversation_started_and_where_it_ended() {
        /*
         * A conversation that opens on naming and closes on refunds has
         * travelled. A model shown only the end carries on down a branch that
         * was abandoned two hours earlier.
         */
        let travelled = vec![
            Turn { role: Role::You, blocks: vec![Block::Said("help me name the tiers".into())] },
            Turn { role: Role::Assistant, blocks: vec![Block::Said("Free, Pro, Duo.".into())] },
            Turn { role: Role::You, blocks: vec![Block::Said("the refund wording is wrong".into())] },
        ];

        let out = compile(&travelled, &brief(), Target::Markdown);
        assert!(out.contains("It opened with: help me name the tiers"));
        assert!(out.contains("By the end they were on: the refund wording is wrong"));
        assert!(out.contains("3 exchanges."));
    }

    #[test]
    fn the_arc_skips_machinery_injected_into_the_persons_turns() {
        /*
         * From a real handover. Assistants put task notifications, skill files
         * and command output into the user's side of a transcript, and the
         * first record of a resumed conversation is usually one of them, so the
         * brief opened with "<task-notification><task-id>bud0xytj7</task-id>…".
         */
        let noisy = vec![
            Turn {
                role: Role::You,
                blocks: vec![Block::Said("<system-reminder>\ncarry on".into())],
            },
            Turn { role: Role::You, blocks: vec![Block::Said("fix the ranking please".into())] },
            Turn { role: Role::You, blocks: vec![Block::Said("now ship it".into())] },
        ];

        let out = compile(&noisy, &brief(), Target::Markdown);

        // The body still carries the reminder, because the body carries
        // everything. It is the brief that must not open on it.
        assert!(out.contains("It opened with: fix the ranking please"));
        assert!(!out.contains("It opened with: <system-reminder>"));
    }

    #[test]
    fn it_does_not_repeat_the_last_thing_twice() {
        // "By the end they were on: X" followed by "The last thing they asked
        // was: X" reads as a file padding itself.
        let brief = Brief { resume_point: "the refund wording is wrong", ..brief() };
        let travelled = vec![
            Turn { role: Role::You, blocks: vec![Block::Said("help me name the tiers".into())] },
            Turn { role: Role::You, blocks: vec![Block::Said("the refund wording is wrong".into())] },
        ];

        let out = compile(&travelled, &brief, Target::Markdown);
        assert!(out.contains("By the end they were on: the refund wording is wrong"));
        assert!(!out.contains("The last thing they asked"), "it is already directly above");
    }

    #[test]
    fn it_does_not_assume_the_conversation_was_about_code() {
        // It might be an argument about pricing, a piece of writing, or a
        // decision somebody wants a second opinion on.
        let out = compile(&turns(), &brief(), Target::Markdown);
        assert!(out.contains("do not assume this is a coding task"));
        assert!(out.contains("argue with a decision"));
    }

    #[test]
    fn it_only_promises_what_the_file_actually_contains() {
        /*
         * Measured against a real conversation with extended thinking off: the
         * instruction announced private reasoning and delivered none. A model
         * that catches the framing lying once has no reason to believe the rest
         * of it.
         */
        let spoken = vec![Turn {
            role: Role::You,
            blocks: vec![Block::Said("just a question".into())],
        }];
        let out = compile(&spoken, &brief(), Target::Markdown);
        assert!(!out.contains("private reasoning"), "there is none in this file");
        assert!(!out.contains("It includes"));
        assert!(!out.contains("not visible"), "no guidance about absent material");

        // And the full case still says all three.
        let rich = compile(&turns(), &brief(), Target::Markdown);
        assert!(rich.contains("private reasoning"));
        assert!(rich.contains("every tool it ran"));
        assert!(rich.contains("stopped it mid-answer"));
    }

    #[test]
    fn it_lists_only_the_kinds_that_are_present() {
        // Tools but no thinking: the commonest real case.
        let tools = vec![Turn {
            role: Role::Assistant,
            blocks: vec![
                Block::Did { tool: "Read".into(), input: "{}".into() },
                Block::Said("done".into()),
            ],
        }];
        let out = compile(&tools, &brief(), Target::Markdown);

        assert!(out.contains("every tool it ran"));
        assert!(!out.contains("private reasoning"));
        assert!(!out.contains(" and ."), "no dangling conjunction");
    }

    #[test]
    fn an_empty_project_does_not_leave_a_dangling_comma() {
        let brief = Brief {
            source: "ChatGPT", when: "today", project: "", resume_point: "", profile: &[],
        };
        let out = compile(&turns(), &brief, Target::Markdown);

        assert!(!out.contains(", working on ."));
        assert!(!out.contains("The last thing they asked"));
    }
}
