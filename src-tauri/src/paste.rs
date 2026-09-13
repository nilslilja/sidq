/*!
 * Put text in front of an assistant the way a person would.
 *
 * ── Why this exists at all ───────────────────────────────────────────────────
 * The obvious route was to write the composer directly through accessibility.
 * `screen_reader::real_write` proved that dead: the attribute reports settable,
 * the set returns success, and the text never appears, because every one of
 * these composers is React-managed and is told nothing by an outside write.
 *
 * So this does what a person does. Text on the pasteboard, the paste shortcut,
 * and optionally return. Confirmed by hand on ChatGPT before anything was built
 * on it, which is the whole reason this file is allowed to exist.
 *
 * ── Two things this is careful about ─────────────────────────────────────────
 * The pasteboard belongs to whoever is using the machine. Borrowing it and not
 * giving it back means a handover silently eats whatever they had copied, so
 * the previous contents are restored on every path out, including a panic.
 *
 * And return is not always return. Holding command with it inserts a newline on
 * some sites and sends on others, so the two presses are separate events with
 * separate flags rather than one convenient chord.
 */

use std::time::Duration;

use std::ffi::c_void;

// CoreGraphics, through the umbrella `accessibility-sys` already links. No new
// dependency for four symbols, and the same hand-declared style the
// accessibility side of this codebase already uses.
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn CGEventSourceCreate(state: i32) -> *mut c_void;
    fn CGEventCreateKeyboardEvent(source: *mut c_void, code: u16, down: bool) -> *mut c_void;
    fn CGEventSetFlags(event: *mut c_void, flags: u64);
    fn CGEventPost(tap: u32, event: *mut c_void);
    fn CFRelease(item: *mut c_void);
}

/// Events enter where a real keyboard does, so an app that filters synthetic
/// input at a lower tap still sees them.
const HID_TAP: u32 = 0;
/// `kCGEventSourceStateHIDSystemState`: the state a physical keyboard posts in.
const HID_STATE: i32 = 1;
/// `kCGEventFlagMaskCommand`.
const COMMAND: u64 = 1 << 20;

/// What went wrong, in the words the person gets told.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// macOS refused to make the events. Always the Accessibility grant.
    NotPermitted,
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::NotPermitted => write!(
                f,
                "macOS would not let Sidq type. Turn Sidq on in System Settings, \
                 Privacy and Security, Accessibility."
            ),
        }
    }
}

/**
 * The pasteboard, borrowed and given back.
 *
 * Whatever was copied before a handover is restored when this drops, on every
 * path out including a panic, because eating someone's clipboard to save them
 * a paste is a bad trade.
 *
 * Only text is restored. A copied image or file survives as nothing, which is
 * the honest limit of one string round trip and is why the restore is narrow
 * rather than pretending to be general.
 */
struct BorrowedPasteboard {
    previous: Option<String>,
}

impl BorrowedPasteboard {
    fn take(text: &str) -> Self {
        use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};
        use objc2_foundation::NSString;

        let pb = NSPasteboard::generalPasteboard();
        // SAFETY: the general pasteboard outlives every call made on it here,
        // and both arguments are owned for the duration of the set.
        let previous = unsafe {
            let previous = pb
                .stringForType(NSPasteboardTypeString)
                .map(|s| s.to_string());
            pb.clearContents();
            pb.setString_forType(&NSString::from_str(text), NSPasteboardTypeString);
            previous
        };
        Self { previous }
    }
}

impl Drop for BorrowedPasteboard {
    fn drop(&mut self) {
        use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};
        use objc2_foundation::NSString;

        let pb = NSPasteboard::generalPasteboard();
        // SAFETY: as above. Clearing with nothing to put back is deliberate:
        // leaving the handover text behind would be worse than an empty
        // clipboard, since it is the thing that would get pasted next.
        unsafe {
            pb.clearContents();
            if let Some(previous) = &self.previous {
                pb.setString_forType(&NSString::from_str(previous), NSPasteboardTypeString);
            }
        }
    }
}

/// Post one key down and up, with the modifiers this key wants and no others.
fn post(key: Key) -> Result<(), Error> {
    // SAFETY: the source is created and released here; each event is owned
    // between its creation and its release, and CGEventPost copies what it
    // needs. A null source is valid and means the default one.
    unsafe {
        let source = CGEventSourceCreate(HID_STATE);
        let flags = if key.command { COMMAND } else { 0 };

        for down in [true, false] {
            let event = CGEventCreateKeyboardEvent(source, key.code, down);
            if event.is_null() {
                if !source.is_null() {
                    CFRelease(source);
                }
                return Err(Error::NotPermitted);
            }
            CGEventSetFlags(event, flags);
            CGEventPost(HID_TAP, event);
            CFRelease(event);
        }

        if !source.is_null() {
            CFRelease(source);
        }
    }
    Ok(())
}

/**
 * Put `text` into whatever is focused, and send it if asked.
 *
 * Aimed at nothing in particular on purpose: the caller decides what is in
 * front, exactly as it decides where a person's own paste would go. Getting
 * that wrong types into the wrong window, so callers check first.
 */
pub fn into_focused(text: &str, send: bool) -> Result<(), Error> {
    let _borrowed = BorrowedPasteboard::take(text);

    for key in keys_for(send) {
        post(key)?;
        // The presses are read in order by the receiving app, and a send
        // arriving before the paste has been applied sends an empty box.
        std::thread::sleep(Duration::from_millis(120));
    }

    std::thread::sleep(SETTLE);
    Ok(())
}

/// A key press, as the thing that decides whether it sends or writes a newline.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Key {
    pub code: u16,
    pub command: bool,
}

/// Virtual key codes. Positional, and these two sit in the same place on every
/// layout Apple ships, which is why they can be constants rather than a lookup.
pub const V: u16 = 9;
pub const RETURN: u16 = 36;

/// How long the pasteboard has to stay ours for the paste to read it.
///
/// Restoring it immediately is a race the paste loses: the shortcut is
/// delivered asynchronously and the receiving app reads the pasteboard when it
/// gets there, not when the key was posted.
pub const SETTLE: Duration = Duration::from_millis(400);

/**
 * The presses that put `text` into a composer, and send it if asked.
 *
 * Separate events on purpose. Command is held for the paste and released for
 * the return, because command-return is a newline on some assistants and a send
 * on others, and a handover that quietly turns into a second line of a draft is
 * worse than one that does nothing.
 */
pub fn keys_for(send: bool) -> Vec<Key> {
    let mut keys = vec![Key {
        code: V,
        command: true,
    }];
    if send {
        keys.push(Key {
            code: RETURN,
            command: false,
        });
    }
    keys
}

/// Press return into whatever is focused, sending nothing of its own.
///
/// Separate from `into_focused` so a caller can put text in front of somebody,
/// let them read it, and only then send it. Announce and undo needs that gap.
pub fn send_focused() -> Result<(), Error> {
    post(Key {
        code: RETURN,
        command: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pasting_without_sending_presses_one_key() {
        assert_eq!(
            keys_for(false),
            vec![Key {
                code: V,
                command: true
            }]
        );
    }

    #[test]
    fn the_paste_comes_before_the_send() {
        let keys = keys_for(true);
        assert_eq!(keys.len(), 2);
        assert_eq!(keys[0].code, V);
        assert_eq!(keys[1].code, RETURN);
    }

    /// Command-return writes a newline on some of these sites and sends on
    /// others. Held across both presses, a handover becomes the second line of
    /// a draft nobody sends.
    #[test]
    fn command_is_released_before_return() {
        let keys = keys_for(true);
        assert!(keys[0].command);
        assert!(!keys[1].command);
    }

    #[test]
    fn the_pasteboard_is_held_long_enough_to_be_read() {
        // Under about a tenth of a second the paste reads the restored value
        // instead of ours, which looks like the feature doing nothing.
        assert!(SETTLE >= Duration::from_millis(250));
    }

    /**
     * Borrowing the pasteboard gives it back.
     *
     * Ignored because it takes the real pasteboard for a moment, and a test
     * that clobbers the machine's clipboard on every run is a bad neighbour
     * even when it puts it back. Run it with the rest of the paste spike:
     *   cargo test --lib real_ -- --ignored --nocapture
     */
    #[test]
    #[ignore]
    fn real_pasteboard_is_given_back() {
        use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};
        use objc2_foundation::NSString;

        let pb = NSPasteboard::generalPasteboard();
        let read = || unsafe {
            pb.stringForType(NSPasteboardTypeString)
                .map(|s| s.to_string())
        };
        let theirs = read();

        unsafe {
            pb.clearContents();
            pb.setString_forType(&NSString::from_str("what they had copied"), NSPasteboardTypeString);
        }

        {
            let _borrowed = BorrowedPasteboard::take("the handover");
            assert_eq!(read().as_deref(), Some("the handover"));
        }
        assert_eq!(read().as_deref(), Some("what they had copied"));

        // And leave the machine as it was found.
        unsafe {
            pb.clearContents();
            if let Some(theirs) = &theirs {
                pb.setString_forType(&NSString::from_str(theirs), NSPasteboardTypeString);
            }
        }
        println!("\n  the pasteboard was borrowed and given back.\n");
    }
}
