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

The right-hand ⌘ and ⌥, distinguished from their left twins by the device
specific bits macOS puts in `modifierFlags`. Nobody presses the right-hand ones
on their own by accident, and they are on every Mac keyboard.

Not fn, which was the first choice and is the wrong one by default: macOS binds
its own action to that key — emoji, dictation or input switching, depending on
the setting — so a double tap fires that twice as well. It is a good trigger for
somebody who has set "Press 🌐 to" to "Do Nothing", and a bad one to ship
switched on, so it is offered rather than assumed.
*/

use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::time::Duration;

/// Right ⌘. `NX_DEVICERCMDKEYMASK`.
pub const RIGHT_COMMAND: u64 = 0x0000_0010;
/// Right ⌥. `NX_DEVICERALTKEYMASK`.
pub const RIGHT_OPTION: u64 = 0x0000_0040;
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
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
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

        match resolve(previous, flags, &watched, LAST_MASK.load(Ordering::Relaxed), since) {
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
        assert_eq!(resolve(0, 0x0000_0002, &WATCHED, RIGHT_COMMAND, None), Tap::Cancel);
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
        assert_eq!(resolve(RIGHT_COMMAND, 0, &WATCHED, RIGHT_COMMAND, None), Tap::None);
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
