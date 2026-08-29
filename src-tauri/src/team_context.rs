/*!
Standing instructions, shared between the people on one team.

── Why a folder and not a server ─────────────────────────────────────────────

Duo sold two seats and one invoice. Asked what it did, the honest answer was
"you both get Sidq", and the thing people at a demo were excited about — that a
team could work from the same context — was not a feature, it was a guess they
had made about the name. This is that guess, made true.

The obvious build is a server: sync each member's rules through Supabase, which
is already there for billing. It was not built, because the front page says
"Nothing is uploaded. It fetches nothing." and "It works with the wifi off", and
those sentences are the product. Making them false for the paid tier is a worse
trade than any feature is worth.

So Sidq writes one small Markdown file into a folder the person chooses, and
reads the files its teammates' copies wrote into the same folder. If that folder
is in iCloud Drive, Dropbox, Drive or a git repo, the syncing is done by
something the team already trusts with far more than this. Sidq itself still
opens no socket. Every claim on the page stays true, and it works between two
people in different countries rather than only two laptops on one wifi.

── The rules of the folder ───────────────────────────────────────────────────

One writer per file. Sidq owns exactly one file — the one named after you — and
never edits anybody else's, so two people writing at the same moment cannot
conflict; they are not touching the same bytes.

It is Markdown, and legible, because it leaves your Mac. Before anything is
shared you can open the file and read every word of what is in it, which is not
true of a payload posted to an endpoint.

A file Sidq did not write is read anyway, as long as it parses. That is
deliberate: a team that wants a hand-written house-rules file shared by everyone
can just write one and drop it in.
*/

use std::fs;
use std::path::{Path, PathBuf};

/// Extension that marks a file as one of these. Anything else is ignored.
pub const SUFFIX: &str = ".sidq-context.md";

/// Where the chosen folder is remembered.
pub const FOLDER_KEY: &str = "team.folder";

/**
 * Most rules taken from any one teammate.
 *
 * A handover already carries up to eight of your own before the conversation
 * starts, and the receiving model reads all of it before it reaches the thing
 * you actually asked. A team of four with no cap each would bury it.
 */
const PER_PERSON: usize = 6;

/// Most teammates read from one folder, so a stale shared drive cannot flood it.
const MAX_PEOPLE: usize = 12;

/// A context file above this is not one of ours and is not worth parsing.
const MAX_BYTES: u64 = 256 * 1024;

/// One line somebody on the team keeps telling assistants.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamRule {
    /// Whose rule it is. Shown in the handover so it is never mistaken for yours.
    pub who: String,
    pub text: String,
}

/**
 * The filename for one person's rules.
 *
 * Lowercased and stripped to letters, digits and dashes, because this lands in
 * whatever the team syncs with and a filename with a slash or a colon in it is
 * a support message from somebody on Windows.
 */
pub fn file_name_for(name: &str) -> String {
    let slug: String = name
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    let slug = if slug.is_empty() { "me".to_string() } else { slug };
    format!("{slug}{SUFFIX}")
}

/**
 * Write this person's rules into the shared folder.
 *
 * Returns the path written, so the window can show it. Writing an empty set
 * removes the file rather than leaving an empty one behind: somebody who turns
 * sharing off should stop appearing in their teammates' handovers, and a file
 * with a heading and no rules under it would keep them there in spirit.
 */
pub fn publish(folder: &Path, name: &str, rules: &[String]) -> Option<PathBuf> {
    if !folder.is_dir() {
        return None;
    }

    let path = folder.join(file_name_for(name));

    if rules.is_empty() {
        let _ = fs::remove_file(&path);
        return None;
    }

    let mut out = String::new();
    out.push_str(&format!("# {}\n\n", name.trim()));
    out.push_str(
        "Standing instructions, in their own words, taken from what they keep telling\n\
         assistants. Written by Sidq. Anyone on the team whose Sidq points at this\n\
         folder carries these into their handovers.\n\n",
    );
    for rule in rules.iter().take(PER_PERSON) {
        out.push_str(&format!("- {}\n", rule.trim()));
    }

    fs::write(&path, out).ok()?;
    Some(path)
}

/**
 * Everybody else's rules in the folder.
 *
 * `mine` is the filename this Mac publishes, excluded by name rather than by
 * content: reading your own rules back and handing them to an assistant as
 * though a colleague had said them is the one wrong answer here.
 */
pub fn read_others(folder: &Path, mine: &str) -> Vec<TeamRule> {
    let Ok(entries) = fs::read_dir(folder) else {
        return Vec::new();
    };

    let mut files: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.ends_with(SUFFIX) && n != mine)
        })
        .filter(|p| fs::metadata(p).is_ok_and(|m| m.len() <= MAX_BYTES))
        .collect();

    // Stable across runs, so a handover does not reorder itself for no reason.
    files.sort();

    files
        .into_iter()
        .take(MAX_PEOPLE)
        .flat_map(|path| parse(&fs::read_to_string(&path).unwrap_or_default(), &path))
        .collect()
}

/**
 * One file's worth of rules.
 *
 * The heading names the person. Without one the filename stands in, so a
 * hand-written file still attributes to something rather than to nobody.
 */
fn parse(text: &str, path: &Path) -> Vec<TeamRule> {
    let fallback = path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.trim_end_matches(SUFFIX).replace('-', " "))
        .unwrap_or_default();

    let who = text
        .lines()
        .find_map(|l| l.strip_prefix("# "))
        .map(str::trim)
        .filter(|w| !w.is_empty())
        .unwrap_or(&fallback)
        .to_string();

    text.lines()
        .filter_map(|l| l.trim().strip_prefix("- "))
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .take(PER_PERSON)
        .map(|text| TeamRule { who: who.clone(), text: text.to_string() })
        .collect()
}

/// Who is in the folder, and how many rules each of them is contributing.
pub fn members(folder: &Path, mine: &str) -> Vec<(String, usize)> {
    let mut out: Vec<(String, usize)> = Vec::new();
    for rule in read_others(folder, mine) {
        match out.iter_mut().find(|(who, _)| *who == rule.who) {
            Some((_, n)) => *n += 1,
            None => out.push((rule.who, 1)),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sidq-team-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_name_becomes_a_filename_any_machine_can_hold() {
        assert_eq!(file_name_for("Nils"), format!("nils{SUFFIX}"));
        assert_eq!(file_name_for("Nils Lilja"), format!("nils-lilja{SUFFIX}"));
        // The folder syncs to machines that are not this one.
        assert_eq!(file_name_for("a/b:c"), format!("a-b-c{SUFFIX}"));
        assert_eq!(file_name_for("   "), format!("me{SUFFIX}"));
    }

    #[test]
    fn what_gets_shared_is_readable_before_it_goes_anywhere() {
        let dir = scratch("readable");
        let path = publish(&dir, "Nils", &["always show me the diff first".into()]).unwrap();
        let text = fs::read_to_string(&path).unwrap();

        /*
         * The point of Markdown over a payload: this file lands in somebody's
         * Drive, and they can open it and read every word that left their Mac.
         */
        assert!(text.starts_with("# Nils\n"));
        assert!(text.contains("- always show me the diff first"));
    }

    #[test]
    fn a_teammate_is_read_and_attributed() {
        let dir = scratch("attributed");
        publish(&dir, "Nils", &["no em dashes".into()]);
        publish(&dir, "Sam", &["always TypeScript, never JS".into()]);

        let found = read_others(&dir, &file_name_for("Nils"));

        assert_eq!(found, vec![TeamRule { who: "Sam".into(), text: "always TypeScript, never JS".into() }]);
    }

    /*
     * Reading your own rules back and handing them to an assistant as though a
     * colleague had said them is the one genuinely wrong answer here: it would
     * double every rule you have and invent a person.
     */
    #[test]
    fn your_own_file_is_never_read_back_as_a_colleague() {
        let dir = scratch("self");
        publish(&dir, "Nils", &["no em dashes".into()]);

        assert!(read_others(&dir, &file_name_for("Nils")).is_empty());
    }

    #[test]
    fn a_hand_written_house_file_works_too() {
        let dir = scratch("handwritten");
        fs::write(
            dir.join(format!("house-rules{SUFFIX}")),
            "# House rules\n\n- deploy on Thursdays, never Friday\n- every PR needs a test\n",
        )
        .unwrap();

        let found = read_others(&dir, &file_name_for("Nils"));

        assert_eq!(found.len(), 2);
        assert_eq!(found[0].who, "House rules");
    }

    #[test]
    fn a_file_with_no_heading_is_attributed_to_its_name() {
        let dir = scratch("noheading");
        fs::write(dir.join(format!("back-end-team{SUFFIX}")), "- pin every dependency\n").unwrap();

        let found = read_others(&dir, &file_name_for("Nils"));

        assert_eq!(found[0].who, "back end team");
    }

    #[test]
    fn turning_sharing_off_takes_you_out_of_the_folder() {
        let dir = scratch("off");
        let path = publish(&dir, "Nils", &["no em dashes".into()]).unwrap();
        assert!(path.exists());

        assert!(publish(&dir, "Nils", &[]).is_none());
        assert!(!path.exists(), "an empty file would keep them in their teammates' handovers");
    }

    #[test]
    fn one_teammate_cannot_fill_the_whole_handover() {
        let dir = scratch("cap");
        let many: Vec<String> = (0..40).map(|i| format!("rule number {i}")).collect();
        publish(&dir, "Sam", &many);

        assert_eq!(read_others(&dir, &file_name_for("Nils")).len(), PER_PERSON);
    }

    #[test]
    fn anything_that_is_not_one_of_ours_is_left_alone() {
        let dir = scratch("foreign");
        fs::write(dir.join("notes.md"), "- this is somebody's actual notes\n").unwrap();
        fs::write(dir.join("README.txt"), "- not this either\n").unwrap();

        assert!(read_others(&dir, &file_name_for("Nils")).is_empty());
    }

    #[test]
    fn a_missing_folder_is_not_an_error() {
        let missing = std::env::temp_dir().join("sidq-team-definitely-not-here");
        assert!(read_others(&missing, "x").is_empty());
        assert!(publish(&missing, "Nils", &["a".into()]).is_none());
    }

    /*
     * ── The whole thing, two people, one folder ──────────────────────────────
     *
     * Everything above tests a piece. This is the claim Duo is sold on: my
     * co-founder's conventions reach the assistant I am handing a conversation
     * to, on a different Mac, without either of us doing anything but pointing
     * at the same synced folder.
     */
    #[test]
    fn a_colleagues_rule_reaches_the_other_persons_handover() {
        let shared = scratch("endtoend");

        // Sam's Mac publishes into the folder.
        publish(&shared, "Sam", &["always TypeScript, never JS".into()]);

        // Nils's Mac reads it and builds a handover.
        let theirs: Vec<(String, String)> = read_others(&shared, &file_name_for("Nils"))
            .into_iter()
            .map(|r| (r.who, r.text))
            .collect();
        let mine: Vec<String> = vec!["no em dashes in the copy".into()];

        let turns = vec![crate::capture::Turn {
            role: crate::capture::Role::You,
            blocks: vec![crate::capture::Block::Said("how should I type this?".into())],
        }];
        let brief = crate::compiler::Brief {
            source: "ChatGPT",
            when: "today",
            project: "Sidq",
            resume_point: "carry on",
            profile: &mine,
            team: &theirs,
        };

        let out = crate::compiler::compile(&turns, &brief, crate::compiler::Target::Markdown);

        assert!(out.contains("- no em dashes in the copy"), "their own rules still ride along");
        assert!(out.contains("- Sam: always TypeScript, never JS"), "and Sam's, with his name on");
    }

    #[test]
    fn members_says_who_is_in_the_folder() {
        let dir = scratch("members");
        publish(&dir, "Sam", &["a".into(), "b".into()]);
        publish(&dir, "Jo", &["c".into()]);

        let mut who = members(&dir, &file_name_for("Nils"));
        who.sort();

        assert_eq!(who, vec![("Jo".to_string(), 1), ("Sam".to_string(), 2)]);
    }
}
