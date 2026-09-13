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

/// The setting that decides whether the brief arrives on its own.
const BRIEF_KEY: &str = "ambient_brief";

/**
 * Whether to put the brief in front of a blank chat without being asked.
 *
 * On unless somebody turned it off. That is a real bet and worth naming: text
 * appearing in a message box nobody typed into reads as malware to somebody who
 * was not told it would. What makes it defensible is that Sidq says so the
 * first time it happens, and that undoing it is the ⌘Z the person already
 * knows, because a paste is a paste.
 *
 * Off would be safer and would also mean nobody ever sees the feature. Every
 * setting that has to be discovered before it does anything is a feature that
 * does nothing.
 */
pub fn brief_wanted(conn: &rusqlite::Connection) -> bool {
    crate::index_store::setting(conn, BRIEF_KEY).unwrap_or_else(|| "1".into()) == "1"
}

/**
 * The project somebody was last working in.
 *
 * Last touched, not largest. `index_store::projects` orders by total turns,
 * which answers "what have you spent the most time on" — a reasonable question
 * and the wrong one here. What belongs in a chat you just opened is what you
 * were doing ten minutes ago, even if that project is two conversations old.
 */
pub fn most_recent_project(
    projects: &[crate::index_store::ProjectRow],
) -> Option<String> {
    projects
        .iter()
        .max_by_key(|p| p.touched)
        .map(|p| p.path.clone())
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

    fn project(path: &str, turns: usize, touched: i64) -> crate::index_store::ProjectRow {
        crate::index_store::ProjectRow {
            path: path.to_string(),
            name: path.to_string(),
            conversations: 1,
            turns,
            minutes: 0,
            started: 0,
            touched,
        }
    }

    /// The big project is not the current one. Briefing a new chat with
    /// whatever somebody has worked on most would be right roughly once.
    #[test]
    fn the_brief_follows_what_was_last_touched_not_what_is_biggest() {
        let projects = [
            project("/Users/x/enormous-old-thing", 9000, 100),
            project("/Users/x/what-i-am-doing-now", 12, 900),
        ];
        assert_eq!(
            most_recent_project(&projects).as_deref(),
            Some("/Users/x/what-i-am-doing-now")
        );
    }

    #[test]
    fn nothing_indexed_means_nothing_to_say() {
        assert_eq!(most_recent_project(&[]), None);
    }


    /**
     * The brief is never sent, and this reads the code to prove it.
     *
     * `paste::into_focused` takes a boolean that decides whether return is
     * pressed afterwards. Putting text in somebody's message box is a help.
     * Sending it is Sidq speaking in their name to their account, which is a
     * different product and one nobody asked for, and the distance between the
     * two is one character in one argument.
     *
     * There is no runtime assertion that can catch that character, because by
     * the time it runs the message has gone. So this reads the call site. It is
     * the same shape as the guards on the TypeScript side that read Rust: the
     * thing being protected is not a value, it is a decision somebody could
     * reverse in a second without noticing what they had done.
     */
    #[test]
    fn nothing_in_the_ambient_path_ever_presses_send() {
        let source = include_str!("background.rs");

        let calls: Vec<&str> = source
            .match_indices("into_focused(")
            .map(|(at, _)| {
                let rest = &source[at..];
                &rest[..rest.find(')').map_or(rest.len(), |end| end + 1)]
            })
            .collect();

        assert!(
            !calls.is_empty(),
            "the ambient brief no longer types at all, so this guard is \
             watching nothing and one of the two is wrong"
        );
        for call in calls {
            assert!(
                call.contains("false"),
                "an ambient paste asks to be sent: {call}"
            );
        }
    }

}
