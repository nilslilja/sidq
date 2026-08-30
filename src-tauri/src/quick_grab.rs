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
    /// Whether a file was written beside the clipboard copy.
    pub saved: bool,
}

/**
 * Put text on the clipboard.
 *
 * Straight to NSPasteboard rather than through a window. The whole point is
 * that this works with no Sidq window open and nothing focused, so there is no
 * webview to route a string through.
 *
 * `clearContents` first is required, not tidiness: a pasteboard keeps whatever
 * types were written last, and writing a string over an image leaves the image
 * for any app that prefers it.
 */
pub fn put_on_clipboard(text: &str) -> bool {
    use objc2_app_kit::NSPasteboard;
    use objc2_foundation::NSString;

    // Safety: the general pasteboard is a process-wide singleton and both calls
    // are the documented way to replace its contents from any thread.
    unsafe {
        let pb = NSPasteboard::generalPasteboard();
        pb.clearContents();
        pb.setString_forType(&NSString::from_str(text), objc2_app_kit::NSPasteboardTypeString)
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
