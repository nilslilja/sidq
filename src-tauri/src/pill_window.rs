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

use tauri::{Emitter, LogicalPosition, LogicalSize, WebviewWindow};

/// A bar. Wide enough for a label and a hint, short enough to ignore.
const COLLAPSED: (f64, f64) = (232.0, 52.0);

/// The picker. Matches what the window was before it learned to shrink.
const EXPANDED: (f64, f64) = (560.0, 340.0);

/// Clear of the Dock without floating in the middle of the screen.
const BOTTOM_MARGIN: f64 = 72.0;

/// Anything wider than this is the picker. Halfway between the two widths.
const EXPANDED_THRESHOLD: f64 = 396.0;

/// The event the frontend listens on to know which of the two it is drawing.
pub const STATE_EVENT: &str = "pill:state";

/**
 * Size the window and put it back on its mark.
 *
 * Bottom-anchored, so growing and shrinking happen against a fixed edge rather
 * than moving the whole card up the screen. The expanded picker appears where
 * the bar was, which is the only reason the two feel like one object.
 *
 * The monitor's own origin is added because on a second display it is not zero,
 * and leaving it out is how a window ends up on the laptop screen every time
 * regardless of which one you were working on.
 */
fn place(w: &WebviewWindow, size: (f64, f64)) -> tauri::Result<()> {
    w.set_size(LogicalSize::new(size.0, size.1))?;

    if let Ok(Some(monitor)) = w.current_monitor() {
        let scale = monitor.scale_factor();
        let screen = monitor.size().to_logical::<f64>(scale);
        let origin = monitor.position().to_logical::<f64>(scale);

        w.set_position(LogicalPosition::new(
            origin.x + (screen.width - size.0) / 2.0,
            origin.y + screen.height - BOTTOM_MARGIN - size.1,
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
    fn both_sizes_clear_the_bottom_of_the_screen() {
        // A 900px-tall card anchored 72px from the bottom would run off the top
        // of a laptop display, which is the failure mode of bottom-anchoring.
        let shortest_mac_display = 800.0;
        assert!(EXPANDED.1 + BOTTOM_MARGIN < shortest_mac_display);
    }
}
