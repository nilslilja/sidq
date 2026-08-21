//! What you keep telling assistants, gathered into one list.
//!
//! Every assistant starts from nothing. You explain your stack to Claude on
//! Monday, to Cursor on Tuesday and to ChatGPT on Thursday, and none of them can
//! see the other two doing it. The instructions are not lost — they are sitting
//! in transcripts on this disk, spread across four tools and two hundred
//! conversations, which is the same as lost.
//!
//! ── Quoted, never summarised ─────────────────────────────────────────────────
//! Every line here is a sentence you actually typed, returned verbatim. Nothing
//! is paraphrased and nothing is generated. A summary would be both less useful
//! and less trustworthy: the value of "never use em dashes" is that it is the
//! exact rule, and a model rewriting it into "prefers concise punctuation" has
//! destroyed the only thing worth carrying.
//!
//! That also means this needs no model call, so it costs nothing to run and
//! nothing leaves the machine.
//!
//! ── What counts as an instruction ────────────────────────────────────────────
//! Standing instructions have a small number of shapes in English, and they are
//! recognisable without understanding them: they begin with an imperative
//! ("always", "never", "make sure"), or they state a fact about you or the work
//! ("we use", "I'm building"). Questions are excluded — a question is the thing
//! you needed once, not a rule you live by.

use std::collections::HashMap;

/// Openers that mark a sentence as a rule rather than a request.
const RULE_OPENERS: [&str; 12] = [
    "always ",
    "never ",
    "don't ",
    "do not ",
    "make sure ",
    "prefer ",
    "avoid ",
    "stop ",
    "keep ",
    "use ",
    "remember ",
    "please use ",
];

/// Phrases that state a standing fact, anywhere in the sentence.
const FACT_MARKERS: [&str; 12] = [
    " we use ",
    " i use ",
    " we're using ",
    " i prefer ",
    " we prefer ",
    " our stack ",
    " i'm building ",
    " we're building ",
    " i am building ",
    " we are building ",
    " i work in ",
    " the project is ",
];

/**
 * Words too common to say anything about which rule a sentence is.
 *
 * The rule openers are in here too. "never" is six letters and survives every
 * length filter, so without this every imperative would look alike to the
 * grouping below and "never use em dashes" would be filed next to "never commit
 * to main" on the strength of the word "never".
 */
const STOPWORDS: [&str; 81] = [
    "about", "actually", "after", "again", "against", "also", "always", "anything", "avoid", "because", "been", "before", "being", "between", "both", "could", "dont", "each", "every", "everything", "from", "give", "good", "have", "here", "instead", "into", "just", "keep", "like", "make", "maybe", "more", "most", "much", "need", "never", "okay", "only", "onto", "over", "please", "prefer", "rather", "really", "remember", "same", "should", "some", "something", "stop", "sure", "take", "than", "that", "their", "them", "then", "there", "these", "they", "thing", "things", "this", "those", "through", "under", "used", "using", "very", "want", "well", "what", "when", "where", "which", "while", "will", "with", "would", "your",
];

/**
 * A word in this share of all your instructions says nothing about any of them.
 *
 * Applied only once there are enough instructions for the proportion to mean
 * something. On a handful of sentences everything looks common, and dropping
 * the one word they share would scatter a real repeated rule into singletons.
 */
const GENERIC_SHARE: f64 = 0.5;
const GENERIC_FLOOR: usize = 20;

/**
 * Shortest word that can name what a rule is about.
 *
 * Four, not five, because the words that matter most here are short: pnpm, npm,
 * jest, vite, rust, main, sql. At five, "always use pnpm" has no distinctive
 * word at all and falls out of the profile entirely, which is the exact shape
 * of instruction this is for.
 */
const MIN_WORD_CHARS: usize = 4;

/**
 * Markers of text that arrived in a user turn without a person typing it.
 *
 * Assistants put a great deal into the user's side of a transcript: injected
 * skill documents, rule files, command output, reminders. All of it is stored
 * as something "you" said, and none of it is.
 *
 * This matters more here than anywhere else in Sidq. Run against a real index
 * without it, the top of the profile was `avoid tight tracking on body text
 * (HIG, MD)` and `use labels with icons (Material Design)` — lines out of a
 * design skill, presented back to the person as their own standing rules.
 */
const INJECTED_MARKERS: [&str; 7] = [
    "<system-reminder>",
    "<command-name>",
    "<command-message>",
    "<local-command-stdout>",
    "Base directory for this skill:",
    "Contents of /",
    "This session is being continued from a previous conversation",
];

/**
 * Longer than this and somebody pasted it.
 *
 * Standing instructions are short. This costs the occasional real rule buried
 * in a long message, and it is worth it: one document slipping through puts
 * fifty of its bullet points into a list of twenty-five things.
 */
const MAX_TURN_CHARS: usize = 2_000;

/**
 * A rule has to be about at least two things.
 *
 * Without this the list filled with "Keep the setup", "Use the program",
 * "make sure its fine" — grammatically instructions, and carrying no
 * instruction. One distinctive word is a topic; two is a rule.
 */
const MIN_CONTENT_WORDS: usize = 2;

/// Long enough to be a rule, short enough that it is not a pasted paragraph.
const MIN_CHARS: usize = 12;
const MAX_CHARS: usize = 220;

/// How many of your turns to read. Beyond this, older ones add repetition only.
pub const TURN_BUDGET: usize = 4_000;

/// One thing you keep saying.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fact {
    /// Your own sentence, exactly as you typed it.
    pub text: String,
    /// How many separate conversations you said some version of it in.
    pub conversations: usize,
}

/**
 * Did a person type this, or did the assistant put it there?
 *
 * Only what a person typed can be evidence of how that person works.
 */
fn is_typed(body: &str) -> bool {
    if body.chars().count() > MAX_TURN_CHARS {
        return false;
    }
    if INJECTED_MARKERS.iter().any(|m| body.contains(m)) {
        return false;
    }
    // Headings and bold in a chat message mean a document was pasted into it.
    body.lines()
        .all(|l| !l.starts_with('#') && !l.contains("**"))
}

/**
 * Split a turn into sentences, skipping anything inside a code fence.
 *
 * Split on terminators and newlines both, because instructions are as often a
 * bullet or a line of their own as they are a sentence inside a paragraph.
 *
 * The fence tracking is not fussiness. These transcripts are largely code, and
 * a comment reading `// always use strict` is indistinguishable from a rule
 * once the fence around it has been thrown away — so the profile fills up with
 * lines out of files nobody was talking about.
 */
fn sentences(body: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut inside_fence = false;

    for line in body.lines() {
        if line.trim_start().starts_with("```") {
            inside_fence = !inside_fence;
            continue;
        }
        if inside_fence {
            continue;
        }

        for part in line.split(['.', '!', '?', ';']) {
            let part = part.trim().trim_start_matches(['-', '*', '#', '>', ' ']).trim();
            if !part.is_empty() {
                out.push(part.to_string());
            }
        }
    }

    out
}

/**
 * Is this sentence a standing instruction?
 *
 * Deliberately strict. A profile that includes half of everything you typed is
 * not a profile, it is a transcript with extra steps, and the person stops
 * reading it on the first wrong line.
 */
fn is_instruction(sentence: &str) -> bool {
    let length = sentence.chars().count();
    if !(MIN_CHARS..=MAX_CHARS).contains(&length) {
        return false;
    }

    // A question is what you needed once, not a rule you hold.
    if sentence.contains('?') {
        return false;
    }

    // A trailing colon introduces something. It is a preamble to a one-off
    // task ("Use your X tool to do the following:"), never a standing rule.
    if sentence.ends_with(':') {
        return false;
    }

    // "never mind" opens with an imperative and is not one. It appeared three
    // times in the first real run, above most of the genuine rules.
    let opening = sentence.to_lowercase();
    if opening.starts_with("never mind") || opening.starts_with("nevermind") {
        return false;
    }

    // Code, paths and shell lines are not instructions to a person.
    if sentence.contains("://") || sentence.starts_with('/') {
        return false;
    }
    if sentence.contains(['{', '}', '=', '<', '>', '|']) || sentence.contains("()") {
        return false;
    }

    // "(HIG, MD)", "(WCAG)", "(Material Design)". Documentation cites its
    // sources mid-sentence; nobody types that into a chat box.
    if sentence.contains("(HIG") || sentence.contains("(MD") || sentence.contains("(WCAG") {
        return false;
    }

    let lower = sentence.to_lowercase();
    let padded = format!(" {lower} ");

    RULE_OPENERS.iter().any(|o| lower.starts_with(o))
        || FACT_MARKERS.iter().any(|m| padded.contains(m))
}

/// The distinctive words in a sentence: long enough, and not filler.
fn content_words(sentence: &str) -> Vec<String> {
    let mut words: Vec<String> = sentence
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.chars().count() >= MIN_WORD_CHARS)
        .filter(|w| !STOPWORDS.contains(w))
        .map(str::to_string)
        .collect();

    words.sort();
    words.dedup();
    words
}

/**
 * Which rule a sentence belongs to: the word it shares with the most others.
 *
 * Nobody phrases the same rule twice. "never use em dashes" one week and "stop
 * putting em dashes everywhere" the next are one standing instruction said in
 * two conversations, and the count is the whole signal — filing them as two
 * separate rules said once each throws away the only thing worth knowing.
 *
 * Matching on the exact sentence cannot see that. Matching on the whole set of
 * words cannot either, because the sets differ. What the two do share is the
 * word the rule is *about*, and the thing that marks it out is exactly that it
 * recurs. So each sentence is filed under its most repeated word.
 *
 * Words so common that they appear in half of everything are skipped, or the
 * list collapses into one enormous group named after whatever you say most.
 */
fn group_key(words: &[String], frequency: &HashMap<String, usize>, generic_above: usize) -> Option<String> {
    words
        .iter()
        .filter(|w| frequency.get(*w).copied().unwrap_or(0) <= generic_above)
        .max_by(|a, b| {
            let (fa, fb) = (frequency[*a], frequency[*b]);
            // Ties broken on the word itself, so the same input always groups
            // the same way regardless of the order the index returned it in.
            fa.cmp(&fb).then_with(|| b.cmp(a))
        })
        .cloned()
}

/**
 * Build the profile from your own turns.
 *
 * Ranked by how many separate conversations a rule appeared in, because saying
 * something once is a decision and saying it in six conversations is a standing
 * instruction every assistant you use should have had from the start.
 *
 * The shortest phrasing of each rule wins. When you have said the same thing
 * six ways, the tightest one is the one worth carrying into a prompt.
 */
pub fn build(turns: &[(String, String)], limit: usize) -> Vec<Fact> {
    // Every instruction found, with its session and its distinctive words.
    let mut found: Vec<(&String, String, Vec<String>)> = Vec::new();
    let mut frequency: HashMap<String, usize> = HashMap::new();

    for (session_id, body) in turns {
        if !is_typed(body) {
            continue;
        }
        for sentence in sentences(body) {
            if !is_instruction(&sentence) {
                continue;
            }
            let words = content_words(&sentence);
            if words.len() < MIN_CONTENT_WORDS {
                continue;
            }
            for word in &words {
                *frequency.entry(word.clone()).or_insert(0) += 1;
            }
            found.push((session_id, sentence, words));
        }
    }

    let generic_above = if found.len() >= GENERIC_FLOOR {
        (found.len() as f64 * GENERIC_SHARE) as usize
    } else {
        usize::MAX
    };

    // key -> (best phrasing, its content-word count, conversations it appeared in)
    let mut groups: HashMap<String, (String, usize, Vec<String>)> = HashMap::new();

    for (session_id, sentence, words) in found {
        let Some(key) = group_key(&words, &frequency, generic_above) else {
            continue;
        };

        let entry = groups
            .entry(key)
            .or_insert_with(|| (sentence.clone(), words.len(), Vec::new()));

        /*
         * The fullest phrasing wins, not the shortest.
         *
         * Shortest sounded like "the most decided version" and in practice
         * meant the most truncated: a group whose real rule was "keep the setup
         * to three screens and no scrolling" was represented in the list by
         * "Keep the setup", which instructs nobody to do anything.
         */
        let better = words.len() > entry.1
            || (words.len() == entry.1 && sentence.chars().count() < entry.0.chars().count());
        if better {
            entry.0 = sentence.clone();
            entry.1 = words.len();
        }
        if !entry.2.contains(session_id) {
            entry.2.push(session_id.clone());
        }
    }

    let mut facts: Vec<Fact> = groups
        .into_values()
        .map(|(text, _, sessions)| Fact {
            text,
            conversations: sessions.len(),
        })
        .collect();

    // Most-repeated first; ties broken on the shorter phrasing, which reads as
    // the more decided one.
    facts.sort_by(|a, b| {
        b.conversations
            .cmp(&a.conversations)
            .then_with(|| a.text.len().cmp(&b.text.len()))
            .then_with(|| a.text.cmp(&b.text))
    });
    facts.truncate(limit);
    facts
}

/**
 * The profile as something you can paste at the top of a new conversation.
 *
 * Framed as what you have told assistants before, not as facts about you. An
 * assistant handed "the user prefers X" has to decide whether to believe it; an
 * assistant handed "here is what I have told assistants before" is being given
 * a quotation, which is both true and easier to act on.
 */
pub fn as_preamble(facts: &[Fact]) -> String {
    if facts.is_empty() {
        return String::new();
    }

    let mut out = String::from(
        "# How I work\n\nThings I have told assistants before, taken from my own conversations. \
Apply them unless I say otherwise.\n\n",
    );

    for fact in facts {
        out.push_str("- ");
        out.push_str(&fact.text);
        out.push('\n');
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /**
     * Manual diagnostic against the real machine.
     *
     * Ignored because it reads whatever is actually indexed, so it can neither
     * assert nor run in CI. It exists because a profile that is subtly wrong
     * looks exactly like one that is right until you read it, and this is the
     * only way to read it before anybody is shown it.
     *
     * cargo test --bin sidq real_profile -- --ignored --nocapture
     */
    #[test]
    #[ignore]
    fn real_profile() {
        let conn = crate::index_store::open().expect("index opens");
        let turns = crate::index_store::own_turns(&conn, TURN_BUDGET);
        let started = std::time::Instant::now();
        let facts = build(&turns, 25);

        println!("\n  {} of your turns, built in {:?}", turns.len(), started.elapsed());
        println!("  {} facts\n", facts.len());
        for fact in &facts {
            println!("  [{}x] {}", fact.conversations, fact.text);
        }
        println!();
    }

    fn turns(rows: &[(&str, &str)]) -> Vec<(String, String)> {
        rows.iter()
            .map(|(s, b)| (s.to_string(), b.to_string()))
            .collect()
    }

    #[test]
    fn picks_up_a_rule_stated_as_an_imperative() {
        let facts = build(&turns(&[("a", "never use em dashes in anything you write")]), 10);

        assert_eq!(facts.len(), 1);
        assert_eq!(facts[0].text, "never use em dashes in anything you write");
        assert_eq!(facts[0].conversations, 1);
    }

    #[test]
    fn counts_the_same_rule_phrased_differently_as_one_rule() {
        /*
         * The reason this exists. Two phrasings across two conversations is one
         * standing instruction said twice, and treating it as two rules said
         * once each throws away the only signal there is.
         */
        let facts = build(
            &turns(&[
                ("a", "never use em dashes in the copy"),
                ("b", "stop putting em dashes everywhere in the copy"),
            ]),
            10,
        );

        assert_eq!(facts.len(), 1, "one rule, not two");
        assert_eq!(facts[0].conversations, 2);
        // Either phrasing is a fair representative; what it must never be is
        // something neither of them said.
        assert!(
            facts[0].text == "never use em dashes in the copy"
                || facts[0].text == "stop putting em dashes everywhere in the copy",
            "got {:?}",
            facts[0].text
        );
    }

    #[test]
    fn saying_it_twice_in_one_conversation_is_still_once() {
        // Otherwise repeating yourself to an assistant that ignored you would
        // rank higher than a rule you genuinely hold across months of work.
        let facts = build(
            &turns(&[
                ("a", "always use pnpm for installs"),
                ("a", "always use pnpm for installs, never npm"),
            ]),
            10,
        );

        assert_eq!(facts[0].conversations, 1);
    }

    #[test]
    fn ranks_what_you_repeat_above_what_you_said_once() {
        let facts = build(
            &turns(&[
                ("a", "always run the tests before committing"),
                ("b", "always run the tests before you commit"),
                ("c", "always run the tests first"),
                ("d", "prefer tailwind over styled components here"),
            ]),
            10,
        );

        assert_eq!(facts[0].conversations, 3);
        assert!(facts[0].text.contains("tests"));
    }

    #[test]
    fn leaves_questions_out() {
        // A question is what you needed that day. It is not how you work.
        let facts = build(&turns(&[("a", "should we always use pnpm here?")]), 10);

        assert!(facts.is_empty());
    }

    #[test]
    fn leaves_ordinary_conversation_out() {
        let facts = build(
            &turns(&[
                ("a", "that didn't work, still getting the same error"),
                ("b", "ok thanks"),
                ("c", "hmm"),
            ]),
            10,
        );

        assert!(facts.is_empty(), "got {facts:?}");
    }

    #[test]
    fn leaves_pasted_code_and_urls_out() {
        let facts = build(
            &turns(&[
                ("a", "use https://example.com/docs/v2/getting-started for this"),
                ("b", "/usr/local/bin/never use this path"),
                ("c", "```\nalways use strict\n```"),
            ]),
            10,
        );

        assert!(facts.is_empty(), "got {facts:?}");
    }

    #[test]
    fn leaves_a_pasted_paragraph_out() {
        // Long text starting with an imperative is almost always something
        // pasted in, not a rule. It would dominate the list on length alone.
        let long = format!("always {}", "consider the following details ".repeat(12));
        let facts = build(&turns(&[("a", &long)]), 10);

        assert!(facts.is_empty());
    }

    #[test]
    fn finds_a_rule_stated_as_a_fact_rather_than_an_order() {
        let facts = build(
            &turns(&[("a", "for context we use postgres with drizzle on this project")]),
            10,
        );

        assert_eq!(facts.len(), 1);
        assert!(facts[0].text.contains("postgres"));
    }

    #[test]
    fn splits_a_turn_that_holds_several_rules_on_separate_lines() {
        let facts = build(
            &turns(&[(
                "a",
                "- always use pnpm for installs\n- never commit straight to main\n- prefer vitest over jest for tests",
            )]),
            10,
        );

        assert_eq!(facts.len(), 3);
    }

    #[test]
    fn a_rule_about_only_one_thing_is_dropped() {
        /*
         * A deliberate loss, measured against the real index.
         *
         * "always use pnpm" is a good rule and it goes. Letting one distinctive
         * word through also lets through "Use the program", "Keep the setup"
         * and "make sure its fine", which is what the top of the list actually
         * filled with — instructions in grammar only. Two words is the line
         * that separated the real rules from the noise on real data.
         */
        assert!(build(&turns(&[("a", "always use pnpm")]), 10).is_empty());
        assert_eq!(build(&turns(&[("a", "always use pnpm for installs")]), 10).len(), 1);
    }

    #[test]
    fn leaves_out_a_preamble_to_a_one_off_task() {
        // "…to do the following:" introduces a job, not a standing rule.
        let facts = build(
            &turns(&[("a", "Use your prospecting tool to run this sequence in one go:")]),
            10,
        );

        assert!(facts.is_empty());
    }

    #[test]
    fn leaves_out_never_mind() {
        // Opens with an imperative and is not one. It outranked most of the
        // real rules on the first run against a real index.
        assert!(build(&turns(&[("a", "never mind, stupid question")]), 10).is_empty());
    }

    #[test]
    fn leaves_out_documentation_pasted_into_a_turn() {
        /*
         * The failure that made this filter exist. Assistants inject skill
         * files and rule documents into the user's side of a transcript, so
         * without this the profile hands somebody a design system's bullet
         * points back as their own standing rules.
         */
        let injected = "Base directory for this skill: /x/y\navoid tight tracking on body text";
        assert!(build(&turns(&[("a", injected)]), 10).is_empty());
        assert!(build(&turns(&[("a", "<system-reminder>\nalways use the token scale")]), 10).is_empty());
        assert!(build(&turns(&[("a", "avoid color-only meaning (HIG, MD)")]), 10).is_empty());
    }

    #[test]
    fn picks_the_fullest_phrasing_not_the_most_truncated() {
        /*
         * Shortest-wins read as "the most decided version" and delivered the
         * most truncated one: a rule whose real statement was a full sentence
         * showed up in the list as "Keep the setup".
         */
        let facts = build(
            &turns(&[
                ("a", "keep the setup screens to three, no scrolling"),
                ("b", "keep the setup short"),
            ]),
            10,
        );

        assert_eq!(facts.len(), 1);
        assert!(facts[0].text.contains("scrolling"), "got {:?}", facts[0].text);
    }

    #[test]
    fn the_preamble_quotes_rather_than_asserts() {
        let facts = build(&turns(&[("a", "always use pnpm for installs")]), 10);
        let preamble = as_preamble(&facts);

        assert!(preamble.contains("always use pnpm for installs"));
        // Framed as something said, not as a fact about a person. An assistant
        // can act on a quotation without having to decide whether to trust it.
        assert!(preamble.contains("told assistants"));
    }

    #[test]
    fn an_empty_profile_produces_nothing_to_paste() {
        // Never a heading with no list under it. An empty preamble spends
        // context saying that there is nothing to say.
        assert_eq!(as_preamble(&[]), "");
    }

    #[test]
    fn respects_the_limit() {
        let many: Vec<(String, String)> = (0..50)
            .map(|i| (format!("s{i}"), format!("always use widget{i} in the layout")))
            .collect();

        assert_eq!(build(&many, 5).len(), 5);
    }

    #[test]
    fn returns_your_sentence_untouched() {
        /*
         * The whole claim of this feature. Nothing here paraphrases, so the
         * text that comes out has to be findable, character for character, in
         * something you typed.
         */
        let original = "never use Tailwind's default palette, we have tokens";
        let facts = build(&turns(&[("a", original)]), 10);

        assert_eq!(facts[0].text, original);
    }
}
