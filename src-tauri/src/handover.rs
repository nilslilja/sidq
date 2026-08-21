//! The instruction that turns a transcript into a handover.
//!
//! This is the difference between the product working and not working, and it
//! was missing. A conversation was pasted into Gemini and Gemini replied with
//! commentary on the conversation rather than continuing the work — because
//! nothing told it that continuing the work was the job. A model handed a
//! hundred thousand characters and no instruction has no reason to guess.
//!
//! Without this file Sidq is a copy button. With it, the receiving model knows
//! what it is holding, where the work stopped, and what is expected next.
//!
//! ── Why these particular sentences ───────────────────────────────────────────
//! Every line earns its place against a specific failure:
//!
//!   - Naming the source stops the model treating the transcript as something
//!     the user wrote to it just now.
//!   - "Read all of it before replying" is there because the common failure is a
//!     model answering off the last paragraph alone.
//!   - "Do not summarise it back to me" is the one that fixes what happened.
//!     Handed a long document, models reliably open by recapping it, which
//!     wastes the turn and tells the person nothing they do not know.
//!   - Stating the resume point gives it a concrete first move, which is what
//!     stops the reply being a polite offer to help.
//!
//! It stays short on purpose. This is prepended to conversations that are already
//! enormous, and every word is one the person pays for.

/// What is known about the conversation being handed over.
pub struct Handover<'a> {
    /// "Claude Code", "Cursor", "ChatGPT". Named so the model knows the origin.
    pub source: &'a str,
    /// The conversation's own title.
    pub title: &'a str,
    /// Where it stopped: the last thing asked, or the title if there is nothing better.
    pub resume_point: &'a str,
    /// Human phrasing of when, e.g. "earlier today". Empty is fine.
    pub when: &'a str,
    /// Project or folder, when there is one.
    pub project: &'a str,
}

/// Turn the source name into something a model reads as a product, not a slug.
fn readable_source(source: &str) -> &str {
    match source {
        "claude-code" => "Claude Code",
        "cursor" => "Cursor",
        "chatgpt" => "ChatGPT",
        "gemini" => "Gemini",
        _ => source,
    }
}

/**
 * The preamble, followed by the transcript.
 *
 * Markdown because every assistant renders it and the heading levels give the
 * model a clear boundary between the instruction and the conversation. A plain
 * wall of text invites it to read the instruction as part of the transcript.
 */
pub fn wrap(meta: &Handover, transcript: &str) -> String {
    let source = readable_source(meta.source);

    let mut out = String::with_capacity(transcript.len() + 600);

    out.push_str("# Continue this conversation\n\n");

    out.push_str(&format!(
        "Below is a complete conversation I had with **{source}**"
    ));
    if !meta.when.trim().is_empty() {
        out.push_str(&format!(", {}", meta.when.trim()));
    }
    if !meta.project.trim().is_empty() {
        out.push_str(&format!(", working in `{}`", meta.project.trim()));
    }
    out.push_str(".\n\n");

    out.push_str("**What I need from you:**\n\n");
    out.push_str("- Read the whole thing before you reply. The important decisions are spread through it, not collected at the end.\n");
    out.push_str("- Do not summarise it back to me. I was there. Summarising it wastes the turn.\n");
    out.push_str("- Pick it up and carry on from where it stopped.\n");
    out.push_str("- Where we changed our minds, the later decision is the one that stands.\n\n");

    /*
     * The resume point, stated separately.
     *
     * A model given only "continue" tends to open by asking what to work on,
     * which is the question the transcript already answers. Naming the thread
     * explicitly is what produces a first reply that does something.
     */
    let resume = meta.resume_point.trim();
    if !resume.is_empty() {
        out.push_str(&format!(
            "**Where it stopped:** {}\n\n",
            first_line(resume)
        ));
    }

    if !meta.title.trim().is_empty() {
        out.push_str(&format!("**Conversation:** {}\n\n", meta.title.trim()));
    }

    out.push_str("---\n\n");
    out.push_str(transcript);
    out
}

/**
 * First line only, trimmed to something readable.
 *
 * Last prompts are frequently several paragraphs of thinking out loud. The first
 * line carries the intent; the rest is context the transcript below already has.
 */
fn first_line(text: &str) -> String {
    let line = text.lines().find(|l| !l.trim().is_empty()).unwrap_or("").trim();
    if line.chars().count() > 160 {
        let cut: String = line.chars().take(159).collect();
        format!("{}…", cut.trim_end())
    } else {
        line.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta() -> Handover<'static> {
        Handover {
            source: "claude-code",
            title: "Fix the retry that drops the second event",
            resume_point: "the retry still drops the second event when the queue is empty",
            when: "earlier today",
            project: "Sidq",
        }
    }

    #[test]
    fn says_the_four_things_that_fix_the_failure() {
        let out = wrap(&meta(), "You:\nhello\n");

        // Each of these maps to a specific way the handover failed without it.
        assert!(out.contains("Claude Code"), "must name the source");
        assert!(out.contains("Read the whole thing"), "must stop last-paragraph replies");
        assert!(out.contains("Do not summarise"), "the actual observed failure");
        assert!(out.contains("carry on from where it stopped"));
    }

    #[test]
    fn names_the_resume_point_so_the_reply_does_something() {
        let out = wrap(&meta(), "transcript");
        assert!(out.contains("Where it stopped:"));
        assert!(out.contains("drops the second event"));
    }

    #[test]
    fn translates_the_source_slug_into_a_product_name() {
        assert_eq!(readable_source("claude-code"), "Claude Code");
        assert_eq!(readable_source("cursor"), "Cursor");
        // Anything unrecognised passes through rather than being mangled.
        assert_eq!(readable_source("Grok"), "Grok");
    }

    #[test]
    fn keeps_the_transcript_verbatim_and_last() {
        let transcript = "You:\nexact words\n\nAssistant:\nexact reply\n";
        let out = wrap(&meta(), transcript);

        assert!(out.ends_with(transcript), "the conversation must not be altered");
        assert!(out.find("---").unwrap() < out.find("exact words").unwrap());
    }

    #[test]
    fn omits_what_it_does_not_know_rather_than_inventing_it() {
        let sparse = Handover {
            source: "cursor",
            title: "",
            resume_point: "",
            when: "",
            project: "",
        };
        let out = wrap(&sparse, "t");

        assert!(!out.contains("Where it stopped:"));
        assert!(!out.contains("Conversation:"));
        // No dangling punctuation from the skipped clauses.
        assert!(out.contains("**Cursor**.\n"));
    }

    #[test]
    fn trims_a_rambling_resume_point_to_its_first_line() {
        let long = "the actual question\nthen three more paragraphs of thinking";
        let m = Handover { resume_point: long, ..meta() };

        let out = wrap(&m, "t");
        assert!(out.contains("the actual question"));
        assert!(!out.contains("three more paragraphs"));
    }

    #[test]
    fn stays_small_next_to_the_conversation_it_wraps() {
        // Prepended to transcripts of 100k+ characters, and every word is paid
        // for by whoever receives it.
        let overhead = wrap(&meta(), "").len();
        assert!(overhead < 900, "preamble was {overhead} bytes");
    }
}

/// The compiler owns the brief now; this keeps one name for it at the call site.
pub use crate::compiler::Brief;
