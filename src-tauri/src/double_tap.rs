#![cfg(target_os = "macos")]
//!
//! ── Why this module does not exist off macOS ─────────────────────────────────
//!
//! Double-tapping a modifier is not a shortcut any OS offers as a concept. It
//! works here because NSEvent will report a modifier press on its own, with no
//! key attached, which Windows and Linux do not do without a low-level keyboard
//! hook — and a background process installing one of those is indistinguishable
//! from a keylogger to every security product on the machine.
//!
//! So the gesture is macOS-only and the other platforms get an ordinary global
//! shortcut through Tauri's plugin, which is a worse gesture and an honest one.
//! The module is absent rather than stubbed so that a caller has to decide what
//! to do instead, rather than calling something that silently never fires.

/*!
Two taps on a modifier, and nothing else.

── Why not a chord ───────────────────────────────────────────────────────────

Every reasonable ⌘⇧-something is taken by something. A global shortcut wins
against every application at once, so picking one means quietly breaking that
combination in the person's editor, their browser and their terminal, for a
feature they use a few times a day. The keyboard is crowded and Sidq is not
entitled to a corner of it.

Tapping a modifier twice collides with nothing, because on its own a modifier
does nothing. It is what Spotlight did with ⌘, what dictation did with fn, and
what several editors do with shift.

── Which modifier ────────────────────────────────────────────────────────────

Right ⌘ to grab, left ⌃ to drop. They are told apart from their twins on the
other side by the device specific bits macOS puts in `modifierFlags`, and
neither is pressed on its own by accident — control is almost always chorded,
and chords are excluded below.

Three candidates were ruled out, and not one of them by reasoning about it:

  fn        Wispr Flow holds it for push to talk, and macOS binds its own
            action to it besides — emoji, dictation or input switching. Fine for
            somebody who has set "Press 🌐 to" to "Do Nothing" and does not
            dictate; wrong to ship switched on.

  right ⌥   Claude for Desktop opens its overlay on a double tap of option.
            Shipped, then moved: there is nowhere to read that binding from, so
            it turned up the first time somebody pressed it.

  right ⌃   Does not exist. Apple keyboards have control on the left only —
            laptop and Magic Keyboard, every layout. Shipped as the default for
            exactly one release, to somebody on a Swedish MacBook who pointed
            out they had no such key.

Which is the argument for the whole thing being a setting rather than a
constant. The keyboard is crowded and what is free depends on what somebody has
installed, so `chosen` reads the pair from the index and falls back to the
defaults. Changing them is a settings write, not a release.
*/

use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::time::Duration;

/// Right ⌘. `NX_DEVICERCMDKEYMASK`.
pub const RIGHT_COMMAND: u64 = 0x0000_0010;
/// Right ⌥. `NX_DEVICERALTKEYMASK`.
///
/// Not used by default: Claude for Desktop opens its overlay on a double tap of
/// option, which is not in any config file this could have been read from — it
/// turned up the first time somebody pressed it. Left here because it is the
/// right choice on a Mac without Claude installed.
pub const RIGHT_OPTION: u64 = 0x0000_0040;

/**
 * Right ⌃. `NX_DEVICERCTLKEYMASK`.
 *
 * Not a default, because on an Apple keyboard it does not exist. The bottom row
 * is fn ⌃ ⌥ ⌘ space ⌘ ⌥ and then the arrows — control is on the left only, on
 * every layout, laptop and Magic Keyboard alike. This was shipped as the
 * default for one release and the person it shipped to had no such key.
 *
 * Kept as a choice for anybody on a full-size third-party keyboard.
 */
pub const RIGHT_CONTROL: u64 = 0x0000_2000;

/// Left ⌃. `NX_DEVICELCTLKEYMASK`. On every Mac keyboard ever made.
pub const LEFT_CONTROL: u64 = 0x0000_0002;
/// fn / 🌐. `NSEventModifierFlagFunction`.
///
/// Offered rather than used: see the note at the top of this file. Anybody who
/// has set "Press 🌐 to" to "Do Nothing" can be given this instead, and
/// `resolve` already treats it like any other watched mask.
pub const FUNCTION: u64 = 1 << 23;

/**
 * How long a second tap has that still counts as part of the first.
 *
 * Long enough to be comfortable rather than a stunt, short enough that two
 * separate presses a beat apart are two separate presses. macOS uses roughly
 * this for a double click.
 */
const WINDOW: Duration = Duration::from_millis(450);

/**
 * Every modifier a person can hold down.
 *
 * A tap only counts when nothing else is held, so this is subtracted from the
 * watched mask rather than listed as exceptions — an allowlist of "other"
 * modifiers is a list somebody forgets to add to. It already went wrong once:
 * fn was missing, and this Mac runs Wispr Flow, which holds fn for push to
 * talk. Dictating and tapping right ⌘ would have grabbed a conversation.
 *
 * Caps lock is deliberately absent. It is a latched state rather than a key
 * being held, and somebody typing in capitals should still be able to grab.
 */
const ALL_HELD: u64 = 0x0000_0001 // left shift
    | 0x0000_0004 // right shift
    | 0x0000_0002 // left control
    | 0x0000_2000 // right control
    | 0x0000_0020 // left option
    | 0x0000_0040 // right option
    | 0x0000_0008 // left command
    | 0x0000_0010 // right command
    | FUNCTION;

static MONITOR: AtomicUsize = AtomicUsize::new(0);
static LAST_TAP_MS: AtomicU64 = AtomicU64::new(0);
static LAST_MASK: AtomicU64 = AtomicU64::new(0);
static HELD: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/**
 * Decide what a change in the modifier flags means.
 *
 * Split out from the monitor so the rule is testable without an event loop:
 * everything about when a tap counts lives here, and the AppKit side only
 * supplies numbers.
 *
 * Returns the mask that was double tapped, if this release completed one.
 */
pub fn resolve(
    previous: u64,
    current: u64,
    watched: &[u64],
    last_mask: u64,
    since_last: Option<Duration>,
) -> Tap {
    // A modifier that went down, on its own, with nothing else held.
    for &mask in watched {
        let went_down = previous & mask == 0 && current & mask != 0;
        // Everything except the key that just went down must be up.
        let alone = current & (ALL_HELD & !mask) == 0;
        if went_down && alone {
            let soon = since_last.is_some_and(|d| d < WINDOW);
            if soon && last_mask == mask {
                return Tap::Double(mask);
            }
            return Tap::First(mask);
        }
    }

    /*
     * Anything else clears the count.
     *
     * Holding the modifier and pressing a letter is a chord, and a chord in the
     * middle of two taps means the person changed their mind about what they
     * were doing. Continuing to count would fire the shortcut on the next
     * unrelated tap.
     */
    if current & ALL_HELD != 0 {
        return Tap::Cancel;
    }

    Tap::None
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tap {
    /// Nothing to do.
    None,
    /// A first tap, which may become a double.
    First(u64),
    /// Two taps inside the window. Fire.
    Double(u64),
    /// Something happened that means the count should start over.
    Cancel,
}

/**
 * Watch the modifiers and call back on a double tap.
 *
 * `on_tap` receives the mask that fired, so one monitor serves every shortcut.
 * Registering twice is a no-op: AppKit would happily install two monitors and
 * deliver every event to both, which turns one grab into two.
 */
pub fn watch(watched: Vec<u64>, on_tap: impl Fn(u64) + Send + Sync + 'static) {
    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2_app_kit::{NSEvent, NSEventMask};

    if MONITOR.load(Ordering::Relaxed) != 0 {
        return;
    }

    let handler = RcBlock::new(move |event: core::ptr::NonNull<NSEvent>| {
        // SAFETY: AppKit hands us a live event for the duration of this block.
        let flags = unsafe { event.as_ref().modifierFlags().bits() as u64 };

        let previous = HELD.swap(flags, Ordering::Relaxed);
        let last = LAST_TAP_MS.load(Ordering::Relaxed);
        let since = (last > 0).then(|| Duration::from_millis(now_ms().saturating_sub(last)));

        match resolve(
            previous,
            flags,
            &watched,
            LAST_MASK.load(Ordering::Relaxed),
            since,
        ) {
            Tap::First(mask) => {
                LAST_TAP_MS.store(now_ms(), Ordering::Relaxed);
                LAST_MASK.store(mask, Ordering::Relaxed);
            }
            Tap::Double(mask) => {
                // Cleared before firing, so a third tap starts a new pair
                // rather than firing again immediately.
                LAST_TAP_MS.store(0, Ordering::Relaxed);
                LAST_MASK.store(0, Ordering::Relaxed);
                on_tap(mask);
            }
            Tap::Cancel => {
                LAST_TAP_MS.store(0, Ordering::Relaxed);
                LAST_MASK.store(0, Ordering::Relaxed);
            }
            Tap::None => {}
        }
    });

    // AppKit retains the block for as long as the monitor is registered, and
    // this monitor is never removed.
    let token =
        NSEvent::addGlobalMonitorForEventsMatchingMask_handler(NSEventMask::FlagsChanged, &handler);

    if let Some(token) = token {
        MONITOR.store(Retained::into_raw(token) as usize, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WATCHED: [u64; 2] = [RIGHT_COMMAND, RIGHT_OPTION];

    #[test]
    fn one_tap_is_not_a_shortcut() {
        assert_eq!(
            resolve(0, RIGHT_COMMAND, &WATCHED, 0, None),
            Tap::First(RIGHT_COMMAND)
        );
    }

    #[test]
    fn two_inside_the_window_fire() {
        let soon = Some(Duration::from_millis(200));
        assert_eq!(
            resolve(0, RIGHT_COMMAND, &WATCHED, RIGHT_COMMAND, soon),
            Tap::Double(RIGHT_COMMAND)
        );
    }

    #[test]
    fn two_a_beat_apart_are_two_separate_taps() {
        let late = Some(Duration::from_millis(900));
        assert_eq!(
            resolve(0, RIGHT_COMMAND, &WATCHED, RIGHT_COMMAND, late),
            Tap::First(RIGHT_COMMAND)
        );
    }

    /*
     * The one that would make this unusable: ⌘⇧K ends with command going down
     * while shift is held. Counting that as a tap means every chord somebody
     * types edges Sidq towards firing.
     */
    #[test]
    fn a_modifier_pressed_as_part_of_a_chord_clears_rather_than_counts() {
        // ⌘⇧K ends with command going down while shift is held. Counting that
        // as a tap would mean every chord somebody types edges Sidq towards
        // firing — and merely ignoring it is not enough either, because the
        // half-finished count would still be waiting.
        let shift = 0x0000_0001;
        assert_eq!(
            resolve(shift, shift | RIGHT_COMMAND, &WATCHED, 0, None),
            Tap::Cancel
        );
    }

    #[test]
    fn a_chord_in_the_middle_clears_the_count() {
        assert_eq!(
            resolve(0, 0x0000_0002, &WATCHED, RIGHT_COMMAND, None),
            Tap::Cancel
        );
    }

    #[test]
    fn tapping_a_different_modifier_does_not_complete_the_pair() {
        let soon = Some(Duration::from_millis(150));
        assert_eq!(
            resolve(0, RIGHT_OPTION, &WATCHED, RIGHT_COMMAND, soon),
            Tap::First(RIGHT_OPTION)
        );
    }

    /*
     * Left and right ⌘ are different keys here. Distinguishing them is the
     * whole reason this watches device specific bits rather than the tidy
     * `NSEventModifierFlagCommand`, which is set for both.
     */
    #[test]
    fn the_left_hand_twin_is_a_different_key() {
        let left_command = 0x0000_0008;
        assert_eq!(resolve(0, left_command, &WATCHED, 0, None), Tap::Cancel);
    }

    /*
     * Concretely relevant: this Mac runs Wispr Flow, which holds fn for push to
     * talk. Reaching for right ⌘ mid-sentence must not grab a conversation.
     */
    #[test]
    fn a_tap_while_fn_is_held_is_not_a_tap() {
        assert_eq!(
            resolve(FUNCTION, FUNCTION | RIGHT_COMMAND, &WATCHED, 0, None),
            Tap::Cancel
        );
    }

    #[test]
    fn releasing_a_modifier_is_not_a_press() {
        assert_eq!(
            resolve(RIGHT_COMMAND, 0, &WATCHED, RIGHT_COMMAND, None),
            Tap::None
        );
    }

    /*
     * Both actions on one key makes the second unreachable, and settings are a
     * file a person can edit.
     */
    /*
     * The bottom row of an Apple keyboard is fn ⌃ ⌥ ⌘ space ⌘ ⌥ and the arrows.
     * A default has to be a key the person owns.
     */
    #[test]
    fn neither_default_is_a_key_apple_keyboards_lack() {
        let conn = crate::index_store::tests::memory();
        let (grab, drop) = chosen(&conn);
        assert_ne!(grab, RIGHT_CONTROL);
        assert_ne!(drop, RIGHT_CONTROL);
    }

    #[test]
    fn the_two_keys_can_never_be_the_same_one() {
        let conn = crate::index_store::tests::memory();
        crate::index_store::put_setting(&conn, GRAB_KEY, "right-command");
        crate::index_store::put_setting(&conn, DROP_KEY, "right-command");

        let (grab, drop) = chosen(&conn);
        assert_eq!(grab, RIGHT_COMMAND);
        assert_ne!(drop, grab);
    }

    #[test]
    fn the_defaults_avoid_what_other_apps_already_own() {
        let conn = crate::index_store::tests::memory();
        // fn is Wispr Flow's push to talk, right ⌥ opens Claude's overlay, and
        // right ⌃ is not a key Apple has ever shipped.
        let (grab, drop) = chosen(&conn);
        assert_eq!((grab, drop), (RIGHT_COMMAND, LEFT_CONTROL));
    }

    #[test]
    fn a_stored_choice_wins_over_the_default() {
        let conn = crate::index_store::tests::memory();
        crate::index_store::put_setting(&conn, DROP_KEY, "right-option");

        assert_eq!(chosen(&conn).1, RIGHT_OPTION);
    }

    #[test]
    fn every_choice_round_trips_through_its_name() {
        for (name, mask) in CHOICES {
            assert_eq!(mask_for(name), Some(mask));
            assert_ne!(label_for(mask), "a modifier");
        }
    }

    #[test]
    fn an_unknown_name_is_not_a_modifier() {
        assert_eq!(mask_for("right-meta"), None);
    }

    #[test]
    fn fn_can_be_watched_for_anybody_who_wants_it() {
        let soon = Some(Duration::from_millis(120));
        assert_eq!(
            resolve(0, FUNCTION, &[FUNCTION], FUNCTION, soon),
            Tap::Double(FUNCTION)
        );
    }
}

/* ── Which modifier does what, as a setting ──────────────────────────────── */

/// Setting keys. Values are the names below.
pub const GRAB_KEY: &str = "tap.grab";
pub const DROP_KEY: &str = "tap.drop";

/// Every modifier that can be tapped, by the name a setting stores.
pub const CHOICES: [(&str, u64); 5] = [
    ("right-command", RIGHT_COMMAND),
    ("left-control", LEFT_CONTROL),
    ("right-control", RIGHT_CONTROL),
    ("right-option", RIGHT_OPTION),
    ("fn", FUNCTION),
];

/// The mask a stored name refers to, if it is one this knows.
pub fn mask_for(name: &str) -> Option<u64> {
    CHOICES.iter().find(|(n, _)| *n == name).map(|(_, m)| *m)
}

/// How a mask reads in a menu.
pub fn label_for(mask: u64) -> &'static str {
    match mask {
        RIGHT_COMMAND => "right ⌘",
        LEFT_CONTROL => "left ⌃",
        RIGHT_CONTROL => "right ⌃",
        RIGHT_OPTION => "right ⌥",
        FUNCTION => "fn",
        _ => "a modifier",
    }
}

/**
 * The pair in force: what is stored, or the defaults.
 *
 * The second key has moved twice: right ⌥ opens Claude for Desktop's overlay,
 * and right ⌃ is not a key that exists on an Apple keyboard. Left ⌃ is, on every
 * one of them, and is almost always chorded rather than tapped. A stored value
 * always wins, including one that picks ⌥ back up on a Mac without Claude.
 */
pub fn chosen(conn: &rusqlite::Connection) -> (u64, u64) {
    let read = |key: &str, fallback: u64| {
        crate::index_store::setting(conn, key)
            .and_then(|name| mask_for(&name))
            .unwrap_or(fallback)
    };

    let grab = read(GRAB_KEY, RIGHT_COMMAND);
    let drop = read(DROP_KEY, LEFT_CONTROL);

    // Both on one key would make the second unreachable, and a person editing
    // settings by hand can do that. The stored grab wins; drop goes back home.
    if grab == drop {
        return (
            grab,
            if grab == LEFT_CONTROL {
                RIGHT_COMMAND
            } else {
                LEFT_CONTROL
            },
        );
    }
    (grab, drop)
}
