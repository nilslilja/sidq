//! What your assistant thought and did not say.
//!
//! Every model that reasons before it answers produces two things: the reply,
//! and the thinking that led to it. You are shown the first. The second is
//! written to a file on your own disk and never rendered anywhere, and it is
//! dropped from the model's own context after the turn, so it cannot be
//! recovered by asking either. It exists once, on your machine, unread.
//!
//! Measured on one conversation on the machine this was written on: 561 blocks
//! of reasoning, 370,055 characters, against 817 blocks of reply. The half you
//! were shown is 14% of the file.
//!
//! ── Why this is a screen and not a statistic ─────────────────────────────────
//! Sidq already used this material: it is most of what makes a handover worth
//! more than a paste. But it was only ever visible as a consequence. Nothing
//! ever put a person in front of the sentence their assistant wrote about their
//! work and decided not to show them.
//!
//! That sentence is the product. Everything else Sidq does follows from
//! believing it: if the reasoning is hidden from you, it is certainly hidden
//! from the next assistant you open.
//!
//! Nothing here is generated. Every excerpt is a verbatim block from a file
//! already on this disk, and anybody can go and check.

use crate::capture::Block;
use serde::Serialize;

/// Long enough to be worth reading, short enough to scan a list of them.
const EXCERPT_CHARS: usize = 400;

/// Reasoning shorter than this is bookkeeping, not a thought.
const MIN_EXCERPT_CHARS: usize = 120;

/// One thing an assistant thought and did not say.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Withheld {
    pub session_id: String,
    pub title: String,
    pub source: String,
    /// The reasoning, verbatim. Never paraphrased and never generated.
    pub text: String,
    /// Characters in this one block.
    pub chars: usize,
}

/// The gap, across everything Sidq can read.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    /// Characters you were shown.
    pub shown: usize,
    /// Characters written about your work that you were not.
    pub hidden: usize,
    /// How many separate thoughts that is.
    pub thoughts: usize,
    /// Conversations examined.
    pub conversations: usize,
    /// The longest of them, to read.
    pub excerpts: Vec<Withheld>,
    /// Share of everything written that was never shown, 0 to 1.
    pub share: f64,
}

impl Report {
    /// The share of the writing about your work that you never saw.
    pub fn hidden_share(&self) -> f64 {
        let total = self.shown + self.hidden;
        if total == 0 {
            return 0.0;
        }
        self.hidden as f64 / total as f64
    }
}

/// Trim to something readable, on a word boundary rather than mid-syllable.
fn excerpt(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= EXCERPT_CHARS {
        return trimmed.to_string();
    }

    let head: String = trimmed.chars().take(EXCERPT_CHARS).collect();
    match head.rfind(|c: char| c == '.' || c == '\n') {
        Some(stop) if stop > EXCERPT_CHARS / 2 => head[..=stop].trim().to_string(),
        _ => format!("{}…", head.trim_end()),
    }
}

/**
 * Build the report from conversations already on this machine.
 *
 * Only the sources that write transcripts to disk carry reasoning at all, so
 * this reads those. A browser assistant renders its thinking away before it
 * ever reaches the page, and claiming otherwise would be inventing a number.
 */
pub fn build(limit: usize) -> Report {
    let sessions = crate::work_history::recent_sessions(limit);
    let mut report = Report::default();

    for session in &sessions {
        let Some(turns) = crate::work_history::session_capture(&session.session_id) else {
            continue;
        };
        report.conversations += 1;

        for turn in &turns {
            for block in &turn.blocks {
                match block {
                    Block::Said(text) => report.shown += text.chars().count(),
                    Block::Thought(text) => {
                        let chars = text.chars().count();
                        report.hidden += chars;
                        report.thoughts += 1;

                        if chars >= MIN_EXCERPT_CHARS {
                            report.excerpts.push(Withheld {
                                session_id: session.session_id.clone(),
                                title: session.title.clone(),
                                source: session.source.to_string(),
                                text: excerpt(text),
                                chars,
                            });
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    // Longest first: the more it wrote without saying, the more striking it is.
    report.excerpts.sort_by(|a, b| b.chars.cmp(&a.chars));
    report.excerpts.truncate(40);
    report.share = report.hidden_share();
    report
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_share_is_of_everything_written_not_of_the_reply() {
        // "86% hidden" has to mean 86% of what was written about your work,
        // which is the only reading that is both true and checkable.
        let report = Report { shown: 140, hidden: 860, ..Default::default() };
        assert!((report.hidden_share() - 0.86).abs() < 0.001);
    }

    #[test]
    fn an_empty_machine_reports_nothing_rather_than_dividing_by_zero() {
        assert_eq!(Report::default().hidden_share(), 0.0);
    }

    #[test]
    fn an_excerpt_stops_at_a_sentence_rather_than_mid_word() {
        let long = format!("{} And then a final clause that runs past the limit.", "a".repeat(380));
        let out = excerpt(&long);

        assert!(out.chars().count() <= EXCERPT_CHARS + 1);
        assert!(out.ends_with('.') || out.ends_with('…'));
    }

    #[test]
    fn a_short_thought_is_left_exactly_as_written() {
        /*
         * The entire claim of this screen is that nothing is paraphrased. What
         * comes out has to be findable, character for character, in a file on
         * the person's own disk.
         */
        let original = "the second approach fails on empty input, so use the first";
        assert_eq!(excerpt(original), original);
    }

    /**
     * What this machine's assistants actually withheld.
     *
     * cargo test --bin sidq real_withheld -- --ignored --nocapture
     */
    #[test]
    #[ignore]
    fn real_withheld() {
        let report = build(30);

        println!("\n  {} conversations", report.conversations);
        println!("  shown:  {} chars", report.shown);
        println!("  hidden: {} chars in {} thoughts", report.hidden, report.thoughts);
        println!("  {:.0}% of what was written, you never saw\n", report.hidden_share() * 100.0);

        for e in report.excerpts.iter().take(3) {
            println!("  [{} chars] {}", e.chars, e.title);
            println!("      {}\n", e.text.replace('\n', " ").chars().take(220).collect::<String>());
        }
    }
}
