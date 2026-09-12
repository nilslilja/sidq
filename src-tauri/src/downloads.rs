//! Naming a file in Downloads without destroying one already there.
//!
//! ── The bug this is made out of ──────────────────────────────────────────────
//! The filename was the conversation's title with the awkward characters
//! replaced, cut to 60, and handed straight to `fs::write`. Two conversations
//! with the same title are one file, and `fs::write` truncates whatever it
//! finds — so saving the second one destroyed the first, silently, while the
//! panel said "Saved to Downloads" and named a file that did now exist.
//!
//! Measured against a real index of 30 conversations: 20 distinct filenames, so
//! ten of them could not coexist. "Claude" was three conversations, "Long
//! conversation handling in SIDQ" was four, and the four with no title at all
//! were all `sidq-conversation.md`.
//!
//! Titles repeat far more than they look like they do. Every browser-read chat
//! is named after the page, so everything read from claude.ai is called
//! "Claude"; every conversation the extractor cannot name is called nothing;
//! and a person working on one thing for a week names it the same way each time.
//!
//! ── The rule ────────────────────────────────────────────────────────────────
//! Never overwrite. If the name is taken, take the next one — `Claude (2).md`,
//! the convention every browser on this machine already uses, and the one the
//! person's own Downloads folder is already full of.
//!
//! Re-saving the same conversation therefore makes a second copy rather than
//! replacing the first. That is the right way round: a handover written an hour
//! later is a longer conversation than the one written this morning, and the
//! only way to find out which is which is to still have both.

use std::path::{Path, PathBuf};

/// How much of a title becomes a filename, in characters.
///
/// Characters, not bytes. This was `&stem[..stem.len().min(60)]`, which is a
/// byte slice: a title whose sixtieth byte lands inside an 'å' or an emoji
/// panics, and the handover fails with nothing said about why. No title in the
/// index that found it happened to be non-ASCII, which is exactly the kind of
/// luck that holds until somebody else installs the app.
const MAX_STEM: usize = 60;

/// What a title is called when it has nothing usable in it.
const UNTITLED: &str = "sidq-conversation";

/// How many `(n)` suffixes to try before giving up on a readable name.
const MAX_COPIES: u32 = 999;

/**
 * The part of a filename that comes from the conversation.
 *
 * Anything not plainly safe in a filename is replaced rather than escaped, so
 * the result is legible instead of accurate. Nobody reads a filename to recover
 * a title; they read it to recognise one.
 */
fn stem(title: &str) -> String {
    let cleaned: String = title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' {
                c
            } else {
                '-'
            }
        })
        .take(MAX_STEM)
        .collect();

    let trimmed = cleaned.trim().replace(' ', "-");
    // Trailing dashes are what a truncated title or a stripped emoji leaves
    // behind, and "Claude-.md" reads as a mistake.
    let trimmed = trimmed.trim_matches('-').to_string();

    if trimmed.is_empty() {
        UNTITLED.to_string()
    } else {
        trimmed
    }
}

/**
 * A path in `dir` that nothing is using yet.
 *
 * `exists` is passed in rather than called directly so the rule can be tested
 * without a filesystem. There is a real race between asking and writing — two
 * handovers started in the same millisecond could still agree on a name — and
 * it is left alone deliberately: closing it means opening the file exclusively
 * and threading that all the way back through the writer, to defend against
 * somebody pressing one keystroke twice inside a millisecond.
 */
pub fn free_path(dir: &Path, title: &str, exists: &dyn Fn(&Path) -> bool) -> PathBuf {
    let stem = stem(title);

    let first = dir.join(format!("{stem}.md"));
    if !exists(&first) {
        return first;
    }

    for n in 2..=MAX_COPIES {
        let candidate = dir.join(format!("{stem} ({n}).md"));
        if !exists(&candidate) {
            return candidate;
        }
    }

    /*
     * A thousand files with one name. Not reachable by hand, but the loop has
     * to end somewhere and ending it by overwriting would put back the bug this
     * file exists to remove. The clock is not pretty and it is unique.
     */
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    dir.join(format!("{stem} ({stamp}).md"))
}

/// The same thing, against the real filesystem.
pub fn free_path_on_disk(dir: &Path, title: &str) -> PathBuf {
    free_path(dir, title, &|p: &Path| p.exists())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    /// A filesystem that is whatever the test says it is.
    fn taken(names: &[&str]) -> impl Fn(&Path) -> bool + use<> {
        let set: HashSet<String> = names.iter().map(|n| (*n).to_string()).collect();
        move |p: &Path| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| set.contains(n))
        }
    }

    fn name(title: &str, existing: &[&str]) -> String {
        free_path(Path::new("/Downloads"), title, &taken(existing))
            .file_name()
            .unwrap()
            .to_string_lossy()
            .to_string()
    }

    #[test]
    fn an_empty_folder_gives_the_plain_name() {
        assert_eq!(name("Dead letter queue implementation", &[]), "Dead-letter-queue-implementation.md");
    }

    #[test]
    fn a_second_conversation_with_the_same_title_never_lands_on_the_first() {
        /*
         * The whole bug. Three conversations in a real index were called
         * "Claude", because that is the page title on claude.ai, and every one
         * of them wrote to Claude.md.
         */
        assert_eq!(name("Claude", &["Claude.md"]), "Claude (2).md");
        assert_eq!(name("Claude", &["Claude.md", "Claude (2).md"]), "Claude (3).md");
    }

    #[test]
    fn a_gap_in_the_numbering_is_used_rather_than_stepped_over() {
        // Deleting Claude (2).md should give the name back, not leave a hole
        // that counts upward forever.
        assert_eq!(name("Claude", &["Claude.md", "Claude (3).md"]), "Claude (2).md");
    }

    #[test]
    fn a_conversation_with_no_title_is_still_never_overwritten() {
        // Four of the thirty had no title at all, so all four were
        // sidq-conversation.md and three of them did not exist for long.
        assert_eq!(name("", &[]), "sidq-conversation.md");
        assert_eq!(name("   ", &["sidq-conversation.md"]), "sidq-conversation (2).md");
    }

    #[test]
    fn a_title_of_nothing_but_punctuation_does_not_become_a_row_of_dashes() {
        assert_eq!(name("!!!", &[]), "sidq-conversation.md");
        assert_eq!(name("...", &[]), "sidq-conversation.md");
    }

    #[test]
    fn a_long_title_is_cut_on_a_character_and_not_on_a_byte() {
        /*
         * The panic that was waiting. `&stem[..stem.len().min(60)]` is a byte
         * slice, and these are two bytes each, so the cut landed inside a
         * character and took the whole handover down with it. No title in the
         * index that found this was non-ASCII, which is the kind of luck that
         * holds right up until somebody else installs the app.
         */
        let swedish = "å".repeat(80);
        let out = name(&swedish, &[]);
        assert!(out.ends_with(".md"));
        assert_eq!(out.chars().count() - ".md".len(), MAX_STEM);
    }

    #[test]
    fn an_emoji_title_is_a_filename_rather_than_a_crash() {
        let out = name("🚀🚀🚀 shipping the thing", &[]);
        assert_eq!(out, "shipping-the-thing.md");
    }

    #[test]
    fn a_slash_in_a_title_cannot_write_outside_the_folder() {
        /*
         * A title is whatever an assistant put at the top of a conversation, so
         * it is not trusted to be a filename. Replacing rather than escaping is
         * what keeps `../../` from ever being a path component.
         */
        let path = free_path(Path::new("/Downloads"), "../../etc/passwd", &taken(&[]));
        assert_eq!(path.parent().unwrap(), Path::new("/Downloads"));
        assert!(!path.to_string_lossy().contains(".."));
    }

    #[test]
    fn the_names_it_hands_out_are_the_ones_a_browser_would() {
        // Downloads is already full of "SKILL (1).md" and nobody had to be told
        // what that meant.
        assert_eq!(name("SKILL", &["SKILL.md"]), "SKILL (2).md");
    }
}
