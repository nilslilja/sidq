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

use tauri::{LogicalPosition, LogicalSize, WebviewWindow};


/**
 * Small enough to live in the menu bar.
 *
 * It was 228x36 hanging below the menu bar, which is exactly where a browser
 * puts its tabs: it covered three of them, dead centre, on every window. Any
 * always-on-top strip below the menu bar collides with something, because that
 * row belongs to whatever application is in front.
 *
 * The menu bar itself does not. Menus sit on the left, status items on the
 * right, and the middle is empty on every Mac without a notch. Nothing else
 * claims it, so nothing is covered.
 */
const COLLAPSED: (f64, f64) = (152.0, 24.0);

/**
 * A menu bar this tall means a notch, and the middle is the camera.
 *
 * Notched MacBooks report roughly 37 points against 24 on everything else.
 * Sitting in the middle there would put the bar behind the housing, so those
 * displays get the old position below the bar instead.
 */
const NOTCH_MENU_BAR: f64 = 34.0;

/// The picker. Unfurls downward from the same edge the lip hangs from.
const EXPANDED: (f64, f64) = (560.0, 380.0);

/// Anything wider than this is the picker. Halfway between the two widths.
const EXPANDED_THRESHOLD: f64 = 396.0;

/*
 * ── How the frontend knows which of the two it is drawing ────────────────────
 * It measures itself. There is no event.
 *
 * There was one, and it cost an afternoon. `emit_to(label, …)` builds an
 * `EventTarget::AnyLabel` that no JS `listen()` ever receives, so the window
 * resized and the frontend never heard; switching to the global `emit` did not
 * fix it either, because the emit sits at the end of a chain of `?` and one
 * failing call before it skips the announcement entirely. Neither failure
 * produced an error anywhere. Both produced the same thing on screen: a window
 * at the picker's size still drawing the bar.
 *
 * The window's own width is the fact the component actually needs, it is
 * already correct by the time anything could be announced, and the DOM reports
 * it changing without being asked. So the frontend reads `window.innerWidth`
 * and Rust says nothing. The threshold below is duplicated there, which is the
 * one thing to keep in step.
 */

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
        let screen = monitor.position().to_logical::<f64>(scale);

        // The gap between the top of the screen and the top of the work area is
        // the menu bar.
        let menu_bar = origin.y - screen.y;
        let collapsed = size.1 <= COLLAPSED.1;
        let notched = menu_bar >= NOTCH_MENU_BAR;

        /*
         * Collapsed, sit inside the menu bar. Expanded, hang below it.
         *
         * The bar is small and the menu bar's middle is empty, so it covers
         * nothing. The picker is 380 tall and belongs under the bar, where it
         * is over the page rather than over the browser's own controls.
         */
        let y = if collapsed && !notched { screen.y } else { origin.y };

        w.set_position(LogicalPosition::new(
            origin.x + (usable.width - size.0) / 2.0,
            y,
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
    fn the_frontend_threshold_matches_this_one() {
        /*
         * `EXPANDED_THRESHOLD` is duplicated in src/routes/Pill.tsx, because
         * the frontend decides what to draw by measuring its own window and
         * cannot import a Rust constant. If the two drift, the picker renders
         * at the bar's size or the reverse.
         */
        let frontend = include_str!("../../src/routes/Pill.tsx");
        assert!(
            frontend.contains(&format!("{EXPANDED_THRESHOLD:.0}")),
            "Pill.tsx must use the same {EXPANDED_THRESHOLD} threshold"
        );
    }

    #[test]
    fn the_threshold_separates_the_two_sizes() {
        // If it did not sit between them, `is_expanded` would answer the same
        // for both and the toggle would stick in one state.
        assert!(COLLAPSED.0 < EXPANDED_THRESHOLD);
        assert!(EXPANDED.0 > EXPANDED_THRESHOLD);
    }

    #[test]
    fn the_bar_fits_inside_a_menu_bar() {
        /*
         * It was 36 points tall and hung below the menu bar, which is where a
         * browser draws its tabs. It covered three of them, dead centre, in
         * every window. Anything living in that row covers whatever is in
         * front; the menu bar's middle belongs to nobody.
         */
        let ordinary_menu_bar = 24.0;
        assert!(COLLAPSED.1 <= ordinary_menu_bar, "must not overhang the menu bar");
        assert!(COLLAPSED.1 < NOTCH_MENU_BAR);
    }

    #[test]
    fn a_notched_display_is_told_apart_by_its_menu_bar() {
        // The middle of a notched menu bar is the camera housing, so the bar
        // goes below it there instead of behind it.
        let notched = 37.0;
        let ordinary = 24.0;
        assert!(notched >= NOTCH_MENU_BAR);
        assert!(ordinary < NOTCH_MENU_BAR);
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
