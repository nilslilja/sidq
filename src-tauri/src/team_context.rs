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

/* ── Whole conversations, when somebody chooses to hand one over ─────────── */

/// Where shared handovers live inside the folder. Kept apart from the rule files.
pub const HANDOVERS_DIR: &str = "handovers";

/// A conversation somebody on the team put in the folder.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedHandover {
    /// Who shared it, from the filename.
    pub who: String,
    /// What the conversation was called.
    pub title: String,
    /// Unix milliseconds, from the file's modification time.
    pub when: i64,
    /// Full path, for reading it back.
    pub path: String,
    /// Whether this Mac is the one that shared it.
    pub mine: bool,
}

/**
 * Put one conversation in the folder for the rest of the team.
 *
 * ── Why this is a different act from sharing rules ────────────────────────
 *
 * The rule file is a handful of sentences and is published automatically. This
 * is an entire conversation, and it only ever happens because somebody pressed
 * a button on that specific conversation. Nothing here runs on a timer and
 * nothing is shared because a folder was once configured.
 *
 * It is also not a new category of exposure, which is worth being clear about
 * rather than nervous about: a handover's whole purpose is to be pasted into
 * another company's assistant. The conversation leaves this Mac either way. All
 * this decides is whether a colleague sees it before OpenAI does.
 */
pub fn share_handover(folder: &Path, who: &str, title: &str, text: &str) -> Option<PathBuf> {
    let dir = folder.join(HANDOVERS_DIR);
    fs::create_dir_all(&dir).ok()?;

    let stem: String = title
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' { c } else { '-' })
        .collect::<String>()
        .trim()
        .replace(' ', "-");
    let stem = if stem.is_empty() { "conversation".into() } else { stem };
    let stem = &stem[..stem.len().min(60)];

    // Who first, so a directory listing groups by person without needing Sidq.
    let path = dir.join(format!("{}--{stem}.md", file_stem_for(who)));
    fs::write(&path, text).ok()?;
    Some(path)
}

/// The name part of a filename, without the context-file suffix.
fn file_stem_for(name: &str) -> String {
    file_name_for(name).trim_end_matches(SUFFIX).to_string()
}

/**
 * Every conversation in the folder, newest first.
 *
 * `mine` is this person's stem, so the list can say which ones they put there
 * themselves rather than presenting somebody their own conversation as though a
 * colleague had shared it.
 */
pub fn shared_handovers(folder: &Path, who: &str) -> Vec<SharedHandover> {
    let dir = folder.join(HANDOVERS_DIR);
    let Ok(entries) = fs::read_dir(&dir) else {
        return Vec::new();
    };

    let mine = file_stem_for(who);
    let mut out: Vec<SharedHandover> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let name = path.file_name()?.to_str()?.strip_suffix(".md")?;
            let (stem, title) = name.split_once("--")?;

            Some(SharedHandover {
                who: stem.replace('-', " "),
                title: title.replace('-', " "),
                when: entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0),
                mine: stem == mine,
                path: path.to_string_lossy().to_string(),
            })
        })
        .collect();

    out.sort_by_key(|h| std::cmp::Reverse(h.when));
    out
}

/**
 * Read one back, to put on the clipboard.
 *
 * The path has to be inside the folder's handovers directory. It arrives from
 * the window, and a window is allowed to be wrong; without this, a bug there
 * would turn "copy a shared handover" into "read any file on this Mac".
 */
pub fn read_shared(folder: &Path, path: &str) -> Option<String> {
    let dir = folder.join(HANDOVERS_DIR).canonicalize().ok()?;
    let wanted = PathBuf::from(path).canonicalize().ok()?;
    if !wanted.starts_with(&dir) {
        return None;
    }
    fs::read_to_string(wanted).ok()
}

/* ── Finding a team that already exists ──────────────────────────────────── */

/// A folder somebody is already sharing in, and who is in it.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundTeam {
    /// Full path, to hand straight to `set_team_folder`.
    pub folder: String,
    /// Where it is, as a person would say it. "Dropbox", "iCloud Drive".
    pub inside: String,
    /// Who is publishing there already.
    pub members: Vec<String>,
}

/**
 * Look for a team folder somebody has already set up.
 *
 * ── The friction this removes ─────────────────────────────────────────────
 *
 * Setting this up was symmetrical and that was the problem: both people had to
 * independently find and choose the same folder, having agreed on it somewhere
 * else first. Two people, four steps, and a way to get it wrong that produces
 * no error — point at different folders and it simply never works, with both
 * windows saying everything is fine.
 *
 * But the first person's file is already sitting in a folder the second person
 * can see, because that is the entire point of the folder being shared. So the
 * second person does not have to be asked anything. Their Sidq finds the file,
 * says who is in there, and offers one button.
 *
 * Deliberately shallow: every sync root and one level inside it. A full walk of
 * somebody's Dropbox is the kind of thing that takes a minute and reads ten
 * thousand files to answer a question about one.
 */
pub fn discover(roots: &[(String, PathBuf)]) -> Vec<FoundTeam> {
    let mut found = Vec::new();

    for (label, root) in roots {
        let mut candidates = vec![root.clone()];
        if let Ok(entries) = fs::read_dir(root) {
            candidates.extend(
                entries
                    .flatten()
                    .map(|e| e.path())
                    .filter(|p| p.is_dir())
                    .take(40),
            );
        }

        for dir in candidates {
            let members = members_in(&dir);
            if members.is_empty() {
                continue;
            }
            found.push(FoundTeam {
                folder: dir.to_string_lossy().to_string(),
                inside: label.clone(),
                members,
            });
        }
    }

    found.sort_by_key(|t| std::cmp::Reverse(t.members.len()));
    found.truncate(4);
    found
}

/// Everybody publishing into one folder, by the name in their file.
fn members_in(dir: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };

    let mut who: Vec<String> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.ends_with(SUFFIX))
        })
        .filter_map(|p| {
            let text = fs::read_to_string(&p).ok()?;
            Some(parse(&text, &p).into_iter().next()?.who)
        })
        .collect();

    who.sort();
    who.dedup();
    who
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
    fn a_shared_conversation_is_named_after_who_shared_it() {
        let dir = scratch("share");
        let path = share_handover(&dir, "Nils", "Pricing page copy", "the whole thing").unwrap();

        assert!(path.starts_with(dir.join(HANDOVERS_DIR)));
        assert_eq!(fs::read_to_string(&path).unwrap(), "the whole thing");

        let found = shared_handovers(&dir, "Sam");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].who, "nils");
        assert_eq!(found[0].title, "Pricing page copy");
        assert!(!found[0].mine, "Sam did not share this one");
    }

    #[test]
    fn your_own_shares_are_marked_as_yours() {
        let dir = scratch("shareself");
        share_handover(&dir, "Nils", "Pricing page copy", "x");

        assert!(shared_handovers(&dir, "Nils")[0].mine);
    }

    #[test]
    fn shared_conversations_come_back_newest_first() {
        let dir = scratch("shareorder");
        share_handover(&dir, "Nils", "First", "a");
        std::thread::sleep(std::time::Duration::from_millis(1100));
        share_handover(&dir, "Sam", "Second", "b");

        let found = shared_handovers(&dir, "Nils");
        assert_eq!(found[0].title, "Second");
    }

    /*
     * The path comes from the window, and a window is allowed to be wrong. A
     * bug there must not turn "copy a shared handover" into "read any file on
     * this Mac".
     */
    #[test]
    fn nothing_outside_the_folder_can_be_read_back() {
        let dir = scratch("escape");
        let path = share_handover(&dir, "Nils", "Real", "the real one").unwrap();
        assert_eq!(read_shared(&dir, &path.to_string_lossy()).unwrap(), "the real one");

        let outside = dir.join("..").join("..").join("etc").join("hosts");
        assert!(read_shared(&dir, &outside.to_string_lossy()).is_none());
        assert!(read_shared(&dir, "/etc/hosts").is_none());
    }

    #[test]
    fn a_title_full_of_punctuation_still_makes_a_filename() {
        let dir = scratch("sharetitle");
        let path = share_handover(&dir, "Nils", "What/now: \"really\"?", "x").unwrap();

        let name = path.file_name().unwrap().to_string_lossy().to_string();
        assert!(!name.contains('/'));
        assert!(name.starts_with("nils--"));
    }

    #[test]
    fn a_folder_with_nothing_shared_is_empty_rather_than_an_error() {
        let dir = scratch("shareempty");
        assert!(shared_handovers(&dir, "Nils").is_empty());
    }

    /*
     * The second person should not be asked anything. The first person's file
     * is already in a folder they can see, because that is what shared means.
     */
    #[test]
    fn a_team_somebody_already_set_up_is_found() {
        let root = scratch("discover");
        let shared = root.join("Sidq Team");
        fs::create_dir_all(&shared).unwrap();
        publish(&shared, "Sam", &["always TypeScript".into()]);

        let found = discover(&[("Dropbox".into(), root.clone())]);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].members, vec!["Sam".to_string()]);
        assert_eq!(found[0].inside, "Dropbox");
        assert!(found[0].folder.ends_with("Sidq Team"));
    }

    #[test]
    fn a_team_at_the_top_of_the_drive_is_found_too() {
        let root = scratch("discover-root");
        publish(&root, "Sam", &["always TypeScript".into()]);

        assert_eq!(discover(&[("iCloud Drive".into(), root)]).len(), 1);
    }

    #[test]
    fn an_empty_drive_offers_nothing_rather_than_a_wrong_guess() {
        let root = scratch("discover-empty");
        fs::create_dir_all(root.join("Screenshots")).unwrap();
        fs::write(root.join("notes.md"), "not ours").unwrap();

        assert!(discover(&[("Dropbox".into(), root)]).is_empty());
    }

    /*
     * Sorted by how many people are in it, so the real team wins over a folder
     * somebody set up once and abandoned.
     */
    #[test]
    fn the_busiest_folder_is_offered_first() {
        let root = scratch("discover-order");
        let quiet = root.join("Old");
        let busy = root.join("Sidq Team");
        fs::create_dir_all(&quiet).unwrap();
        fs::create_dir_all(&busy).unwrap();
        publish(&quiet, "Sam", &["a".into()]);
        publish(&busy, "Sam", &["a".into()]);
        publish(&busy, "Jo", &["b".into()]);

        assert_eq!(discover(&[("Dropbox".into(), root)])[0].members.len(), 2);
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

#[cfg(test)]
mod demonstration {
    /*
     * What the folder actually contains, printed.
     *
     * Ignored, like the other diagnostics in this project: it exists to answer
     * "how does it share" by showing the artifacts rather than describing them.
     *
     *   cargo test --package sidq demonstration -- --ignored --nocapture
     */
    #[test]
    #[ignore]
    fn show_me_the_folder() {
        let dir = std::env::temp_dir().join("sidq-duo-demo");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        // Two Macs, two people, one synced folder.
        super::publish(&dir, "Nils", &["no em dashes in anything I post".into()]);
        super::publish(&dir, "Sam", &["always TypeScript, never JS".into()]);
        super::share_handover(&dir, "Sam", "Refund policy wording", "…the whole conversation…");

        println!("\n=== the folder, as your Drive syncs it ===");
        for entry in walk(&dir) {
            println!("  {}", entry.strip_prefix(&dir).unwrap().display());
        }

        println!("\n=== nils.sidq-context.md, written by your Mac ===");
        println!("{}", std::fs::read_to_string(dir.join("nils.sidq-context.md")).unwrap());

        println!("=== what your Mac reads back (everyone but you) ===");
        for rule in super::read_others(&dir, &super::file_name_for("Nils")) {
            println!("  {}: {}", rule.who, rule.text);
        }

        println!("\n=== and what lands in your next handover ===");
        println!("  HOW THIS TEAM WORKS");
        for rule in super::read_others(&dir, &super::file_name_for("Nils")) {
            println!("  - {}: {}", rule.who, rule.text);
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn walk(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
        let mut out = Vec::new();
        for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
            let p = e.path();
            if p.is_dir() {
                out.push(p.clone());
                out.extend(walk(&p));
            } else {
                out.push(p);
            }
        }
        out.sort();
        out
    }
}
