/*!
 * Noticing that somebody has just opened a blank chat.
 *
 * The handover Sidq already does is a thing you press. The version worth having
 * is the one you never press: you open a new chat, and what you were doing is
 * already in front of it. That needs one fact this module supplies and nothing
 * else does, which is whether the page in front of you is a conversation nobody
 * has started yet.
 *
 * ── Why the address decides it and the page does not ─────────────────────────
 * The obvious test is whether the transcript is empty. It is not usable. A
 * blank ChatGPT is full of text: the prompt suggestions, the greeting, and the
 * titles of every previous conversation in the sidebar, all of which arrive as
 * nodes under the same web area. Counting them says "busy" about a page nobody
 * has typed in.
 *
 * The address does not have that problem. Every one of these sites keeps a
 * conversation at a URL containing its id and a new one at a URL without it,
 * and the move from one to the other is what happens the instant you send. So
 * a conversation id in the path means started, and no id means blank.
 */

/// The path segment a conversation's id follows, per source.
///
/// Named per site rather than guessed at, because the shapes genuinely differ:
/// `chatgpt.com/c/<id>`, `claude.ai/chat/<id>`, `gemini.google.com/app/<id>`,
/// `chat.deepseek.com/a/chat/s/<id>`.
fn id_follows(source: &str) -> Option<&'static str> {
    match source {
        "chatgpt" => Some("c"),
        "claude.ai" | "grok" => Some("chat"),
        "gemini" => Some("app"),
        "deepseek" => Some("s"),
        _ => None,
    }
}

/// The path, without scheme, host, query or fragment.
fn segments(url: &str) -> Vec<&str> {
    let after_scheme = url.split_once("://").map_or(url, |(_, rest)| rest);
    let path = after_scheme
        .split_once('/')
        .map_or("", |(_, path)| path)
        .split(['?', '#'])
        .next()
        .unwrap_or("");
    path.split('/').filter(|s| !s.is_empty()).collect()
}

/// The id of the conversation at this address, if it has one yet.
pub fn conversation_id(source: &str, url: &str) -> Option<String> {
    let marker = id_follows(source)?;
    let segments = segments(url);
    let at = segments.iter().position(|s| *s == marker)?;
    segments.get(at + 1).map(|id| (*id).to_string())
}

/**
 * Is this a conversation nobody has started?
 *
 * True for the page you land on when you click new chat, and false the moment
 * you send, because sending is what puts the id in the address.
 *
 * A source this does not know the shape of is never fresh. Guessing wrong here
 * types a project brief into the middle of somebody's conversation, and not
 * acting is the cheaper mistake by a wide margin.
 */
pub fn is_fresh(source: &str, url: &str) -> bool {
    id_follows(source).is_some() && conversation_id(source, url).is_none()
}

/**
 * Fires once, when somebody arrives at a blank chat.
 *
 * Edge triggered rather than asking "is a blank chat in front of me", which is
 * true for as long as you sit there and would brief you once a second. What
 * makes it once per chat is that the answer only counts when the page has
 * changed since it was last asked.
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
        is_fresh(source, url).then(|| source.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_chat_has_no_id_on_any_of_them() {
        for (source, url) in [
            ("chatgpt", "https://chatgpt.com/"),
            ("chatgpt", "https://chatgpt.com/?model=gpt-5"),
            ("claude.ai", "https://claude.ai/new"),
            ("gemini", "https://gemini.google.com/app"),
            ("grok", "https://grok.com/"),
            ("deepseek", "https://chat.deepseek.com/"),
        ] {
            assert!(is_fresh(source, url), "{source} {url} should be blank");
        }
    }

    #[test]
    fn a_started_conversation_is_never_blank() {
        for (source, url) in [
            ("chatgpt", "https://chatgpt.com/c/68c1f0aa-1234"),
            ("claude.ai", "https://claude.ai/chat/abc-def"),
            ("gemini", "https://gemini.google.com/app/9f2b71"),
            ("grok", "https://grok.com/chat/771a"),
            ("deepseek", "https://chat.deepseek.com/a/chat/s/4410"),
        ] {
            assert!(!is_fresh(source, url), "{source} {url} has been started");
            assert!(conversation_id(source, url).is_some());
        }
    }

    /// A custom GPT has a landing page of its own, and a conversation inside
    /// it. Reading the first as the second would refuse to brief the exact
    /// place somebody most wants a brief.
    #[test]
    fn a_custom_gpt_landing_is_blank_and_its_conversation_is_not() {
        assert!(is_fresh("chatgpt", "https://chatgpt.com/g/g-p-68abc/project"));
        assert!(!is_fresh(
            "chatgpt",
            "https://chatgpt.com/g/g-p-68abc/c/68c1f0aa"
        ));
    }

    /// Sidq knows how to read more sites than it knows the address shape of.
    /// Typing into one of those lands in the middle of a conversation.
    #[test]
    fn a_source_of_unknown_shape_is_never_treated_as_blank() {
        assert!(!is_fresh("perplexity", "https://perplexity.ai/"));
        assert!(!is_fresh("", "https://chatgpt.com/"));
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
            arrivals.at(Some("chatgpt"), "https://chatgpt.com/c/68c1f0aa"),
            None
        );
    }

    /// Opening a second new chat is a second arrival, and the first one having
    /// turned into a conversation is what makes the address differ.
    #[test]
    fn the_next_new_chat_is_a_new_arrival() {
        let mut arrivals = Arrivals::default();
        arrivals.at(Some("chatgpt"), "https://chatgpt.com/");
        arrivals.at(Some("chatgpt"), "https://chatgpt.com/c/68c1f0aa");
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
