//! Everything you have ever said to an assistant that runs in a browser.
//!
//! Some assistants write transcripts to this disk and Sidq reads them without
//! being asked: Claude Code, Cowork, Cursor, Windsurf, VS Code. The ones that
//! run in a tab write nothing readable here. Checked rather than assumed for
//! claude.ai — the desktop app's IndexedDB is 2.2MB, 31% printable, and the
//! only readable string in the entire store is its own name. ChatGPT's desktop
//! app is encrypted. Gemini keeps nothing locally at all.
//!
//! So a browser assistant reaches Sidq two ways. The extension reads the
//! conversation from the page as it happens, which covers what you are doing
//! now. This covers everything before that: the export each of them gives you,
//! which is your entire history with that assistant including all of it from
//! before Sidq existed.
//!
//! ── One parser, three formats, detected by shape ─────────────────────────────
//! Claude, ChatGPT and Google each publish a different structure, and people
//! rename downloads, so the file is identified by what is inside it rather than
//! what it is called. Each reduces to the same thing: a conversation with an
//! id, a title, a time and a list of turns.
//!
//! ── Why this goes in the index and not in a list somewhere ───────────────────
//! An earlier importer read these files in the browser and kept titles and
//! timestamps, capped at thirty days. That made a list you could look at and
//! nothing else: no search, no profile, and no handover, because there was no
//! text behind any row. Parsing here puts a browser assistant on exactly the
//! same footing as one that writes to disk — searchable, quotable in the memory
//! profile, and handoverable.

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
    /// Which assistant it came from, for the picker and the compiler.
    pub source: &'static str,
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
fn parse_claude(raw: &str) -> Result<Vec<Imported>, String> {
    let conversations: Vec<ExportedConversation> = serde_json::from_str(raw)
        .map_err(|_| "not a Claude export".to_string())?;

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
                source: "claude.ai",
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
        return Err("that Claude export has no conversations with messages in it".into());
    }
    Ok(out)
}

/* ── ChatGPT ──────────────────────────────────────────────────────────────── */

#[derive(Debug, Deserialize)]
struct GptConversation {
    #[serde(default)]
    title: String,
    #[serde(default)]
    create_time: Option<f64>,
    #[serde(default)]
    update_time: Option<f64>,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    conversation_id: Option<String>,
    #[serde(default)]
    mapping: std::collections::HashMap<String, GptNode>,
}

#[derive(Debug, Deserialize)]
struct GptNode {
    #[serde(default)]
    message: Option<GptMessage>,
}

#[derive(Debug, Deserialize)]
struct GptMessage {
    #[serde(default)]
    author: GptAuthor,
    #[serde(default)]
    content: GptContent,
    #[serde(default)]
    create_time: Option<f64>,
}

#[derive(Debug, Default, Deserialize)]
struct GptAuthor {
    #[serde(default)]
    role: String,
}

#[derive(Debug, Default, Deserialize)]
struct GptContent {
    /// Text lives in `parts`. Non-text parts arrive as objects, so this is
    /// deliberately `Value` — typing it as String drops the whole conversation
    /// the first time somebody pasted an image into it.
    #[serde(default)]
    parts: Vec<serde_json::Value>,
}

impl GptContent {
    fn text(&self) -> String {
        self.parts
            .iter()
            .filter_map(|p| p.as_str())
            .collect::<Vec<_>>()
            .join("\n")
    }
}

/**
 * ChatGPT's conversations.json.
 *
 * The turns are a tree, not a list: `mapping` is a graph of nodes because a
 * conversation can be branched by editing an earlier message. Sidq flattens it
 * by message time, which reads any branch you left visible in the right order
 * and does not try to reconstruct the ones you abandoned.
 */
fn parse_chatgpt(raw: &str) -> Result<Vec<Imported>, String> {
    let conversations: Vec<GptConversation> =
        serde_json::from_str(raw).map_err(|_| "not a ChatGPT export".to_string())?;

    let out: Vec<Imported> = conversations
        .into_iter()
        .filter_map(|c| {
            let mut messages: Vec<(f64, String, String)> = c
                .mapping
                .values()
                .filter_map(|n| n.message.as_ref())
                .filter_map(|m| {
                    let body = m.content.text();
                    if body.trim().is_empty() {
                        return None;
                    }
                    // System turns are instructions to the model, not part of
                    // the conversation anybody had.
                    let role = match m.author.role.as_str() {
                        "user" => "You",
                        "assistant" => "Assistant",
                        _ => return None,
                    };
                    Some((m.create_time.unwrap_or(0.0), role.to_string(), body))
                })
                .collect();

            messages.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
            if messages.is_empty() {
                return None;
            }

            // Seconds, with a fractional part. Treating them as milliseconds
            // puts every conversation in 1970 where the recency filters drop it.
            let ended = messages
                .last()
                .map(|m| m.0)
                .filter(|&t| t > 0.0)
                .or(c.update_time)
                .or(c.create_time)
                .unwrap_or(0.0);

            let title = if c.title.trim().is_empty() {
                messages[0].2.chars().take(80).collect()
            } else {
                c.title
            };

            Some(Imported {
                source: "chatgpt",
                session_id: c.id.or(c.conversation_id).unwrap_or_else(|| title.clone()),
                title,
                ended_at: (ended * 1000.0) as i64,
                turns: messages.into_iter().map(|(_, r, b)| (r, b)).collect(),
            })
        })
        .collect();

    if out.is_empty() {
        return Err("that ChatGPT export has no conversations with messages in it".into());
    }
    Ok(out)
}

/* ── Gemini, through Google Takeout ───────────────────────────────────────── */

#[derive(Debug, Deserialize)]
struct ActivityRow {
    #[serde(default)]
    header: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    time: String,
}

/**
 * Google Takeout's My Activity export.
 *
 * The weakest of the three, and it is worth being plain about why: Takeout
 * records what you asked and not what Gemini answered. So an imported Gemini
 * conversation is one turn — yours — which still makes it searchable and still
 * feeds the memory profile, and is honestly labelled rather than padded out
 * with a reply that does not exist.
 *
 * Every title arrives as "Prompted <what you asked>", and the prefix is noise
 * in every single row.
 */
fn parse_takeout(raw: &str) -> Result<Vec<Imported>, String> {
    let rows: Vec<ActivityRow> =
        serde_json::from_str(raw).map_err(|_| "not a Google Takeout export".to_string())?;

    let out: Vec<Imported> = rows
        .into_iter()
        .filter(|r| r.header.contains("Gemini") || r.header.contains("Bard"))
        .filter_map(|r| {
            let asked = r
                .title
                .trim_start_matches("Prompted ")
                .trim_start_matches("Asked ")
                .trim();
            if asked.is_empty() {
                return None;
            }

            let ended_at = millis_of(&r.time);
            Some(Imported {
                source: "gemini",
                // Takeout carries no conversation id, so one is made from the
                // time and the question. Stable across re-imports of the same
                // file, which is what stops a second import doubling everything.
                session_id: format!("gemini-{ended_at}-{}", asked.len()),
                title: asked.chars().take(80).collect(),
                ended_at,
                turns: vec![("You".to_string(), asked.to_string())],
            })
        })
        .collect();

    if out.is_empty() {
        return Err("that Takeout export has no Gemini activity in it".into());
    }
    Ok(out)
}

/**
 * Read an export from any of them.
 *
 * Tried in turn rather than sniffed from the filename, because people rename
 * downloads and `conversations (3).json` has to work. When none of them fit,
 * the error names all three rather than guessing which one was meant — the
 * person knows where their file came from and we do not.
 */
pub fn parse(raw: &str) -> Result<Vec<Imported>, String> {
    parse_claude(raw)
        .or_else(|_| parse_chatgpt(raw))
        .or_else(|_| parse_takeout(raw))
        .map_err(|_| {
            "That does not look like a conversation export. Sidq reads the \
conversations.json from Claude or ChatGPT, and the My Activity file from Google \
Takeout."
                .to_string()
        })
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
                &conn, &c.session_id, c.source, &c.title, c.source, "",
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
            &conn, &c.session_id, c.source, &c.title, c.source, "",
            c.ended_at, c.turns.len() as u32, 0,
        )
        .unwrap();

        for _ in 0..3 {
            crate::index_store::put_messages(&conn, &c.session_id, &c.turns, "fp").unwrap();
        }

        let (hits, _) = crate::index_store::search(&conn, "tiers", 0, 10);
        assert_eq!(hits.len(), 1);
    }

    const GPT_EXPORT: &str = r#"[{
        "title": "Refund wording",
        "id": "gpt-9",
        "create_time": 1755163200.0,
        "update_time": 1755166800.0,
        "mapping": {
            "n2": { "message": { "author": { "role": "assistant" },
                    "content": { "parts": ["Say it in one sentence."] }, "create_time": 1755163320.5 } },
            "n1": { "message": { "author": { "role": "user" },
                    "content": { "parts": ["how should the refund policy read"] }, "create_time": 1755163260.0 } },
            "n0": { "message": { "author": { "role": "system" },
                    "content": { "parts": ["You are ChatGPT."] }, "create_time": 1755163200.0 } }
        }
    }]"#;

    #[test]
    fn reads_a_chatgpt_export() {
        let out = parse(GPT_EXPORT).unwrap();

        assert_eq!(out.len(), 1);
        assert_eq!(out[0].source, "chatgpt");
        assert_eq!(out[0].title, "Refund wording");
        assert_eq!(out[0].turns.len(), 2, "the system turn is not conversation");
    }

    #[test]
    fn puts_chatgpt_turns_back_in_order() {
        /*
         * `mapping` is a graph, not a list — a conversation can be branched by
         * editing an earlier message — and a HashMap has no order at all. Read
         * as-is, the answer comes before the question about half the time.
         */
        let out = parse(GPT_EXPORT).unwrap();

        assert_eq!(out[0].turns[0].0, "You");
        assert!(out[0].turns[0].1.contains("refund policy"));
        assert_eq!(out[0].turns[1].0, "Assistant");
    }

    #[test]
    fn reads_chatgpt_times_as_seconds_not_milliseconds() {
        // Treating them as milliseconds puts every conversation in 1970, where
        // every recency filter silently drops it.
        let out = parse(GPT_EXPORT).unwrap();
        assert_eq!(out[0].ended_at, 1_755_163_320_500);
    }

    #[test]
    fn survives_a_chatgpt_conversation_containing_an_image() {
        /*
         * Non-text parts arrive as objects rather than strings. Typing `parts`
         * as Vec<String> makes serde reject the whole file, so one pasted image
         * anywhere in the history loses every conversation in it.
         */
        let with_image = r#"[{ "title": "Look at this", "id": "g1",
            "mapping": { "a": { "message": { "author": { "role": "user" },
              "content": { "parts": [{"content_type":"image_asset_pointer"}, "what is this"] },
              "create_time": 1755163260.0 } } } }]"#;

        let out = parse(with_image).unwrap();
        assert_eq!(out[0].turns[0].1, "what is this");
    }

    #[test]
    fn reads_a_google_takeout_export_for_gemini() {
        let takeout = r#"[
          { "header": "Gemini Apps", "title": "Prompted how do I price a seat",
            "time": "2025-08-14T09:21:33.123Z" },
          { "header": "YouTube", "title": "Watched something", "time": "2025-08-14T09:00:00Z" }
        ]"#;

        let out = parse(takeout).unwrap();
        assert_eq!(out.len(), 1, "only the Gemini rows");
        assert_eq!(out[0].source, "gemini");
        // "Prompted " is noise in every single row.
        assert_eq!(out[0].title, "how do I price a seat");
        assert_eq!(out[0].turns.len(), 1, "Takeout records the question, not the answer");
    }

    #[test]
    fn a_takeout_row_gets_the_same_id_every_time_it_is_imported() {
        // There is no conversation id in Takeout, so one is derived. If it were
        // not stable, a second import would double the whole history.
        let row = r#"[{ "header": "Gemini", "title": "Prompted hello there",
                        "time": "2025-08-14T09:21:33Z" }]"#;

        assert_eq!(parse(row).unwrap()[0].session_id, parse(row).unwrap()[0].session_id);
    }

    #[test]
    fn each_format_is_recognised_without_being_told_which_it_is() {
        // People rename downloads; `conversations (3).json` has to work.
        assert_eq!(parse(NEW_SHAPE).unwrap()[0].source, "claude.ai");
        assert_eq!(parse(GPT_EXPORT).unwrap()[0].source, "chatgpt");
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
        // Shaped like an export and carrying nothing.
        assert!(parse(r#"[{"title":"empty","mapping":{}}]"#).is_err());

        // And the message names all three rather than guessing which was meant.
        let message = parse("[]").unwrap_err();
        assert!(message.contains("Claude") && message.contains("ChatGPT") && message.contains("Takeout"));
    }
}
