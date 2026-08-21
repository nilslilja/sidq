//! Everything the assistant did, not just the part it said.
//!
//! A transcript on disk is mostly invisible. In one sampled conversation there
//! were 288 blocks of the model's private reasoning against 269 blocks of what
//! it actually replied, 659 tool calls, 662 results, and 224,756 characters of
//! thinking that the person on the other end never saw a word of. The reader
//! that fed the handover kept the replies and a `[used Read]` label, which is
//! about 14% of the file.
//!
//! That 14% is exactly the part a person can already get by asking the model to
//! summarise itself, which is why a handover built from it reads as a wrapper.
//! The other 86% cannot be recovered by asking, because the model does not have
//! it either: reasoning is dropped from its own context between turns. It only
//! exists here, on this disk, in a file nothing else reads.
//!
//! ── What is kept and what is trimmed ─────────────────────────────────────────
//! Thinking is kept whole. It is the thing worth carrying and it is why this
//! module exists.
//!
//! Tool inputs and results are truncated, because they are enormous and mostly
//! recoverable: a file read is 40,000 characters of a file that is still on
//! disk. What matters to the next assistant is *that* it was read and roughly
//! what came back, not a second copy of the repository.
//!
//! ── Not for human eyes ───────────────────────────────────────────────────────
//! The output is dense, repetitive and unpleasant to read, and that is correct.
//! A person reading their own conversation back has the original. This is
//! written for the model that receives it.

use serde::Serialize;

/*
 * ── The two budgets, and why they are this small ─────────────────────────────
 * Measured on the largest real conversation on this machine: 3,416 turns, 1,594
 * tool calls and 1,597 results. At 300 and 600 characters the compiled file
 * came to 2,014,478 characters — five times the spoken version and far past any
 * context window it might be pasted into.
 *
 * Tool traffic is the bulk of that and the least worth carrying whole: a file
 * read is thousands of characters of something still sitting on the disk. The
 * reasoning is 370,055 characters and is kept entire, because it exists
 * nowhere else and is the only reason this module was written.
 */

/// A tool's arguments, trimmed. Enough to know what was asked for.
const MAX_INPUT_CHARS: usize = 160;

/// A tool's output, trimmed. Enough to know what came back and how it ended.
const MAX_RESULT_CHARS: usize = 240;

/// One thing that happened inside a turn.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Block {
    /// Text that was actually shown.
    Said(String),
    /// Reasoning that was never shown to anyone, and is dropped from the
    /// model's own context after the turn. This exists nowhere else.
    Thought(String),
    /// A tool call, with what it was asked for.
    Did { tool: String, input: String },
    /// What came back, and whether it failed. A failure is often the most
    /// informative thing in a conversation and used to be discarded entirely.
    Saw { tool_use_id: String, output: String, failed: bool },
    /// The person stopped it mid-answer. A rejection, and the strongest signal
    /// in the file about what they did not want.
    Interrupted,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    You,
    Assistant,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Turn {
    pub role: Role,
    pub blocks: Vec<Block>,
}

/// Head and tail, so a truncated result still shows how it ended.
fn clamp(text: &str, limit: usize) -> String {
    let count = text.chars().count();
    if count <= limit {
        return text.to_string();
    }

    let head: String = text.chars().take(limit * 2 / 3).collect();
    let tail: String = text
        .chars()
        .skip(count - limit / 3)
        .collect::<String>();

    format!("{head}\n… {} characters trimmed …\n{tail}", count - limit)
}

/// A tool result's content is sometimes a string and sometimes a block list.
fn result_text(content: &serde_json::Value) -> String {
    match content {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(items) => items
            .iter()
            .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

/// Everything in one record, in the order it happened.
pub fn blocks_of(record: &serde_json::Value) -> Vec<Block> {
    let Some(content) = record.get("message").and_then(|m| m.get("content")) else {
        return Vec::new();
    };

    match content {
        serde_json::Value::String(s) => {
            if is_interruption(s) {
                vec![Block::Interrupted]
            } else if s.trim().is_empty() {
                Vec::new()
            } else {
                vec![Block::Said(s.clone())]
            }
        }
        serde_json::Value::Array(items) => items.iter().filter_map(block_of).collect(),
        _ => Vec::new(),
    }
}

fn block_of(block: &serde_json::Value) -> Option<Block> {
    let text_at = |key: &str| block.get(key).and_then(|v| v.as_str()).unwrap_or_default();

    match block.get("type").and_then(|t| t.as_str())? {
        "text" => {
            let text = text_at("text");
            if is_interruption(text) {
                return Some(Block::Interrupted);
            }
            (!text.trim().is_empty()).then(|| Block::Said(text.to_string()))
        }
        "thinking" => {
            let text = text_at("thinking");
            (!text.trim().is_empty()).then(|| Block::Thought(text.to_string()))
        }
        "tool_use" => Some(Block::Did {
            tool: text_at("name").to_string(),
            // Serialised back to JSON rather than reformatted: the shape of the
            // arguments is part of what was asked for.
            input: clamp(
                &block
                    .get("input")
                    .map(|i| i.to_string())
                    .unwrap_or_default(),
                MAX_INPUT_CHARS,
            ),
        }),
        "tool_result" => Some(Block::Saw {
            tool_use_id: text_at("tool_use_id").to_string(),
            output: clamp(
                &block.get("content").map(result_text).unwrap_or_default(),
                MAX_RESULT_CHARS,
            ),
            failed: block
                .get("is_error")
                .and_then(|e| e.as_bool())
                .unwrap_or(false),
        }),
        // An image cannot be carried into a text handover, and pretending
        // otherwise would put a broken reference in front of the next model.
        _ => None,
    }
}

/// Claude Code writes this exact phrase when somebody presses Escape.
fn is_interruption(text: &str) -> bool {
    text.contains("[Request interrupted by user")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn record(content: serde_json::Value) -> serde_json::Value {
        json!({ "message": { "content": content } })
    }

    #[test]
    fn keeps_the_reasoning_nobody_ever_saw() {
        /*
         * The whole point. This block is never rendered to the person and is
         * dropped from the model's own context after the turn, so it exists
         * only in this file — which makes it the one thing a handover can carry
         * that asking the model to summarise itself cannot produce.
         */
        let blocks = blocks_of(&record(json!([
            { "type": "thinking", "thinking": "the second approach fails on empty input", "signature": "x" },
            { "type": "text", "text": "Let's use the first approach." }
        ])));

        assert_eq!(
            blocks,
            vec![
                Block::Thought("the second approach fails on empty input".into()),
                Block::Said("Let's use the first approach.".into()),
            ]
        );
    }

    #[test]
    fn keeps_what_a_tool_was_asked_for_and_what_came_back() {
        // The old reader kept `[used Read]` and nothing else: not the argument,
        // not the answer, not whether it worked.
        let call = blocks_of(&record(json!([
            { "type": "tool_use", "name": "Read", "input": { "file_path": "/a/b.rs" }, "id": "t1" }
        ])));
        assert_eq!(
            call,
            vec![Block::Did {
                tool: "Read".into(),
                input: r#"{"file_path":"/a/b.rs"}"#.into()
            }]
        );

        let result = blocks_of(&record(json!([
            { "type": "tool_result", "tool_use_id": "t1", "content": "fn main() {}" }
        ])));
        assert_eq!(
            result,
            vec![Block::Saw {
                tool_use_id: "t1".into(),
                output: "fn main() {}".into(),
                failed: false
            }]
        );
    }

    #[test]
    fn records_that_a_tool_failed() {
        // A failure is frequently the most informative thing in a conversation,
        // and it was thrown away with everything else.
        let blocks = blocks_of(&record(json!([
            { "type": "tool_result", "tool_use_id": "t9", "content": "No such file", "is_error": true }
        ])));

        assert!(matches!(blocks[0], Block::Saw { failed: true, .. }));
    }

    #[test]
    fn notices_when_somebody_stopped_it_mid_answer() {
        /*
         * The rejection. Pressing Escape is the clearest statement in the file
         * of what a person did not want, and it read as ordinary conversation.
         */
        let typed = blocks_of(&record(json!("[Request interrupted by user]")));
        assert_eq!(typed, vec![Block::Interrupted]);

        let in_blocks = blocks_of(&record(json!([
            { "type": "text", "text": "[Request interrupted by user for tool use]" }
        ])));
        assert_eq!(in_blocks, vec![Block::Interrupted]);
    }

    #[test]
    fn reads_a_tool_result_given_as_blocks_rather_than_a_string() {
        // Both shapes occur in real transcripts, and treating the array form as
        // empty silently drops the answer to every tool that uses it.
        let blocks = blocks_of(&record(json!([
            { "type": "tool_result", "tool_use_id": "t2",
              "content": [{ "type": "text", "text": "line one" }, { "type": "text", "text": "line two" }] }
        ])));

        assert_eq!(
            blocks,
            vec![Block::Saw {
                tool_use_id: "t2".into(),
                output: "line one\nline two".into(),
                failed: false
            }]
        );
    }

    #[test]
    fn trims_an_enormous_tool_result_but_keeps_both_ends() {
        /*
         * A single file read is often 40,000 characters of something still
         * sitting on disk. Carrying every one whole makes the handover larger
         * than the context it is meant to fit into, and the end of a result is
         * frequently where the error is.
         */
        let huge = "A".repeat(5_000) + "THE-END";
        let blocks = blocks_of(&record(json!([
            { "type": "tool_result", "tool_use_id": "t3", "content": huge }
        ])));

        let Block::Saw { output, .. } = &blocks[0] else { panic!("expected a result") };
        assert!(output.chars().count() < 800);
        assert!(output.contains("THE-END"), "the tail has to survive");
        assert!(output.contains("trimmed"), "and it must say it was trimmed");
    }

    #[test]
    fn drops_images_rather_than_referring_to_one_that_cannot_travel() {
        let blocks = blocks_of(&record(json!([
            { "type": "image", "source": { "type": "base64", "data": "…" } },
            { "type": "text", "text": "see above" }
        ])));

        assert_eq!(blocks, vec![Block::Said("see above".into())]);
    }

    #[test]
    fn ignores_empty_blocks_rather_than_emitting_blank_turns() {
        assert!(blocks_of(&record(json!([{ "type": "text", "text": "   " }]))).is_empty());
        assert!(blocks_of(&record(json!("  "))).is_empty());
        assert!(blocks_of(&json!({})).is_empty());
    }
}
