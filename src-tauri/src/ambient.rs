/*!
 * Noticing that somebody has just opened a blank chat.
 *
 * The handover Sidq already does is a thing you press. The version worth having
 * is the one you never press: you open a new chat, and what you were doing is
 * already in front of it. That needs one fact, which is whether the page in
 * front of you is a conversation nobody has started yet.
 *
 * ── Why the address decides it and the page does not ─────────────────────────
 * The obvious test is whether the transcript is empty. It is not usable. A
 * blank ChatGPT is full of text: the prompt suggestions, the greeting, and the
 * titles of every previous conversation in the sidebar, all of which arrive as
 * nodes under the same web area. Counting them says "busy" about a page nobody
 * has typed in.
 *
 * ── Whose answer this is ─────────────────────────────────────────────────────
 * `screen_reader::identifies_a_conversation`, which the disk sweep has been
 * using for this exact question since before any of this existed. The first
 * version of this file asked it again with a table of per-site path markers,
 * which is the approach that function's own comment argues against: a route
 * table needs editing every time one of these sites reorganises, and until
 * somebody notices it is wrong it fails silently and in the dangerous
 * direction, calling a real conversation blank.
 */

/**
 * Is this a conversation nobody has started?
 *
 * True for the page you land on when you click new chat, and false the moment
 * you send, because sending is what puts the id in the address.
 *
 * Only ask this about a URL `screen_reader::source_for` has already claimed.
 * Anywhere else the answer is meaningless, and acting on it types a project
 * brief into something that is not an assistant at all.
 */
pub fn is_fresh(url: &str) -> bool {
    !crate::screen_reader::identifies_a_conversation(url)
}

/**
 * Fires once, when somebody arrives at a blank chat.
 *
 * Edge triggered rather than asking "is a blank chat in front of me", which is
 * true for as long as you sit there and would brief you every time the sweep
 * came round. What makes it once per chat is that the answer only counts when
 * the page has changed since it was last asked.
 */
#[derive(Debug, Default)]
pub struct Arrivals {
    last: Option<String>,
}

impl Arrivals {
    /// The source, if this call is the moment of arrival at a blank chat.
    pub fn at(&mut self, source: Option<&str>, url: &str) -> Option<String> {
        let here = source.map(|source| format!("{source} {url}"));
        if here == self.last {
            return None;
        }
        self.last = here;

        let source = source?;
        is_fresh(url).then(|| source.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_chat_has_no_id_on_any_of_them() {
        for url in [
            "https://chatgpt.com/",
            "https://chatgpt.com/?model=gpt-5",
            "https://claude.ai/new",
            "https://gemini.google.com/app",
            "https://grok.com/",
            "https://chat.deepseek.com/",
        ] {
            assert!(is_fresh(url), "{url} should be blank");
        }
    }

    /**
     * Real ids, not short stand-ins.
     *
     * The first version of these tests invented ids like `abc-def` and `771a`,
     * which no site issues, and which the length rule correctly reads as route
     * names. Writing a test around a shape the world does not produce is how a
     * suite goes green over a bug, so these are the shapes the sites actually
     * use: a uuid from ChatGPT and Claude, sixteen hex from Gemini.
     */
    #[test]
    fn a_started_conversation_is_never_blank() {
        for url in [
            "https://chatgpt.com/c/6a58d612-6a10-83eb-ba16-a25d6f94eb61",
            "https://claude.ai/chat/0f4a1b2c-3d4e-5f60-8a91-b2c3d4e5f607",
            "https://gemini.google.com/app/434b357ad2df6173",
            "https://grok.com/chat/8c41f0d9-2b77-4e10-9a3f-61d8b0c4e5a2",
            "https://chat.deepseek.com/a/chat/s/7f3c1a90-55be-4d22-a1e0",
        ] {
            assert!(!is_fresh(url), "{url} has been started");
        }
    }

    /// A custom GPT has a landing page of its own and a conversation inside it.
    /// Reading the first as the second refuses to brief the exact place
    /// somebody most wants a brief.
    #[test]
    fn a_custom_gpt_landing_is_blank_and_its_conversation_is_not() {
        assert!(is_fresh("https://chatgpt.com/g/g-p-68abc12345/project"));
        assert!(!is_fresh(
            "https://chatgpt.com/g/g-p-68abc12345/c/6a58d612-6a10-83eb-ba16"
        ));
    }

    #[test]
    fn arriving_fires_once_and_sitting_there_does_not() {
        let mut arrivals = Arrivals::default();
        assert_eq!(
            arrivals.at(Some("chatgpt"), "https://chatgpt.com/"),
            Some("chatgpt".to_string())
        );
        assert_eq!(arrivals.at(Some("chatgpt"), "https://chatgpt.com/"), None);
        assert_eq!(arrivals.at(Some("chatgpt"), "https://chatgpt.com/"), None);
    }

    #[test]
    fn sending_in_a_chat_does_not_count_as_arriving_anywhere() {
        let mut arrivals = Arrivals::default();
        arrivals.at(Some("chatgpt"), "https://chatgpt.com/");
        assert_eq!(
            arrivals.at(
                Some("chatgpt"),
                "https://chatgpt.com/c/6a58d612-6a10-83eb-ba16-a25d6f94eb61"
            ),
            None
        );
    }

    /// Opening a second new chat is a second arrival, and the first one having
    /// turned into a conversation is what makes the address differ.
    #[test]
    fn the_next_new_chat_is_a_new_arrival() {
        let mut arrivals = Arrivals::default();
        arrivals.at(Some("chatgpt"), "https://chatgpt.com/");
        arrivals.at(
            Some("chatgpt"),
            "https://chatgpt.com/c/6a58d612-6a10-83eb-ba16-a25d6f94eb61",
        );
        assert_eq!(
            arrivals.at(Some("chatgpt"), "https://chatgpt.com/"),
            Some("chatgpt".to_string())
        );
    }

    #[test]
    fn leaving_for_something_that_is_not_an_assistant_arrives_nowhere() {
        let mut arrivals = Arrivals::default();
        assert_eq!(arrivals.at(None, "https://news.ycombinator.com/"), None);
        assert_eq!(
            arrivals.at(Some("claude.ai"), "https://claude.ai/new"),
            Some("claude.ai".to_string())
        );
    }
}
