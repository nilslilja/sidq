//! Everything you have ever said to Claude on the web.
//!
//! Claude Code and Cowork write transcripts to disk, so Sidq reads them without
//! being asked. claude.ai does not: the desktop app keeps an IndexedDB at
//! ~/Library/Application Support/Claude/IndexedDB/https_claude.ai_0, and it
//! holds a binary keyval store with no conversation text in it at all. Checked
//! rather than assumed — the file is 2.2MB and 31% printable, and the only
//! readable string in it is the name of the store.
//!
//! So the whole of claude.ai arrives one of two ways. The extension reads a
//! conversation from the page while the tab is open, which covers what you are
//! doing now. This covers everything else: the export Claude gives you from
//! Settings, which is every conversation you have ever had there, including all
//! the ones from before Sidq existed.
//!
//! ── Why this goes in the index and not in a list somewhere ───────────────────
//! An earlier importer read these files in the browser and kept titles and
//! timestamps, capped at thirty days. That made a list you could look at and
//! nothing else: no search, no profile, and no handover, because there was no
//! text behind any row. Parsing here puts claude.ai on exactly the same footing
//! as Claude Code — searchable, quotable in the profile, and handoverable.

use serde::Deserialize;

/// One message inside an exported conversation.
#[derive(Debug, Deserialize)]
struct ExportedMessage {
    #[serde(default)]
    sender: String,
    /// Present on older exports. Newer ones put the text in `content`.
    #[serde(default)]
    text: String,
    #[serde(default)]
    content: Vec<ContentBlock>,
    #[serde(default)]
    created_at: String,
}

#[derive(Debug, Deserialize)]
struct ContentBlock {
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    text: String,
}

#[derive(Debug, Deserialize)]
struct ExportedConversation {
    uuid: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    created_at: String,
    #[serde(default)]
    updated_at: String,
    #[serde(default)]
    chat_messages: Vec<ExportedMessage>,
}

/// One conversation, in the shape the index already stores.
#[derive(Debug, Clone, PartialEq)]
pub struct Imported {
    pub session_id: String,
    pub title: String,
    /// Milliseconds, matching what every other reader writes.
    pub ended_at: i64,
    pub turns: Vec<(String, String)>,
}

impl ExportedMessage {
    /// The text of a message, whichever shape this export uses.
    ///
    /// Both occur. Reading only `text` silently produces empty conversations on
    /// newer exports; reading only `content` does the same on older ones.
    fn body(&self) -> String {
        if !self.text.trim().is_empty() {
            return self.text.clone();
        }
        self.content
            .iter()
            .filter(|b| b.kind == "text")
            .map(|b| b.text.as_str())
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// "human" and "assistant" in the export; "You" and "Assistant" in the index.
    fn role(&self) -> &'static str {
        if self.sender == "human" { "You" } else { "Assistant" }
    }
}

/**
 * Parse an ISO 8601 timestamp into milliseconds.
 *
 * By hand, because pulling in a date library to read one fixed format that
 * Claude emits identically every time is not a trade worth making. Anything
 * unparseable returns 0, and the caller treats that as "no date" rather than as
 * 1970, which would otherwise sort every conversation to the bottom forever.
 */
fn millis_of(iso: &str) -> i64 {
    // 2025-08-14T09:21:33.123456Z
    let (date, rest) = iso.split_once('T').unwrap_or((iso, ""));
    let mut parts = date.split('-');
    let (y, m, d) = (
        parts.next().and_then(|v| v.parse::<i64>().ok()),
        parts.next().and_then(|v| v.parse::<i64>().ok()),
        parts.next().and_then(|v| v.parse::<i64>().ok()),
    );
    let (Some(y), Some(m), Some(d)) = (y, m, d) else { return 0 };
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return 0;
    }

    let time = rest.trim_end_matches('Z');
    let mut hms = time.split(':');
    let h = hms.next().and_then(|v| v.parse::<i64>().ok()).unwrap_or(0);
    let min = hms.next().and_then(|v| v.parse::<i64>().ok()).unwrap_or(0);
    let s = hms
        .next()
        .and_then(|v| v.split('.').next().and_then(|w| w.parse::<i64>().ok()))
        .unwrap_or(0);

    // Days since the epoch, by the civil-date algorithm. No leap seconds, no
    // timezones: the export is always UTC.
    let (y_adj, m_adj) = if m <= 2 { (y - 1, m + 12) } else { (y, m) };
    let era = if y_adj >= 0 { y_adj } else { y_adj - 399 } / 400;
    let yoe = y_adj - era * 400;
    let doy = (153 * (m_adj - 3) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;

    (days * 86_400 + h * 3_600 + min * 60 + s) * 1_000
}

/**
 * Read a Claude export.
 *
 * The file is `conversations.json` from Settings, an array of conversations.
 * Anything that is not that array, or is an array of something else, is an
 * error rather than an empty result: silently importing nothing from a file
 * somebody deliberately chose is the failure they will not report and will not
 * forgive.
 */
pub fn parse(raw: &str) -> Result<Vec<Imported>, String> {
    let conversations: Vec<ExportedConversation> = serde_json::from_str(raw)
        .map_err(|_| "That is not a Claude export. Look for conversations.json.".to_string())?;

    let out: Vec<Imported> = conversations
        .into_iter()
        .filter_map(|c| {
            let turns: Vec<(String, String)> = c
                .chat_messages
                .iter()
                .filter_map(|m| {
                    let body = m.body();
                    (!body.trim().is_empty()).then(|| (m.role().to_string(), body))
                })
                .collect();

            if turns.is_empty() {
                return None;
            }

            // The last message is when it actually ended. `updated_at` moves
            // when a conversation is renamed or starred, which would put a
            // conversation you touched but did not continue at the top.
            let ended_at = c
                .chat_messages
                .last()
                .map(|m| millis_of(&m.created_at))
                .filter(|&t| t > 0)
                .unwrap_or_else(|| {
                    let updated = millis_of(&c.updated_at);
                    if updated > 0 { updated } else { millis_of(&c.created_at) }
                });

            Some(Imported {
                session_id: c.uuid,
                title: if c.name.trim().is_empty() {
                    turns[0].1.chars().take(80).collect()
                } else {
                    c.name
                },
                ended_at,
                turns,
            })
        })
        .collect();

    if out.is_empty() {
        return Err("That export has no conversations with any messages in it.".into());
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const NEW_SHAPE: &str = r#"[{
        "uuid": "abc-123",
        "name": "Pricing page copy",
        "created_at": "2025-08-14T09:21:33.123456Z",
        "updated_at": "2025-08-14T10:00:00Z",
        "chat_messages": [
            { "sender": "human", "created_at": "2025-08-14T09:21:33Z",
              "content": [{ "type": "text", "text": "what should the tiers be" }] },
            { "sender": "assistant", "created_at": "2025-08-14T09:22:10Z",
              "content": [{ "type": "text", "text": "Three, and name them plainly." }] }
        ]
    }]"#;

    #[test]
    fn reads_a_conversation_with_its_turns() {
        let out = parse(NEW_SHAPE).unwrap();

        assert_eq!(out.len(), 1);
        assert_eq!(out[0].session_id, "abc-123");
        assert_eq!(out[0].title, "Pricing page copy");
        assert_eq!(out[0].turns[0], ("You".into(), "what should the tiers be".into()));
        assert_eq!(out[0].turns[1].0, "Assistant");
    }

    #[test]
    fn reads_the_older_shape_that_puts_text_at_the_top_level() {
        /*
         * Both shapes are in circulation. Reading only `content` produces empty
         * conversations on an older export and only `text` does the same on a
         * newer one — in both cases silently, which is the worst version.
         */
        let older = r#"[{
            "uuid": "d-1", "name": "Old one",
            "created_at": "2025-01-02T03:04:05Z", "updated_at": "2025-01-02T03:04:05Z",
            "chat_messages": [{ "sender": "human", "text": "hello", "created_at": "2025-01-02T03:04:05Z" }]
        }]"#;

        assert_eq!(parse(older).unwrap()[0].turns[0].1, "hello");
    }

    #[test]
    fn dates_it_by_the_last_message_not_by_when_it_was_renamed() {
        // `updated_at` moves when a conversation is starred or renamed, which
        // would float something you touched but never continued to the top.
        let out = parse(NEW_SHAPE).unwrap();
        assert_eq!(out[0].ended_at, millis_of("2025-08-14T09:22:10Z"));
        assert_ne!(out[0].ended_at, millis_of("2025-08-14T10:00:00Z"));
    }

    #[test]
    fn parses_the_timestamp_correctly() {
        // 2025-08-14T09:21:33Z is 1755163293 seconds. Getting this wrong puts
        // every conversation in 1970, where every recency filter drops them.
        assert_eq!(millis_of("2025-08-14T09:21:33Z"), 1_755_163_293_000);
        assert_eq!(millis_of("1970-01-01T00:00:00Z"), 0);
        assert_eq!(millis_of("2024-02-29T12:00:00Z"), 1_709_208_000_000, "leap day");
    }

    #[test]
    fn a_date_it_cannot_read_becomes_no_date_rather_than_1970() {
        assert_eq!(millis_of("not a date"), 0);
        assert_eq!(millis_of(""), 0);
        assert_eq!(millis_of("2025-13-01T00:00:00Z"), 0, "there is no month 13");
    }

    #[test]
    fn names_an_untitled_conversation_after_what_was_asked() {
        let untitled = r#"[{
            "uuid": "u-1", "name": "",
            "created_at": "2025-03-01T00:00:00Z", "updated_at": "2025-03-01T00:00:00Z",
            "chat_messages": [{ "sender": "human", "text": "how do I write a good changelog",
                                "created_at": "2025-03-01T00:00:00Z" }]
        }]"#;

        assert_eq!(parse(untitled).unwrap()[0].title, "how do I write a good changelog");
    }

    #[test]
    fn skips_a_conversation_that_has_no_messages() {
        let mixed = r#"[
            { "uuid": "empty", "name": "Nothing", "created_at": "2025-01-01T00:00:00Z",
              "updated_at": "2025-01-01T00:00:00Z", "chat_messages": [] },
            { "uuid": "real", "name": "Something", "created_at": "2025-01-01T00:00:00Z",
              "updated_at": "2025-01-01T00:00:00Z",
              "chat_messages": [{ "sender": "human", "text": "hi", "created_at": "2025-01-01T00:00:00Z" }] }
        ]"#;

        let out = parse(mixed).unwrap();
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].session_id, "real");
    }

    #[test]
    fn an_imported_conversation_is_searchable_and_can_be_handed_over() {
        /*
         * The whole chain, minus the file picker: parse, index, search, and
         * rebuild the transcript the handover needs.
         *
         * The last step is the one worth guarding. Imported and browser-captured
         * conversations have no file anywhere on the disk, so before the index
         * fallback existed they were searchable and could not be handed over —
         * a source that looked like it worked until the moment you used it.
         */
        let conn = crate::index_store::tests::memory();
        let conversations = parse(NEW_SHAPE).unwrap();

        for c in &conversations {
            crate::index_store::put_session(
                &conn, &c.session_id, "claude.ai", &c.title, "claude.ai", "",
                c.ended_at, c.turns.len() as u32, 0,
            )
            .unwrap();
            crate::index_store::put_messages(&conn, &c.session_id, &c.turns, "fp").unwrap();
        }

        let (hits, _) = crate::index_store::search(&conn, "tiers", 0, 10);
        assert_eq!(hits.len(), 1, "an imported conversation must be findable");
        assert_eq!(hits[0].source, "claude.ai");

        let transcript = crate::index_store::session_transcript(&conn, "abc-123")
            .expect("rebuilt from the index");
        assert!(transcript.contains("You:\nwhat should the tiers be"));
        assert!(transcript.contains("Assistant:\nThree, and name them plainly."));
    }

    #[test]
    fn re_importing_a_grown_conversation_replaces_it_rather_than_doubling_it() {
        // People export more than once. Without this, every import adds a
        // second copy of every conversation to search results.
        let conn = crate::index_store::tests::memory();
        let c = &parse(NEW_SHAPE).unwrap()[0];

        // The session row too: search joins against it, so leaving it out makes
        // the query return nothing and the test pass for the wrong reason.
        crate::index_store::put_session(
            &conn, &c.session_id, "claude.ai", &c.title, "claude.ai", "",
            c.ended_at, c.turns.len() as u32, 0,
        )
        .unwrap();

        for _ in 0..3 {
            crate::index_store::put_messages(&conn, &c.session_id, &c.turns, "fp").unwrap();
        }

        let (hits, _) = crate::index_store::search(&conn, "tiers", 0, 10);
        assert_eq!(hits.len(), 1);
    }

    #[test]
    fn refuses_a_file_that_is_not_an_export_rather_than_importing_nothing() {
        /*
         * Silently importing zero conversations from a file somebody
         * deliberately chose is the failure they will not report and will not
         * forgive: it looks exactly like the feature not working.
         */
        assert!(parse("{}").is_err());
        assert!(parse("not json").is_err());
        assert!(parse("[]").is_err());
        assert!(parse(r#"[{"title":"a ChatGPT export","mapping":{}}]"#).is_err());
    }
}
