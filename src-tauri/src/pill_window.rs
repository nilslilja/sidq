//! The pill: one window that lives in two sizes.
//!
//! Collapsed it is a small bar near the bottom of the screen that is always
//! there. Expanded it is the picker. It is the same window either way, resized
//! and repositioned, because two windows pretending to be one thing is how you
//! end up with both of them on screen at once.
//!
//! ── Why it never goes away ───────────────────────────────────────────────────
//! It used to be summoned by ⌘⇧K and hidden again the moment it had finished.
//! That is correct for a shortcut and wrong for everything else: a tool you
//! cannot see is a tool you forget you installed, and the only way back to it
//! was a keystroke you had to remember from setup a week earlier. Now the bar
//! sits there, and quitting is the only thing that removes it.
//!
//! ── Why it does not steal focus ──────────────────────────────────────────────
//! A window that is permanently on screen and can take keyboard focus is a
//! window that eats a keystroke meant for your editor. Collapsed, the window is
//! marked non-focusable, so clicks still reach it but the caret stays where it
//! was. Expanding makes it focusable again, because then it is a text field.
//!
//! ── The cost of that, measured ───────────────────────────────────────────────
//! A non-focusable window drops out of the macOS accessibility tree: querying
//! the process through System Events reports zero windows while the bar is
//! plainly on screen, which is how this was found. So assistive technology
//! cannot reach the collapsed bar by pointing at it.
//!
//! That is acceptable only because the bar is not the sole way in. ⌘⇧K reaches
//! the picker from anywhere, and so does "Pick up a conversation" in the menu
//! bar; both are keyboard-reachable and both land on the expanded window, which
//! is focusable and behaves like the list it is. If either of those two ever
//! goes away, this trade stops being defensible and the bar has to become
//! focusable again.

use tauri::{Emitter, LogicalPosition, LogicalSize, WebviewWindow};

/// A lip hanging off the menu bar. Wide enough for a count and a hint.
const COLLAPSED: (f64, f64) = (228.0, 36.0);

/// The picker. Unfurls downward from the same edge the lip hangs from.
const EXPANDED: (f64, f64) = (560.0, 380.0);

/// Anything wider than this is the picker. Halfway between the two widths.
const EXPANDED_THRESHOLD: f64 = 396.0;

/// The event the frontend listens on to know which of the two it is drawing.
pub const STATE_EVENT: &str = "pill:state";

/**
 * Size the window and put it back on its mark.
 *
 * Top-centred, flush against the underside of the menu bar. Both sizes share
 * that edge, so growing and shrinking happen against something fixed and the
 * picker unfurls from exactly where the lip was — the only reason the two read
 * as one object rather than two windows taking turns.
 *
 * ── Why the top, and not the bottom ──────────────────────────────────────────
 * The bottom centre of a Mac screen is the busiest strip on the machine. Wispr
 * puts its bar there, the Dock lives there, and every video player on the web
 * puts its scrubber there — a bar sitting in that spot spends its life being
 * covered by something. The top centre is the one piece of real estate no
 * companion app has claimed, and on a MacBook it puts Sidq directly under the
 * notch, which is either the best or the worst thing about it depending on who
 * you ask. Both of those are better than not being noticed.
 *
 * The work area is the screen minus the menu bar, and it is already in global
 * coordinates, so a second display with a non-zero origin lands correctly
 * without any arithmetic of our own.
 */
fn place(w: &WebviewWindow, size: (f64, f64)) -> tauri::Result<()> {
    w.set_size(LogicalSize::new(size.0, size.1))?;

    if let Ok(Some(monitor)) = w.current_monitor() {
        let scale = monitor.scale_factor();
        let area = monitor.work_area();
        let origin = area.position.to_logical::<f64>(scale);
        let usable = area.size.to_logical::<f64>(scale);

        w.set_position(LogicalPosition::new(
            origin.x + (usable.width - size.0) / 2.0,
            origin.y,
        ))?;
    }

    Ok(())
}

/// Which of the two the window is currently in, read off its own width.
///
/// Derived rather than stored: one source of truth that cannot drift out of
/// step with the window it is describing.
pub fn is_expanded(w: &WebviewWindow) -> bool {
    let Ok(size) = w.inner_size() else { return false };
    let scale = w.scale_factor().unwrap_or(1.0);
    size.to_logical::<f64>(scale).width > EXPANDED_THRESHOLD
}

/// Grow into the picker and take focus, because now it is a keyboard list.
pub fn expand(w: &WebviewWindow) -> tauri::Result<()> {
    w.set_focusable(true)?;
    place(w, EXPANDED)?;
    w.show()?;
    w.set_focus()?;
    let _ = w.emit_to(w.label(), STATE_EVENT, "expanded");
    Ok(())
}

/**
 * Shrink back to the bar.
 *
 * Hidden and shown around the resize so macOS hands key status back to whatever
 * you were actually working in. Marking the window non-focusable alone stops it
 * *becoming* key; it does not make it give up key status it already holds, and
 * the difference is a person pressing Esc and then typing into nothing.
 */
pub fn collapse(w: &WebviewWindow) -> tauri::Result<()> {
    w.set_focusable(false)?;
    let _ = w.hide();
    place(w, COLLAPSED)?;
    w.show()?;
    let _ = w.emit_to(w.label(), STATE_EVENT, "collapsed");
    Ok(())
}

/// ⌘⇧K, and clicking the tray item. Open if shut, shut if open.
pub fn toggle(w: &WebviewWindow) -> tauri::Result<()> {
    if is_expanded(w) && w.is_visible().unwrap_or(false) {
        collapse(w)
    } else {
        expand(w)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_threshold_separates_the_two_sizes() {
        // If it did not sit between them, `is_expanded` would answer the same
        // for both and the toggle would stick in one state.
        assert!(COLLAPSED.0 < EXPANDED_THRESHOLD);
        assert!(EXPANDED.0 > EXPANDED_THRESHOLD);
    }

    #[test]
    fn the_picker_fits_under_the_menu_bar_on_the_smallest_mac() {
        /*
         * Top-anchoring moves the failure to the other end: a card taller than
         * the work area runs off the bottom of the screen, and the row you
         * cannot reach is the oldest conversation, which is the one you opened
         * the picker to find.
         *
         * 13-inch MacBooks report a 1470x956 work area at their default scaled
         * resolution; 900 is below every Mac Sidq runs on.
         */
        let shortest_work_area = 900.0;
        assert!(EXPANDED.1 < shortest_work_area);
        assert!(COLLAPSED.1 < EXPANDED.1, "the lip is the smaller of the two");
    }
}
