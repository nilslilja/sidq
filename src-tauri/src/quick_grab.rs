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

}

/**
 * Put the markdown file on the clipboard, the way Finder does.
 *
 * ── Only the file ─────────────────────────────────────────────────────────
 *
 * This wrote the file URL and the text together, on the theory that the
 * destination could pick whichever it understood. It cannot, or rather it
 * picks wrong: an application offered `public.utf8-plain-text` alongside a
 * file treats the paste as text and never looks at the file, so attaching in
 * ChatGPT quietly pasted fifty thousand words into the message box instead.
 *
 * One flavour, and it is the file. That is also the thing worth having — it
 * goes to an assistant's retrieval rather than into the context window of
 * every following turn, and it survives the window closing.
 *
 * Written as an NSURL object rather than by setting the `public.file-url`
 * string on a generic item. NSURL conforms to NSPasteboardWriting and produces
 * the whole family of flavours an application looks for when deciding whether
 * something is a file. The bare string is the same thing on paper and is not
 * what Finder puts there.
 */
pub fn put_on_clipboard(file: &std::path::Path) -> bool {
    use objc2::runtime::ProtocolObject;
    use objc2_app_kit::NSPasteboard;
    use objc2_foundation::{NSArray, NSString, NSURL};

    let url = NSURL::fileURLWithPath(&NSString::from_str(&file.to_string_lossy()));
    let writable = ProtocolObject::from_retained(url);

    // The general pasteboard is a process-wide singleton; clearing before
    // writing is required rather than tidy, or the previous flavours survive.
    let pb = NSPasteboard::generalPasteboard();
    pb.clearContents();
    pb.writeObjects(&NSArray::from_retained_slice(&[writable]))
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
    everything().into_iter().next()
}

/**
 * One named conversation, out of the same list.
 *
 * For the gesture made while the picker is open: the row under the pointer is
 * the one somebody means, and taking the newest instead would hand them a
 * different conversation from the one they are looking at. Reads the same
 * sources as `most_recent` so a row that can be listed can always be grabbed.
 */
pub fn by_id(session_id: &str) -> Option<work_history::WorkSession> {
    everything().into_iter().find(|s| s.session_id == session_id)
}

/// Every conversation the picker would list, newest first.
fn everything() -> Vec<work_history::WorkSession> {
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
    all
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
