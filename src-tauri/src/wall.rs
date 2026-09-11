//! Noticing the moment an assistant stops.
//!
//! ── Why this exists ──────────────────────────────────────────────────────────
//!
//! Hitting a limit mid-problem is the most hated moment in this entire
//! workflow. Four hours in, the assistant stops, and the only way forward is to
//! start again somewhere else and lose everything.
//!
//! Sidq already fixes that, and it fixes it only for people who remember Sidq
//! exists, think of it at the worst moment of their day, press a key and pick a
//! row. Three chances to not use the thing that would have saved them. A tool
//! that has to be remembered at the moment of maximum frustration is a tool
//! nobody credits with anything.
//!
//! So Sidq watches for the wall instead. When it arrives, the continuation is
//! already there, aimed at the conversation that just stopped.
//!
//! ── Why the patterns are so narrow ──────────────────────────────────────────
//!
//! This interrupts somebody. A false positive is a notification in the middle
//! of work that was going fine, which is worse than staying silent — the
//! feature only has to be wrong twice before it gets turned off and the real
//! moment is never caught either.
//!
//! So a pattern qualifies on two counts and not one. It has to be text a vendor
//! generates rather than text a person could type, and it is only ever matched
//! against an assistant's own turn. "we should handle the rate limit here" in a
//! conversation about rate limits must never fire this, and it is exactly the
//! sentence somebody types while building something that talks to an API.
//!
//! Claude Code's marker below is verified against real transcripts: eleven
//! occurrences, all assistant turns, none of them a person talking. Nothing else
//! is in here, because a pattern nobody has seen fire is a guess, and guesses in
//! this module cost more than they pay.

/// One vendor's way of saying it has stopped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Marker {
    /// The `sessions.source` this applies to.
    pub source: &'static str,
    /// Matched case-insensitively against an assistant turn, and nothing else.
    pub needle: &'static str,
}

/**
 * Every marker Sidq will act on.
 *
 * Verified against real transcripts, one vendor at a time. The list is short
 * because it is honest rather than because the work is unfinished: adding
 * ChatGPT's or Cursor's wording means finding a real instance of it first, and
 * the browser assistants need the extension to see the page at all.
 */
pub const MARKERS: [Marker; 2] = [
    /*
     * Verified: eleven occurrences across real Claude Code transcripts, every
     * one an assistant turn. The tracking parameter is the tell — no person
     * types `?from=cc_cli_limit`, which is what makes this safe to act on.
     */
    Marker {
        source: "claude-code",
        needle: "from=cc_cli_limit",
    },
    /*
     * The same event as rendered without the link. Kept separate rather than
     * loosened into one fuzzy pattern, so that if this one ever fires wrongly
     * it can be removed without taking the reliable one with it.
     */
    Marker {
        source: "claude-code",
        needle: "you've hit your monthly spend limit",
    },
];

/**
 * Has this assistant stopped?
 *
 * `body` must be an assistant's own turn. Passing a user's turn is the one way
 * to make this wrong, and the reason the caller's side of that is asserted in
 * `index_store` rather than assumed here.
 */
pub fn hit(source: &str, body: &str) -> bool {
    let body = body.to_lowercase();
    MARKERS
        .iter()
        .any(|m| m.source == source && body.contains(m.needle))
}

/// Whether Sidq watches for this source's wall at all.
pub fn watched(source: &str) -> bool {
    MARKERS.iter().any(|m| m.source == source)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The real thing, copied from a transcript on this machine.
    const REAL: &str = "You've hit your monthly spend limit · raise it at \
                        claude.ai/settings/usage?from=cc_cli_limit";

    #[test]
    fn the_real_marker_fires() {
        assert!(hit("claude-code", REAL));
    }

    /// Things somebody genuinely types while building software.
    const INNOCENT: [&str; 8] = [
        "we should handle the rate limit here",
        "what happens when you hit your usage limit?",
        "add a retry when the API returns a rate limit error",
        "the limit will reset at some point, right?",
        "I keep hitting limits in Claude",
        "rate limiting is done in the middleware",
        "you've hit the ceiling on that plan I think",
        "monthly spend is capped at the org level",
    ];

    #[test]
    fn a_person_talking_about_rate_limits_never_fires_it() {
        /*
         * The failure that would kill this feature. Somebody building anything
         * that talks to an API discusses rate limits constantly, and a
         * notification in the middle of work that was going fine is worse than
         * never firing at all — it only has to be wrong twice before the whole
         * thing gets turned off.
         */
        for innocent in INNOCENT {
            assert!(!hit("claude-code", innocent), "fired on: {innocent}");
        }
    }

    #[test]
    fn a_marker_only_applies_to_the_assistant_it_was_seen_in() {
        // Vendors word this differently. Matching Claude Code's text against a
        // Cursor session would be asserting something nobody has checked.
        assert!(!hit("cursor", REAL));
        assert!(!hit("chatgpt", REAL));
    }

    #[test]
    fn matching_does_not_care_about_case() {
        assert!(hit("claude-code", &REAL.to_uppercase()));
        assert!(hit("claude-code", &REAL.to_lowercase()));
    }

    #[test]
    fn an_unwatched_source_says_so_rather_than_pretending() {
        /*
         * `watched` is how the rest of the app can tell "no wall here" from "we
         * do not look at this one", which are different answers and get
         * different copy.
         */
        assert!(watched("claude-code"));
        assert!(!watched("cursor"));
        assert!(!watched("chatgpt"));
    }

    #[test]
    fn every_marker_is_specific_enough_to_be_safe() {
        /*
         * A guard on the list itself, aimed at the next person adding a vendor
         * and reaching for something like "limit" or "quota".
         *
         * Tested against sentences rather than against length, which was the
         * first version of this and was wrong: `from=cc_cli_limit` is seventeen
         * characters and is the *most* specific marker here, because no person
         * types a tracking parameter. Length was a proxy for the property. The
         * property is that it never matches something somebody said.
         */
        for m in MARKERS {
            for innocent in INNOCENT {
                assert!(
                    !innocent.to_lowercase().contains(m.needle),
                    "{:?} matches something a person would type: {innocent}",
                    m.needle
                );
            }
            assert_eq!(
                m.needle,
                m.needle.to_lowercase(),
                "{:?} must be lowercase",
                m.needle
            );
            assert!(!m.source.is_empty());
        }
    }
}
