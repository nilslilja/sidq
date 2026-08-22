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

/*
 * ── Staying above everything ─────────────────────────────────────────────────
 * `alwaysOnTop` and `visibleOnAllWorkspaces` were both set and were not enough.
 * Tauri's always-on-top is NSFloatingWindowLevel, which is 3: above ordinary
 * windows and below the menu bar at 24, so a bar living inside the menu bar was
 * drawn over by it. And a window only joins a fullscreen Space if its
 * collection behaviour says so, which `visibleOnAllWorkspaces` alone does not.
 *
 * Neither is reachable through Tauri, so both are set on the NSWindow directly.
 */

/// Where the collapsed bar sits: in the menu bar band, above the bar itself.
///
/// It lives inside the menu bar, so it has to outrank it or be drawn over.
const BAR_LEVEL: i64 = 25;

/**
 * Where the picker sits, which has to be higher.
 *
 * macOS hides the entire menu bar band in a fullscreen Space, and a window at
 * band level goes with it. Measured with a fullscreen app in front: neither the
 * bar nor the picker appeared, and ⌘⇧K did nothing at all. For anybody who
 * works fullscreen that is the whole product missing, silently.
 *
 * Popup menus are the exception — they draw over fullscreen apps, and they live
 * at NSPopUpMenuWindowLevel. The picker is exactly that sort of thing: summoned,
 * temporary, on top of whatever you were doing.
 *
 * The bar stays in the band and still hides in fullscreen, which is right
 * rather than a compromise: it is menu bar furniture and it should disappear
 * when the menu bar does. ⌘⇧K brings the picker back regardless.
 */
const PICKER_LEVEL: i64 = 101;

/// canJoinAllSpaces | stationary | fullScreenAuxiliary.
///
/// The last one is what puts it over a fullscreen app. Without it the bar
/// simply is not there for anybody watching a video or writing in a fullscreen
/// editor, which is most of the day.
const COLLECTION_BEHAVIOUR: u64 = (1 << 0) | (1 << 4) | (1 << 8);

/**
 * Raise the window above the menu bar and into every Space.
 *
 * ── Why this hops to the main thread ─────────────────────────────────────────
 * AppKit is not thread-safe and does not fail politely about it. These are raw
 * objc messages to an NSWindow, and `expand` is called from a Tauri command and
 * from the loopback listener, both of which run on worker threads. Doing it
 * there took the whole app down with EXC_BREAKPOINT inside
 * `NSApplication NS_touchBarProviders`, which names nothing to do with windows
 * or levels and is therefore extremely hard to trace back.
 *
 * The user-visible version of that bug: clicking the Sidq chip on a web page
 * quit Sidq.
 *
 * Tauri's own window methods marshal internally, which is why `show` and
 * `set_size` were fine and only the hand-written part crashed.
 */
pub fn raise_above_everything(w: &WebviewWindow, level: i64) {
    let window = w.clone();
    let _ = w.run_on_main_thread(move || raise_now(&window, level));
}

fn raise_now(w: &WebviewWindow, level: i64) {
    let Ok(handle) = w.ns_window() else { return };
    if handle.is_null() {
        return;
    }

    // SAFETY: `handle` is the NSWindow Tauri created for this window and is
    // alive for as long as the window is. Both selectors take one primitive
    // argument and return nothing.
    unsafe {
        use objc::{msg_send, sel, sel_impl};
        let ns_window = handle as *mut objc::runtime::Object;
        let _: () = msg_send![ns_window, setLevel: level];
        let _: () = msg_send![ns_window, setCollectionBehavior: COLLECTION_BEHAVIOUR];

        /*
         * Force it into the Space that is actually on screen.
         *
         * Setting canJoinAllSpaces tells macOS the window is allowed everywhere;
         * it does not move a window that is already assigned to the Space it was
         * created in. When another application owns a fullscreen Space, that is
         * the difference between the picker appearing and ⌘⇧K doing nothing at
         * all. `orderFrontRegardless` brings it forward without activating Sidq,
         * which is the point: the keyboard should stay where it was.
         */
        let _: () = msg_send![ns_window, orderFrontRegardless];

    }
}

/**
 * Become a menu bar utility rather than an ordinary application.
 *
 * The last thing standing between the bar and a fullscreen window. Level 25 and
 * fullScreenAuxiliary were both being applied — verified by reading them back
 * off the NSWindow — and the bar still did not appear over a fullscreen Chrome.
 * A window only floats over *another* application's fullscreen Space if its own
 * application is an accessory, which is why every menu bar utility on the
 * machine is one.
 *
 * The cost is the Dock icon, and Sidq is the better shape without it: the bar
 * is the product, it lives in the menu bar, and there is already a tray menu
 * for opening the window and quitting.
 */
pub fn become_accessory() {
    // Called from setup, which is already the main thread. AppKit from anywhere
    // else is what crashed this app once already.
    // SAFETY: NSApp is the shared application, alive for the process, and
    // setActivationPolicy: takes one integer.
    unsafe {
        use objc::{class, msg_send, sel, sel_impl};
        let app: *mut objc::runtime::Object = msg_send![class!(NSApplication), sharedApplication];
        // NSApplicationActivationPolicyAccessory
        let _: bool = msg_send![app, setActivationPolicy: 1i64];
    }
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
    /*
     * Nothing here uses `?`, and that is the point.
     *
     * This has now been broken twice by the same shape: a chain of fallible
     * calls with the step that actually matters at the end of it. The first
     * time an early failure skipped the state event; this time `set_focus`
     * fails when another application owns a fullscreen Space, so `expand`
     * returned early and the window level was never raised — which is exactly
     * the case the level exists for. The picker simply did not appear, and
     * nothing reported anything.
     *
     * Each step is independent and none of them can stop the next.
     */
    let _ = w.set_focusable(true);
    let _ = place(w, EXPANDED);
    let _ = w.show();

    // After showing, never before: showing resets the level and the collection
    // behaviour, so raising first is raising and then undoing it a line later.
    raise_above_everything(w, PICKER_LEVEL);

    // Last, and allowed to fail. In another app's fullscreen Space it does, and
    // a picker on screen that has not taken the keyboard is worth far more than
    // no picker at all.
    let _ = w.set_focus();
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
    // Same reasoning as `expand`: no `?`, because the raise is last and must
    // not be skipped by anything before it.
    let _ = w.set_focusable(false);
    let _ = w.hide();
    let _ = place(w, COLLAPSED);
    let _ = w.show();
    raise_above_everything(w, BAR_LEVEL);
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
    fn the_bar_outranks_the_menu_bar_but_not_an_open_menu() {
        /*
         * Tauri's always-on-top is NSFloatingWindowLevel, 3, which is below the
         * menu bar at 24 — so a bar living inside the menu bar was drawn over
         * by it however many always-on-top flags were set.
         *
         * The ceiling matters as much as the floor. NSPopUpMenuWindowLevel is
         * 101, and a bar that outranked an open menu would draw on top of one.
         */
        const NS_FLOATING: i64 = 3;
        const NS_MAIN_MENU: i64 = 24;

        assert!(BAR_LEVEL > NS_FLOATING);
        assert!(BAR_LEVEL > NS_MAIN_MENU, "the bar lives inside the menu bar");

        /*
         * The picker has to outrank the band, or it goes wherever the band
         * goes. Measured with a fullscreen app in front: at band level neither
         * the bar nor the picker appeared and ⌘⇧K did nothing, which is the
         * whole product missing for anybody who works fullscreen.
         */
        assert!(PICKER_LEVEL > BAR_LEVEL, "the picker must survive fullscreen");
    }

    #[test]
    fn it_joins_fullscreen_spaces() {
        /*
         * canJoinAllSpaces alone is not enough. A fullscreen Space excludes
         * every window that has not asked for fullScreenAuxiliary, so without
         * that bit the bar is simply absent for anybody watching a video or
         * working in a fullscreen editor, which is most of the day.
         */
        const CAN_JOIN_ALL_SPACES: u64 = 1 << 0;
        const FULL_SCREEN_AUXILIARY: u64 = 1 << 8;

        assert_ne!(COLLECTION_BEHAVIOUR & CAN_JOIN_ALL_SPACES, 0);
        assert_ne!(COLLECTION_BEHAVIOUR & FULL_SCREEN_AUXILIARY, 0);
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
