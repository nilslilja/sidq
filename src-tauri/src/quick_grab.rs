/*!
Grab a conversation without opening anything.

── The friction this removes ─────────────────────────────────────────────────

Handing a conversation over took five deliberate acts: summon the pill, find the
conversation, press Enter, go to Downloads, then attach or drag the file. Every
one of them is a place to give up, and four of them are administration rather
than the thing you wanted.

A founder put it plainly: the manual work between "I want this conversation
over there" and it being over there is the product's real cost. So there is one
key for it. Press it and the conversation you were just in is on your clipboard,
whole, compiled, with the framing that tells the next assistant to carry on. A
notification says so. Paste it wherever you were going.

── Why it is not automatic ───────────────────────────────────────────────────

Nothing here runs on its own. Sidq already reads and indexes in the background,
and it would be technically easy to keep the newest conversation permanently on
the clipboard. That would be wrong: a clipboard is the one place on a Mac where
somebody is already holding something they care about, and silently replacing it
with a fifty thousand word transcript is a way to lose somebody's work. It
happens when the key is pressed, and only then.

The file is still written. Pasting is right for a chat box; attaching is right
for anything with retrieval, and a path can be attached while a clipboard
cannot.
*/

use crate::{index_store, screen_reader, work_history};

/// What a grab produced, for the notification and the drop that may follow.
#[derive(Debug, Clone)]
pub struct Grabbed {
    /// What the conversation is called.
    pub title: String,
    /// Which assistant it came from.
    pub source: String,
    /// Whether the markdown file is on the clipboard too, ready to attach.
    pub as_file: bool,
}

/**
 * Put the handover on the clipboard, as a file and as text at the same time.
 *
 * ── Why both, and why the file first ──────────────────────────────────────
 *
 * The markdown file is the artifact. It has been since the beginning: it is
 * what gets attached, what survives being closed, and what goes to an
 * assistant's retrieval instead of into the context window of every following
 * turn. An earlier pass at this put only the text on the clipboard, which
 * quietly turned a file into a paste and lost all of that.
 *
 * A pasteboard can hold one thing in several representations at once, and the
 * receiving application picks the one it understands. So this writes the file
 * URL and the text together:
 *
 *   ChatGPT, Claude, Slack, Mail   take the file — ⌘V attaches sidq.md
 *   a plain text box, an editor    takes the text
 *
 * One gesture, and the destination decides. Nothing to choose in advance and
 * nothing to go to Downloads for.
 *
 * `clearContents` first is required rather than tidy: a pasteboard keeps
 * whatever types were written last, so a string written over an image leaves
 * the image for anything that prefers it.
 */
pub fn put_on_clipboard(text: &str, file: Option<&std::path::Path>) -> bool {
    use objc2_app_kit::{
        NSPasteboard, NSPasteboardItem, NSPasteboardTypeFileURL, NSPasteboardTypeString,
    };
    use objc2::runtime::ProtocolObject;
    use objc2_foundation::{NSArray, NSString, NSURL};

    // Safety: the general pasteboard is a process-wide singleton, and an item
    // is an ordinary object we own until it is written.
    unsafe {
        let item = NSPasteboardItem::new();

        if !item.setString_forType(&NSString::from_str(text), NSPasteboardTypeString) {
            return false;
        }

        /*
         * The file is best effort. A grab whose file could not be written is
         * still worth pasting as text, and failing the whole thing over the
         * better half of it would be the wrong trade.
         */
        if let Some(path) = file {
            let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
            if let Some(absolute) = url.absoluteString() {
                item.setString_forType(&absolute, NSPasteboardTypeFileURL);
            }
        }

        let writable = ProtocolObject::from_retained(item);
        let pb = NSPasteboard::generalPasteboard();
        pb.clearContents();
        pb.writeObjects(&NSArray::from_retained_slice(&[writable]))
    }
}

/**
 * The conversation to grab.
 *
 * Whatever was touched most recently, which is the one somebody just had in
 * front of them. Deliberately not "the frontmost window": by the time a
 * shortcut fires the frontmost window is often the thing they are pasting
 * *into*, and reading that would grab the wrong side of the exchange.
 *
 * A browser conversation may be newer than the last sweep, so the caller sweeps
 * first and this reads the result.
 */
pub fn most_recent() -> Option<work_history::WorkSession> {
    let mut all = work_history::recent_sessions(12);
    all.extend(crate::cursor_history::recent_sessions(12));

    all.extend(index_store::open().into_iter().flat_map(|conn| {
        index_store::recent_screen_sessions(&conn, 12).into_iter().map(
            |(session_id, title, source, ended_at, turns)| work_history::WorkSession {
                session_id,
                title,
                source: screen_reader::source_for(&source).unwrap_or("chatgpt"),
                ended_at,
                turns,
                ..Default::default()
            },
        )
    }));

    all.sort_by_key(|s| std::cmp::Reverse(s.ended_at));
    all.into_iter().next()
}

/// How the notification and the window refer to a conversation with no title.
pub const UNTITLED: &str = "your last conversation";

/// A conversation's title, or something readable when it has none.
pub fn name_of(session: &work_history::WorkSession) -> String {
    let title = session.title.trim();
    if !title.is_empty() {
        return title.to_string();
    }
    let prompt = session.last_prompt.trim();
    if prompt.is_empty() {
        return UNTITLED.to_string();
    }
    // Char boundaries, not bytes: a title cut mid-emoji is a broken glyph in a
    // notification.
    let cut = prompt.char_indices().nth(48).map(|(i, _)| i);
    match cut {
        Some(i) => format!("{}…", &prompt[..i]),
        None => prompt.to_string(),
    }
}
