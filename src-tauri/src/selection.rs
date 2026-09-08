//! Which turns of a conversation are worth carrying, and which are not.
//!
//! ── Why a handover ever leaves anything out ──────────────────────────────────
//!
//! The whole of a conversation is not the same as the useful part of it. "hey",
//! "ok thanks", "go on" and "perfect" are turns; they are not information, and
//! every one of them spends space in the receiving model's window that a real
//! exchange could have had.
//!
//! What is dropped here is only ever that: turns that said nothing, and — when
//! the conversation genuinely cannot fit — the least substantial of the rest.
//! Nothing is rewritten, summarised or shortened. Every turn that survives
//! arrives word for word, which is the only reason this is safe to do at all.
//!
//! ── Why it cannot ask a model which parts matter ─────────────────────────────
//!
//! Because that would upload the conversation, and the product's one claim is
//! that nothing does. `index_store` records the same decision about embeddings.
//! So this is lexical, local and deterministic: the same conversation selects
//! the same way twice, on a plane, forever.
//!
//! ── Where the signals come from ──────────────────────────────────────────────
//!
//! `capture` already keeps three things nobody has been weighing, each of which
//! its own comments describe as the most informative part of a transcript: the
//! reasoning the person never saw and the model no longer has, the tool calls
//! that failed, and the points where somebody stopped the model mid-sentence.
//! Those are the signals. A turn holding any of them is worth more than a long
//! turn holding none.
//!
//! Signals are renormalised over what the conversation can actually produce, so
//! a ChatGPT conversation — which arrives as plain text with no reasoning, no
//! tools and no interruptions — is ranked on the signals it has rather than
//! marked down for lacking ones it could never have had. `rank-sessions.ts`
//! does the same thing one level up, for the same reason.

use crate::capture::{Block, Turn};

/// Below this, a turn is short enough to be nothing but pleasantry.
const FILLER_MAX_CHARS: usize = 120;

/// How much the end of a conversation outweighs the start.
///
/// A handover is a request to continue, so the recent end is what the next
/// assistant needs most. It is a multiplier and not a sort key, and it is
/// floored well above zero, because "older" is not "worthless" — the turn that
/// set the constraints everything since has obeyed is usually the first one.
const RECENCY_FLOOR: f64 = 0.55;

const W_REASONING: f64 = 0.30;
const W_FAILURE: f64 = 0.20;
const W_INTERRUPTION: f64 = 0.15;
const W_INSTRUCTION: f64 = 0.20;
const W_LENGTH: f64 = 0.15;

/**
 * Words that carry nothing on their own.
 *
 * A turn is filler only when every word left in it is on this list, so the list
 * being generous is safe and the rule being strict is what keeps it honest.
 * "ok" is here; "no" is not, because "no" is a decision.
 */
const FILLER_WORDS: [&str; 44] = [
    "hi", "hello", "hey", "yo", "morning", "afternoon", "evening", "night", "goodnight",
    "thanks", "thank", "thx", "ty", "cheers", "tack", "welcome", "np",
    "ok", "okay", "kk", "alright", "aight", "fine",
    "cool", "nice", "great", "perfect", "awesome", "excellent", "brilliant", "lovely",
    "got", "makes", "sense", "sounds",
    "continue", "carry", "keep", "going", "proceed", "next",
    "lol", "haha", "lmao",
];

/**
 * Words that disappear before the filler test.
 *
 * They are the grammar around a pleasantry rather than the pleasantry itself:
 * "thank you so much" and "that is ok" have to reduce to "thank" and "ok" or
 * the rule above never fires on anything a person actually types.
 */
const CONNECTORS: [&str; 33] = [
    "a", "the", "this", "that", "it", "is", "was", "im", "i", "am", "my", "you", "your",
    "and", "so", "then", "just", "very", "much", "for", "to", "of", "now", "all", "too",
    "please",
    // What an apostrophe leaves behind once the word is split on it. "you're"
    // arrives as "you" and "re"; on its own "re" is not a word anyone typed.
    "re", "s", "ve", "ll", "d", "t", "m",
];

/// What a selection left behind, so the handover can say so.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Report {
    /// Turns that said nothing at all.
    pub filler: usize,
    /// Turns dropped because the conversation did not fit whole.
    pub overflow: usize,
}

impl Report {
    pub fn dropped(self) -> usize {
        self.filler + self.overflow
    }
}

/// The turns worth carrying, and an account of what was left out.
pub fn select(turns: &[Turn], budget: usize) -> (Vec<Turn>, Report) {
    let mut report = Report::default();

    let mut keep: Vec<bool> = turns.iter().map(|t| !is_filler(t)).collect();
    protect_anchors(&mut keep);
    protect_tool_pairs(turns, &mut keep);
    report.filler = keep.iter().filter(|k| !**k).count();

    report.overflow = trim_to_budget(turns, &mut keep, budget);

    let kept = turns
        .iter()
        .zip(&keep)
        .filter_map(|(turn, keep)| keep.then(|| turn.clone()))
        .collect();

    (kept, report)
}

/// Roughly how many characters a turn will occupy once formatted.
pub fn weight(turn: &Turn) -> usize {
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

/**
 * Did this turn say anything?
 *
 * Only spoken turns are ever candidates. A turn that ran a tool, thought, or was
 * interrupted carries something whatever its length, and one that reads "ok" but
 * came with four tool calls is not a pleasantry.
 */
fn is_filler(turn: &Turn) -> bool {
    let mut said = String::new();
    for block in &turn.blocks {
        match block {
            Block::Said(text) => {
                said.push(' ');
                said.push_str(text);
            }
            _ => return false,
        }
    }

    if said.chars().count() > FILLER_MAX_CHARS {
        return false;
    }

    let mut words = said
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(|w| w.to_lowercase())
        .filter(|w| !CONNECTORS.contains(&w.as_str()))
        .peekable();

    // Nothing left but punctuation or connectors is still nothing said.
    words.peek().is_some() && words.all(|w| FILLER_WORDS.contains(&w.as_str()))
}

/**
 * The first and last turn are never dropped.
 *
 * The brief quotes both — how the conversation opened and where it stopped — so
 * dropping either makes the handover describe a conversation it is not carrying.
 * They are also the two a person would notice missing.
 */
fn protect_anchors(keep: &mut [bool]) {
    if let Some(first) = keep.first_mut() {
        *first = true;
    }
    if let Some(last) = keep.last_mut() {
        *last = true;
    }
}

/**
 * A tool call and what came back travel together.
 *
 * Claude writes the call in the assistant's turn and the result in the next
 * one, so they are two turns and can be selected apart. A call with no result
 * reads as a model that ran something and never found out what happened; a
 * result with no call is worse, because nothing says what produced it.
 */
fn protect_tool_pairs(turns: &[Turn], keep: &mut [bool]) {
    let has = |i: usize, f: fn(&Block) -> bool| {
        turns.get(i).is_some_and(|t: &Turn| t.blocks.iter().any(f))
    };
    let called = |b: &Block| matches!(b, Block::Did { .. });
    let returned = |b: &Block| matches!(b, Block::Saw { .. });

    for i in 0..turns.len() {
        if !keep[i] {
            continue;
        }
        if has(i, called) && i + 1 < turns.len() && has(i + 1, returned) {
            keep[i + 1] = true;
        }
        if has(i, returned) && i > 0 && has(i - 1, called) {
            keep[i - 1] = true;
        }
    }
}

/**
 * Drop the least substantial turns until what is left fits.
 *
 * The old rule was to drop whole turns from the front until the total fitted,
 * which is the right shape when there is nothing to go on and the wrong one
 * when there is: the opening of a conversation is where its constraints are
 * set, and the front is exactly what a person cannot afford to lose.
 */
fn trim_to_budget(turns: &[Turn], keep: &mut [bool], budget: usize) -> usize {
    let mut running: usize =
        turns.iter().zip(keep.iter()).filter(|(_, k)| **k).map(|(t, _)| weight(t)).sum();
    if running <= budget {
        return 0;
    }

    let scores = score_all(turns);

    // Least valuable first, and by index on a tie so the same conversation
    // always selects the same way.
    let mut order: Vec<usize> = (0..turns.len()).collect();
    order.sort_by(|a, b| {
        scores[*a].partial_cmp(&scores[*b]).unwrap_or(std::cmp::Ordering::Equal).then(a.cmp(b))
    });

    let last = turns.len() - 1;
    let mut dropped = 0usize;
    for i in order {
        if running <= budget {
            break;
        }

        /*
         * A call and its result leave together or not at all. Dropping them one
         * at a time and repairing the pairs afterwards was the first version of
         * this, and it put the file back over the budget it had just met: on a
         * real 5,158-turn conversation it selected 615,611 characters against a
         * ceiling of 600,000, because every repair added a turn back.
         */
        let unit = tool_unit(turns, i);
        if unit.iter().any(|&j| j == 0 || j == last || !keep[j]) {
            continue;
        }
        for j in unit {
            keep[j] = false;
            running -= weight(&turns[j]);
            dropped += 1;
        }
    }

    dropped
}

/// The turns that have to be kept or dropped together with this one.
fn tool_unit(turns: &[Turn], i: usize) -> Vec<usize> {
    let has = |i: usize, f: fn(&Block) -> bool| {
        turns.get(i).is_some_and(|t: &Turn| t.blocks.iter().any(f))
    };
    let called = |b: &Block| matches!(b, Block::Did { .. });
    let returned = |b: &Block| matches!(b, Block::Saw { .. });

    if has(i, called) && has(i + 1, returned) {
        return vec![i, i + 1];
    }
    if has(i, returned) && i > 0 && has(i - 1, called) {
        return vec![i - 1, i];
    }
    vec![i]
}

/// Every turn's worth, between 0 and 1.
fn score_all(turns: &[Turn]) -> Vec<f64> {
    let widest_thought = turns.iter().map(thought_chars).max().unwrap_or(0);
    let longest = turns.iter().map(|t| weight(t)).max().unwrap_or(0);

    // Only signals this conversation can produce get a say. A conversation read
    // off a web page has no reasoning and no tools; scoring it against absent
    // signals would rank every turn in it as equally poor.
    let any_reasoning = widest_thought > 0;
    let any_failure = turns.iter().any(has_failure);
    let any_interruption = turns.iter().any(has_interruption);
    let any_instruction = turns.iter().any(has_instruction);

    let available: f64 = [
        (any_reasoning, W_REASONING),
        (any_failure, W_FAILURE),
        (any_interruption, W_INTERRUPTION),
        (any_instruction, W_INSTRUCTION),
        (true, W_LENGTH),
    ]
    .iter()
    .filter(|(present, _)| *present)
    .map(|(_, w)| w)
    .sum();

    let last = turns.len().saturating_sub(1).max(1) as f64;

    turns
        .iter()
        .enumerate()
        .map(|(i, turn)| {
            let mut score = 0.0;
            if any_reasoning {
                score += W_REASONING * (thought_chars(turn) as f64 / widest_thought as f64);
            }
            if any_failure {
                score += W_FAILURE * f64::from(has_failure(turn));
            }
            if any_interruption {
                score += W_INTERRUPTION * f64::from(has_interruption(turn));
            }
            if any_instruction {
                score += W_INSTRUCTION * f64::from(has_instruction(turn));
            }
            if longest > 0 {
                // Logarithmic: a turn ten times longer is worth more, not ten
                // times more. Otherwise one pasted stack trace outranks the
                // whole conversation around it.
                let ratio = ((weight(turn) as f64) + 1.0).ln() / ((longest as f64) + 1.0).ln();
                score += W_LENGTH * ratio;
            }

            let recency = RECENCY_FLOOR + (1.0 - RECENCY_FLOOR) * (i as f64 / last);
            (score / available) * recency
        })
        .collect()
}

fn thought_chars(turn: &Turn) -> usize {
    turn.blocks
        .iter()
        .filter_map(|b| match b {
            Block::Thought(t) => Some(t.chars().count()),
            _ => None,
        })
        .sum()
}

fn has_failure(turn: &Turn) -> bool {
    turn.blocks.iter().any(|b| matches!(b, Block::Saw { failed: true, .. }))
}

fn has_interruption(turn: &Turn) -> bool {
    turn.blocks.iter().any(|b| matches!(b, Block::Interrupted))
}

/// Does this turn lay down a rule the next assistant has to keep?
fn has_instruction(turn: &Turn) -> bool {
    turn.blocks.iter().any(|b| match b {
        Block::Said(text) => crate::profile::sentences(text)
            .iter()
            .any(|s| crate::profile::is_instruction(s)),
        _ => false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capture::Role;

    fn said(role: Role, text: &str) -> Turn {
        Turn { role, blocks: vec![Block::Said(text.into())] }
    }

    fn person(text: &str) -> Turn {
        said(Role::You, text)
    }

    fn assistant(text: &str) -> Turn {
        said(Role::Assistant, text)
    }

    /*
     * ── The filler rule ──────────────────────────────────────────────────────
     *
     * These are worth pinning in both directions. A rule that drops too little
     * wastes space; a rule that drops too much loses somebody's actual words and
     * is the failure that would make the whole idea unusable.
     */

    #[test]
    fn a_greeting_on_its_own_is_not_carried() {
        assert!(is_filler(&person("hey")));
        assert!(is_filler(&person("ok thanks!")));
        assert!(is_filler(&person("thank you so much 🙏")));
        assert!(is_filler(&person("perfect, thanks")));
        assert!(is_filler(&person("keep going")));
        assert!(is_filler(&assistant("You're welcome!")));
    }

    #[test]
    fn anything_that_says_something_is_carried() {
        assert!(!is_filler(&person("ok but the index is still empty")));
        assert!(!is_filler(&person("no")), "a refusal is a decision, not a pleasantry");
        assert!(!is_filler(&person("yes")), "so is agreeing to something");
        assert!(!is_filler(&person("thanks, that broke the build")));
        assert!(!is_filler(&person("continue with the second one")));
    }

    #[test]
    fn a_short_turn_that_ran_something_is_never_filler() {
        let turn = Turn {
            role: Role::Assistant,
            blocks: vec![
                Block::Said("ok".into()),
                Block::Did { tool: "Read".into(), input: "src/main.rs".into() },
            ],
        };
        assert!(!is_filler(&turn), "it did something, whatever it said");
    }

    #[test]
    fn the_filler_between_two_real_turns_goes_and_the_real_ones_stay() {
        let turns = vec![
            person("how should the index be ordered"),
            assistant("by rowid, which is reading order"),
            person("ok thanks"),
            person("and what happens when a read is shorter"),
            assistant("it is merged rather than written over"),
        ];

        let (kept, report) = select(&turns, usize::MAX);

        assert_eq!(report.filler, 1);
        assert_eq!(report.overflow, 0);
        assert_eq!(kept.len(), 4);
        assert!(!kept.iter().any(|t| matches!(&t.blocks[0], Block::Said(s) if s == "ok thanks")));
    }

    #[test]
    fn the_opening_and_the_last_word_are_kept_even_when_they_say_nothing() {
        // The brief quotes both. Dropping either makes it describe a
        // conversation the file does not contain.
        let turns = vec![person("hey"), assistant("what are we building"), person("thanks")];

        let (kept, report) = select(&turns, usize::MAX);

        assert_eq!(kept.len(), 3);
        assert_eq!(report.filler, 0);
    }

    /* ── The budget ──────────────────────────────────────────────────────── */

    #[test]
    fn an_oversized_conversation_drops_its_least_substantial_turns() {
        let mut turns = vec![person("set the budget to six hundred thousand")];
        for i in 0..40 {
            turns.push(assistant(&format!("filler body number {i} {}", "x".repeat(4_000))));
        }
        turns.push(Turn {
            role: Role::Assistant,
            blocks: vec![
                Block::Thought("this is the part that cannot be recovered".repeat(40)),
                Block::Said("done".into()),
            ],
        });
        turns.push(person("and where did it get to"));

        let (kept, report) = select(&turns, 60_000);

        assert!(report.overflow > 0, "it did not fit, so something had to go");
        let total: usize = kept.iter().map(weight).sum();
        assert!(total <= 60_000, "what is left fits the budget");
        assert!(
            kept.iter().any(|t| t.blocks.iter().any(|b| matches!(b, Block::Thought(_)))),
            "the reasoning outranks bulk, and bulk is what should have gone"
        );
    }

    #[test]
    fn what_fits_is_left_entirely_alone() {
        let turns = vec![
            person("how should the index be ordered"),
            assistant("by rowid, which is reading order"),
        ];

        let (kept, report) = select(&turns, usize::MAX);

        assert_eq!(kept.len(), 2);
        assert_eq!(report.dropped(), 0);
    }

    #[test]
    fn a_tool_call_is_never_separated_from_what_came_back() {
        let turns = vec![
            person("read the file"),
            Turn {
                role: Role::Assistant,
                blocks: vec![Block::Did {
                    tool: "Read".into(),
                    input: "src/main.rs".into(),
                }],
            },
            Turn {
                role: Role::You,
                blocks: vec![Block::Saw {
                    tool_use_id: "t1".into(),
                    output: "fn main() {}".into(),
                    failed: false,
                }],
            },
            person("thanks"),
            person("what did it say"),
        ];

        let (kept, _) = select(&turns, 1);

        let calls = kept.iter().filter(|t| t.blocks.iter().any(|b| matches!(b, Block::Did { .. })));
        let results = kept.iter().filter(|t| t.blocks.iter().any(|b| matches!(b, Block::Saw { .. })));
        assert_eq!(
            calls.count(),
            results.count(),
            "a call with no result reads as a model that never found out what happened"
        );
    }

    #[test]
    fn the_same_conversation_selects_the_same_way_twice() {
        let turns: Vec<Turn> = (0..30)
            .map(|i| person(&format!("turn number {i} {}", "y".repeat(2_000))))
            .collect();

        let (first, _) = select(&turns, 20_000);
        let (again, _) = select(&turns, 20_000);

        assert_eq!(first, again, "no map iteration order, no clock, no randomness");
    }

    /**
     * What this actually leaves out of a real conversation.
     *
     * `cargo test --bin sidq real_selection -- --ignored --nocapture`
     *
     * Not an assertion, and it cannot be one: a selection that is subtly wrong
     * looks exactly like one that is right until somebody reads it. `profile`
     * keeps a diagnostic for the same reason and says so at more length. This
     * prints every turn that was dropped, in full, so the question "would I
     * have minded losing that?" can actually be answered before anyone else
     * has to ask it.
     */
    #[test]
    #[ignore]
    fn real_selection() {
        let sessions = crate::work_history::recent_sessions(20);
        let Some(session) = sessions.iter().max_by_key(|s| s.turns) else {
            println!("no conversations on this machine");
            return;
        };
        let Some(turns) = crate::work_history::session_capture(&session.session_id) else {
            println!("could not read {}", session.session_id);
            return;
        };

        let (kept, report) = select(&turns, 600_000);
        let before: usize = turns.iter().map(weight).sum();
        let after: usize = kept.iter().map(weight).sum();

        println!("\n{} — {} turns, {before} chars", session.title, turns.len());
        println!("kept {} turns, {after} chars", kept.len());
        println!("dropped {} as filler, {} to fit\n", report.filler, report.overflow);

        let mut keep: Vec<bool> = turns.iter().map(|t| !is_filler(t)).collect();
        protect_anchors(&mut keep);
        protect_tool_pairs(&turns, &mut keep);
        for (i, (turn, kept)) in turns.iter().zip(&keep).enumerate() {
            if *kept {
                continue;
            }
            let said: String = turn
                .blocks
                .iter()
                .filter_map(|b| match b {
                    Block::Said(t) => Some(t.as_str()),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join(" ");
            println!("  filler, turn {i}: {said:?}");
        }
    }

    #[test]
    fn a_conversation_with_no_reasoning_is_still_ranked_on_what_it_has() {
        // Everything off a web page arrives like this: plain text, no thinking,
        // no tools, no interruptions. It must still rank.
        let mut turns = vec![person("start")];
        turns.push(person("always use British spelling in the copy"));
        for i in 0..30 {
            turns.push(assistant(&format!("body {i} {}", "z".repeat(3_000))));
        }
        turns.push(person("end"));

        let (kept, report) = select(&turns, 30_000);

        assert!(report.overflow > 0);
        assert!(
            kept.iter().any(|t| matches!(&t.blocks[0], Block::Said(s) if s.contains("British"))),
            "a standing instruction outranks bulk even with no other signal available"
        );
    }
}
