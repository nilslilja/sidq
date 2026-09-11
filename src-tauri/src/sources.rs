//! What a person calls each assistant Sidq reads.
//!
//! One table, because there were four and they disagreed.
//!
//! `main.rs` had one for notifications that knew nothing about Windsurf, Codex
//! or VS Code — a Windsurf conversation was announced as "windsurf". `thread.rs`
//! had a second for thread headings. `assistants.rs` has a third, which is a
//! different thing and stays: it is the table of assistants Sidq can *open*, and
//! it carries a URL because opening one is what it is for. Claude Code has no
//! URL and belongs in none of it.
//!
//! The fallback is the caller's to choose, which is why this returns an
//! `Option` rather than picking one. A notification that cannot name the
//! assistant is better off printing the raw id, because the id is at least true
//! and somebody can act on it. A heading in the middle of a thread is better off
//! saying "another assistant", because a raw id in prose reads as a bug.

/// The assistant's name as a person writes it, or `None` for one this does not
/// know — a source a reader supports and this table has not been told about.
pub fn label(source: &str) -> Option<&'static str> {
    Some(match source {
        // Read from disk.
        "claude-code" => "Claude Code",
        "cursor" => "Cursor",
        "windsurf" => "Windsurf",
        "codex" => "Codex",
        "cowork" => "Cowork",
        "vscode" => "VS Code",
        // Read from the screen.
        "chatgpt" => "ChatGPT",
        "claude.ai" => "Claude",
        "gemini" => "Gemini",
        "grok" => "Grok",
        "deepseek" => "DeepSeek",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_source_a_reader_writes_has_a_name() {
        /*
         * The bug this file was made out of. `main.rs` named eight sources and
         * Sidq reads eleven, so three of them were announced to somebody by
         * their column value — "windsurf", lowercase, in a system notification.
         *
         * The list is checked against the readers rather than against itself,
         * because a list that agrees with itself proves nothing.
         */
        for source in [
            "claude-code",
            "cursor",
            "windsurf",
            "codex",
            "cowork",
            "vscode",
            "chatgpt",
            "claude.ai",
            "gemini",
            "grok",
            "deepseek",
        ] {
            assert!(label(source).is_some(), "{source} has no name");
        }
    }

    #[test]
    fn a_source_this_does_not_know_says_so_rather_than_guessing() {
        // The whole reason this returns an Option. A caller that gets None can
        // choose between the raw id and a vague phrase; one that gets a guess
        // cannot tell it is guessing.
        assert_eq!(label("something-new"), None);
        assert_eq!(label(""), None);
    }

    #[test]
    fn no_name_is_a_column_value() {
        // "claude-code" as a heading is how a person finds out they are looking
        // at a database rather than at their own work.
        for source in ["claude-code", "claude.ai", "vscode"] {
            let name = label(source).unwrap();
            assert!(!name.contains('-'), "{name} reads as an id");
            assert!(name.chars().next().is_some_and(char::is_uppercase));
        }
    }
}
