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

/// What the receiving model is being asked to do.
pub struct Brief<'a> {
    pub source: &'a str,
    pub when: &'a str,
    pub project: &'a str,
    pub resume_point: &'a str,
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

fn instruction(brief: &Brief, contents: &str) -> String {
    format!(
        "You are being handed a complete record of a conversation with {source}, {when}\
{project}.{contents}\n\n\
Read all of it before replying.\n\
Do not summarise it back. The person was there; summarising spends the turn.\n\
Continue from where it stopped.\n\
Where the reasoning and the reply disagree, the reply is what was decided.\n\
Where a decision was revisited, the later one stands.\n\n\
It stopped here: {resume}",
        source = brief.source,
        when = brief.when,
        project = if brief.project.is_empty() {
            String::new()
        } else {
            format!(", working in {}", brief.project)
        },
        contents = contents,
        resume = if brief.resume_point.is_empty() {
            "no explicit last request"
        } else {
            brief.resume_point
        },
    )
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
    let instruction = instruction(brief, &contents_of(kept));

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

    fn brief() -> Brief<'static> {
        Brief {
            source: "Claude Code",
            when: "yesterday",
            project: "Sidq",
            resume_point: "carry on with the tiers",
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
        assert!(!out.contains("Vec<String>"));
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
        let brief = Brief { source: "ChatGPT", when: "today", project: "", resume_point: "" };
        let out = compile(&turns(), &brief, Target::Markdown);

        assert!(!out.contains(", working in ,"));
        assert!(out.contains("no explicit last request"));
    }
}
