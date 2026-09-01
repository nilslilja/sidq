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

use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};

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
const COLLAPSED: (f64, f64) = (208.0, 56.0);

/**
 * How far the floating bar hangs below the top of the screen.
 *
 * Roughly a centimetre at 72 points to the inch. The bar used to sit inside the
 * menu bar, flush against the very top, which made it part of the system chrome
 * — and something that is part of the chrome is something you stop seeing. Held
 * clear of every edge it reads as the app's own object sitting above the
 * desktop, which is the whole point of it.
 */
const FLOAT_GAP: f64 = 28.0;

/**
 * The bar inside that window, in points.
 *
 * The window is deliberately larger than the thing it draws. A glow and a
 * shadow are painted outside the pill's own box and are clipped at the window
 * edge, so a window sized to the pill would cut both off square — which looks
 * exactly like a bug and is the reason the old flush bar had no elevation at
 * all. The margin is where the light goes.
 */
const BAR: (f64, f64) = (152.0, 28.0);

/**
 * Whether the screen the bar is on has a camera housing over the menu bar.
 *
 * This used to be inferred from the height of the menu bar: 34 points or more
 * meant a notch. That guess had four points of room. This Mac, which has no
 * notch, reports a 30 point band — the menu bar is 24 and macOS adds padding —
 * and the number moves between releases and displays. Four points is not a
 * margin, it is a coin toss on hardware that cannot be tested here.
 *
 * `safeAreaInsets` is the actual answer. AppKit reports a non-zero top inset on
 * exactly the displays with a housing, and it is what the housing measures.
 * Verified against this machine: inset 0, `auxiliaryTopLeftArea` nil, band 30.
 *
 * Read on the main thread and cached, because `place` runs on whichever thread
 * called `expand`, and reaching into AppKit off the main thread is what took
 * this app down once already.
 */
static NOTCH_HEIGHT: AtomicU64 = AtomicU64::new(0);

/**
 * Measure the screen the bar is on. Main thread only.
 *
 * Called from setup and again on every raise, so moving the window to a display
 * with different hardware corrects itself on the next open.
 */
/**
 * Whether anybody has successfully asked the system about this screen yet.
 *
 * Separate from the height because zero is a real, useful answer and "we do not
 * know" must never be mistaken for it.
 */
static NOTCH_MEASURED: AtomicBool = AtomicBool::new(false);

fn measure_notch(ns_window: *mut objc::runtime::Object) {
    // SAFETY: `ns_window` is a live NSWindow, the thread is checked below, and
    // `screen` returns nil when the window is off-screen, which `mainScreen`
    // covers.
    unsafe {
        use objc::{class, msg_send, sel, sel_impl};

        /*
         * AppKit, from anywhere else, is undefined behaviour.
         *
         * `place` is reached from `hide_pill` and `expand_pill`, which are
         * Tauri commands and therefore run on a worker thread. Tauri marshals
         * its own window calls; a raw `msg_send` to NSScreen is not marshalled
         * by anybody. Refusing here is safe because the value is already
         * measured by then: see `measure_from_setup`.
         */
        let main: bool = msg_send![class!(NSThread), isMainThread];
        if !main {
            return;
        }

        let mut screen: *mut objc::runtime::Object = msg_send![ns_window, screen];
        if screen.is_null() {
            screen = msg_send![class!(NSScreen), mainScreen];
        }
        if screen.is_null() {
            return;
        }

        // safeAreaInsets arrived in macOS 12, and so did the first Mac with a
        // housing, so an older system answering nothing here is also answering
        // that there is no notch.
        let responds: bool = msg_send![screen, respondsToSelector: sel!(safeAreaInsets)];
        if !responds {
            return;
        }

        // NSEdgeInsets is four CGFloats: top, left, bottom, right.
        #[repr(C)]
        struct EdgeInsets {
            top: f64,
            left: f64,
            bottom: f64,
            right: f64,
        }
        let insets: EdgeInsets = msg_send![screen, safeAreaInsets];
        NOTCH_HEIGHT.store(insets.top.to_bits(), Ordering::Relaxed);
        NOTCH_MEASURED.store(true, Ordering::Relaxed);
    }
}

/**
 * The housing inset, or the safe answer when nobody has managed to look.
 *
 * ── Why unmeasured is not the same as zero ───────────────────────────────────
 * Zero means "measured, and this screen has no housing", and it buys the
 * collapsed bar its place inside the menu bar. Unmeasured used to produce the
 * same answer, and the two are not remotely equivalent: on a 14 or 16 inch
 * MacBook the bar is centred, the camera housing is centred, and a window at
 * menu bar level is directly behind it. The bar would simply not exist, and
 * would not exist in the way that is hardest to report — nothing is broken, it
 * is just never there.
 *
 * So a failure to measure returns a value that keeps the bar below the menu
 * bar. That position is worse on a Mac with no housing: it is the row browser
 * tabs live in, which is why the bar moved up in the first place. It is still
 * better than being invisible to most people buying a Mac today, and it is the
 * direction a failure should fall.
 */
fn notch_height() -> f64 {
    if !NOTCH_MEASURED.load(Ordering::Relaxed) {
        return UNMEASURED_NOTCH;
    }
    f64::from_bits(NOTCH_HEIGHT.load(Ordering::Relaxed))
}

/**
 * What an unmeasured screen is treated as having.
 *
 * Any positive number picks the safe branch in `top_edge`. This one is a real
 * housing height rather than 1.0 so that reading it in a log or a debugger says
 * what it means.
 */
const UNMEASURED_NOTCH: f64 = 32.0;

/**
 * Measure the housing before anything can be positioned.
 *
 * ── The jump this removes ────────────────────────────────────────────────────
 *
 * The inset used to be measured as a side effect of raising the window, which
 * happens after the first `place`. So the first placement of a session ran with
 * nothing measured, took the deliberately cautious branch in `top_edge` — the
 * one that keeps the bar clear of a housing it cannot rule out — and sat about
 * a centimetre below the top. The next placement had the measurement and
 * snapped it up.
 *
 * That jump was the whole bug. Not a wrong position: a position that was only
 * right the second time.
 *
 * Called from setup, on the main thread, before the pill is ever shown.
 */
pub fn measure_from_setup(w: &WebviewWindow) {
    if let Ok(handle) = w.ns_window() {
        measure_notch(handle as *mut objc::runtime::Object);
    }
}

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

        let y = top_edge(screen.y, origin.y, notch_height());

        w.set_position(LogicalPosition::new(
            origin.x + (usable.width - size.0) / 2.0,
            y,
        ))?;
    }

    Ok(())
}


/**
 * Which edge the window hangs from, given the screen and the housing.
 *
 * Collapsed, sit inside the menu bar: it is 24 points tall, the middle of it is
 * empty on every Mac without a housing, and nothing else claims that strip.
 *
 * With a housing, that same strip is the camera. The bar is centred, the
 * housing is centred, and a window at menu bar level would be behind it — the
 * bar would not exist for anybody on a 14 or 16 inch MacBook, which is most
 * people buying a Mac now. Those displays get the top of the work area instead,
 * which is below the menu bar and therefore below the housing, always.
 *
 * That position is worse: it is the row browser tabs live in, which is why the
 * bar moved up into the menu bar in the first place. It is worse than being
 * covered by exactly nothing, which is the alternative.
 *
 * ── The top edge does not depend on whether it is open ──────────────────────
 *
 * It used to. Collapsed returned the screen top and expanded returned the work
 * area, which on a Mac without a housing are different numbers — so opening the
 * picker dropped it by the height of the menu bar, every single time, and the
 * one thing an overlay anchored to the top of the screen must never do is move
 * when you touch it.
 *
 * Now the edge is a property of the screen and nothing else. Collapsed and
 * expanded hang from the same line, and opening is the card growing downward
 * from a fixed point rather than a jump followed by a resize. On a machine with
 * a housing both still clear it, because both take the work area.
 *
 * The cost is that the open picker covers the menu bar on a notchless Mac. It
 * is a transient panel that closes on Escape or a click elsewhere, and being
 * briefly over the menu bar is a smaller problem than lurching on open.
 */
fn top_edge(screen_top: f64, work_top: f64, notch: f64) -> f64 {
    if notch <= 0.0 {
        screen_top + FLOAT_GAP
    } else {
        /*
         * A centimetre from the top of a 14 inch MacBook is still inside the
         * camera housing, and half a bar behind a black cutout is worse than
         * any inconsistency in where it sits. So the gap is a minimum rather
         * than a position: whichever is lower, a centimetre or just under the
         * housing, wins.
         *
         * In practice the two land within ten points of each other, so the bar
         * looks like it is in the same place on both machines without ever
         * being behind anything on either.
         */
        (screen_top + FLOAT_GAP).max(work_top)
    }
}


/*
 * ── Closing the picker by clicking somewhere else ────────────────────────────
 *
 * `WindowEvent::Focused(false)` was the whole dismissal story and it stopped
 * being enough the moment the window became a non-activating panel.
 *
 * That panel takes the keyboard without activating Sidq, which is the point of
 * it: you press the shortcut inside a fullscreen editor, type, and the editor
 * never goes away. The cost is that the application underneath was never
 * deactivated, so clicking back into it is not an app switch, no window changes
 * key, and nothing fires. Measured: picker open over a fullscreen app, click in
 * that app, frontmost application unchanged, picker still there. The only ways
 * out left were Esc and the shortcut, which is a keyboard-shaped exit on a
 * thing people close with the mouse.
 *
 * A global mouse monitor sees those clicks. It reports events going to *other*
 * applications only, so clicks inside the picker never reach it and it needs no
 * handler of its own to tell them apart. Mouse monitors, unlike key monitors,
 * work without the accessibility permission, so this holds for people who never
 * granted it.
 *
 * Installed while the picker is open and removed when it shuts, rather than
 * left running for the life of the app: it is a callback on every click on the
 * machine and it should not exist while there is nothing to close.
 */

/// The live monitor, as a raw retained pointer. Zero when nothing is watching.
static CLICK_MONITOR: AtomicUsize = AtomicUsize::new(0);

/// Turn the watch on or off. Hops to the main thread, like everything AppKit.
///
/// Deferring matters more than it looks: turning it *off* happens inside the
/// monitor's own handler, by way of `collapse`, and releasing a monitor while
/// its block is mid-call would free the block underneath itself. Posting the
/// removal means it lands after the handler has returned.
fn watch_for_outside_clicks(w: &WebviewWindow, on: bool) {
    let window = w.clone();
    let _ = w.run_on_main_thread(move || {
        if on {
            start_watching(&window);
        } else {
            stop_watching();
        }
    });
}

fn start_watching(w: &WebviewWindow) {
    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2_app_kit::{NSEvent, NSEventMask};

    if CLICK_MONITOR.load(Ordering::Relaxed) != 0 {
        return;
    }

    let window = w.clone();
    let handler = RcBlock::new(move |_event: core::ptr::NonNull<NSEvent>| {
        /*
         * Hand this to the next turn of the loop rather than doing it here.
         *
         * This block runs inside AppKit's own event dispatch. Collapsing from
         * in there hid the window, resized it and showed it again while the
         * click was still being delivered, and what came back was neither the
         * bar nor the picker: the window reported itself visible at the
         * picker's size with nothing drawn at all. Posting it means the resize
         * happens on a clean turn, which is also when `stop_watching` releases
         * the monitor whose block is running right now.
         */
        let pill = window.clone();
        let _ = window.run_on_main_thread(move || {
            if is_expanded(&pill) {
                let _ = collapse(&pill);
            }
        });
    });

    let mask = NSEventMask::LeftMouseDown
        | NSEventMask::RightMouseDown
        | NSEventMask::OtherMouseDown;

    // SAFETY: main thread. The handler outlives the monitor: the block is
    // retained by AppKit for as long as the monitor is registered, and the
    // monitor is released only in `stop_watching`.
    let token = unsafe { NSEvent::addGlobalMonitorForEventsMatchingMask_handler(mask, &handler) };

    if let Some(token) = token {
        CLICK_MONITOR.store(Retained::into_raw(token) as usize, Ordering::Relaxed);
    }
}

fn stop_watching() {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2_app_kit::NSEvent;

    let token = CLICK_MONITOR.swap(0, Ordering::Relaxed);
    if token == 0 {
        return;
    }

    // SAFETY: the pointer came from `Retained::into_raw` in `start_watching`
    // and has been swapped out, so this is the only owner of it.
    unsafe {
        let token = Retained::from_raw(token as *mut AnyObject).expect("non-null, just checked");
        NSEvent::removeMonitor(&token);
    }
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
/**
 * Put the window above everything, including another app's fullscreen Space.
 *
 * `take_key` decides whether it also takes the keyboard. The picker has to —
 * it is a search field, and typing into it has to work from inside a fullscreen
 * app without switching out of one. The bar must not: it sits in the menu bar
 * strip all day and would be stealing every keystroke on the machine.
 */
pub fn raise_above_everything(w: &WebviewWindow, level: i64, take_key: bool) {
    let window = w.clone();
    let _ = w.run_on_main_thread(move || raise_now(&window, level, take_key));
}

/**
 * The panel class the pill window is retyped into.
 *
 * Plain NSPanel is not enough. `canBecomeKeyWindow` on both NSWindow and
 * NSPanel returns NO for a borderless window, so the picker drew over a
 * fullscreen app and then watched nine typed characters go to the app
 * underneath it. Tao normally works around this by subclassing NSWindow and
 * reading a `focusable` ivar, and that subclass is exactly what gets replaced
 * here, so the override has to be replaced with it.
 *
 * `canBecomeMainWindow` stays NO on purpose. Main window is what makes an
 * application the one in front, and this one has to take the keyboard without
 * taking the foreground.
 *
 * Registered once. Registering a class name twice aborts the process.
 */
fn sidq_panel_class() -> *const objc::runtime::Class {
    use objc::declare::ClassDecl;
    use objc::runtime::{Object, Sel, BOOL, NO, YES};
    use std::sync::OnceLock;

    static REGISTERED: OnceLock<usize> = OnceLock::new();

    extern "C" fn yes(_: &Object, _: Sel) -> BOOL {
        YES
    }
    extern "C" fn no(_: &Object, _: Sel) -> BOOL {
        NO
    }

    let address = *REGISTERED.get_or_init(|| {
        use objc::{class, sel, sel_impl};
        let mut decl = ClassDecl::new("SidqPanel", class!(NSPanel))
            .expect("SidqPanel is registered exactly once");
        // SAFETY: both methods match the selectors' signatures — no arguments
        // beyond the implicit two, returning BOOL.
        unsafe {
            decl.add_method(
                sel!(canBecomeKeyWindow),
                yes as extern "C" fn(&Object, Sel) -> BOOL,
            );
            decl.add_method(
                sel!(canBecomeMainWindow),
                no as extern "C" fn(&Object, Sel) -> BOOL,
            );
        }
        decl.register() as *const objc::runtime::Class as usize
    });

    address as *const objc::runtime::Class
}

fn raise_now(w: &WebviewWindow, level: i64, take_key: bool) {
    let Ok(handle) = w.ns_window() else { return };
    if handle.is_null() {
        return;
    }

    // SAFETY: `handle` is the NSWindow Tauri created for this window and is
    // alive for as long as the window is. Every selector below takes one
    // primitive argument or none, and this runs on the main thread.
    unsafe {
        use objc::{msg_send, sel, sel_impl};
        let ns_window = handle as *mut objc::runtime::Object;

        // Main thread, and the only place in this file that reliably is.
        measure_notch(ns_window);

        /*
         * ── Become a panel ────────────────────────────────────────────────
         *
         * An ordinary NSWindow does not enter another application's fullscreen
         * Space, whatever its level and collection behaviour say. Measured
         * repeatedly: accessory activation policy, level 25 and 101,
         * canJoinAllSpaces with fullScreenAuxiliary, orderFrontRegardless — all
         * applied, all read back off the window as correct, and the picker
         * still did not appear over a fullscreen app. ⌘⇧K did nothing, silently,
         * for anybody working fullscreen.
         *
         * NSPanel does. It is the class Spotlight and every launcher on this
         * platform uses for exactly this, and swapping an existing window's
         * class is the documented way to get one out of a framework that only
         * makes NSWindows.
         *
         * The non-activating style mask is the other half: a panel that
         * activates would pull the person out of their fullscreen app just by
         * appearing, which is worse than not appearing at all.
         */
        // objc 0.2 does not bind object_setClass, so it is declared here. It
        // is a plain runtime function and the signature is stable.
        extern "C" {
            fn object_setClass(
                obj: *mut objc::runtime::Object,
                cls: *const objc::runtime::Class,
            ) -> *const objc::runtime::Class;
        }

        let panel = sidq_panel_class();
        let current: *const objc::runtime::Class = msg_send![ns_window, class];
        if current != panel {
            object_setClass(ns_window, panel);
        }

        const NON_ACTIVATING_PANEL: u64 = 1 << 7;
        let mask: u64 = msg_send![ns_window, styleMask];
        let _: () = msg_send![ns_window, setStyleMask: mask | NON_ACTIVATING_PANEL];

        // Panels hide when their app deactivates unless told otherwise, and
        // this one has to outlive every switch away from Sidq.
        let _: () = msg_send![ns_window, setHidesOnDeactivate: false];
        let _: () = msg_send![ns_window, setFloatingPanel: true];
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

        /*
         * `orderFrontRegardless` puts it on screen. It does not give it the
         * keyboard, and a borderless window will not take it by being clicked
         * either — measured: the picker drew over a fullscreen app and three
         * typed characters went to the app underneath.
         *
         * `makeKeyWindow` on a non-activating panel is the one call that hands
         * over the keyboard without activating Sidq, which is the whole trade:
         * type into the picker, stay in the app you were in.
         */
        if take_key {
            let _: () = msg_send![ns_window, makeKeyWindow];
        }
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
    let Ok(size) = w.inner_size() else {
        return false;
    };
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
    /*
     * No `set_focusable` here or in `collapse`.
     *
     * Tauri's version writes a `focusable` ivar on tao's NSWindow subclass, and
     * this window is an NSPanel now — calling it panics with `ivar "focusable"
     * not found on class NSPanel` and takes the app down.
     *
     * It is also redundant. A non-activating panel already does the thing
     * set_focusable was standing in for: it can take the keyboard when clicked
     * and never pulls the person out of the app they are in.
     */
    let _ = place(w, EXPANDED);
    let _ = w.show();

    // After showing, never before: showing resets the level and the collection
    // behaviour, so raising first is raising and then undoing it a line later.
    raise_above_everything(w, PICKER_LEVEL, true);

    // Last, and allowed to fail. In another app's fullscreen Space it does, and
    // a picker on screen that has not taken the keyboard is worth far more than
    // no picker at all.
    let _ = w.set_focus();

    watch_for_outside_clicks(w, true);
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
    let _ = w.hide();
    let _ = place(w, COLLAPSED);
    let _ = w.show();
    raise_above_everything(w, BAR_LEVEL, false);
    watch_for_outside_clicks(w, false);
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

    /*
     * The numbers below are measured, not invented.
     *
     * No-notch is this machine: a 1440x900 built-in Retina display reporting
     * frame 0..900, visibleFrame 76..870, so a 30 point band above the work
     * area and a safeAreaInsets.top of 0. The notched figures are a 14 inch
     * MacBook Pro, where the housing is what safeAreaInsets.top reports.
     *
     * Coordinates here are Tauri's: y grows downward, so the top of the screen
     * is the smaller number.
     */
    /*
     * ── The position must not depend on when you ask ─────────────────────────
     *
     * The reported symptom was the bar appearing about a centimetre below the
     * top and then jumping up. Both positions came from this function; the
     * difference was only whether the housing had been measured yet, because
     * the measurement used to happen after the first placement.
     *
     * These pin the property that was actually violated: for one screen, the
     * answer does not change between the first call and the second.
     */
    #[test]
    fn the_same_screen_gives_the_same_answer_every_time() {
        for notch in [0.0, NOTCH] {
            let first = top_edge(SCREEN_TOP, WORK_TOP_PLAIN, notch);
            let again = top_edge(SCREEN_TOP, WORK_TOP_PLAIN, notch);
            assert_eq!(first, again);
        }
    }

    /*
     * ── Opening it must not move it ──────────────────────────────────────────
     *
     * The reported symptom, in the user's words: "I dont want to see it glitch
     * down from the very top 1 more time."
     *
     * Collapsed used to take the screen top and expanded the work area, so on
     * any Mac without a housing every open dropped the window by the height of
     * the menu bar. The size changes on expand; the top edge must not. There is
     * no longer a parameter that could reintroduce this, and this test is what
     * fails if somebody adds one back.
     */
    #[test]
    fn opening_the_picker_does_not_move_the_top_edge() {
        for (work_top, notch) in [(WORK_TOP_PLAIN, 0.0), (WORK_TOP_NOTCHED, NOTCH)] {
            let edge = top_edge(SCREEN_TOP, work_top, notch);
            assert_eq!(
                edge,
                top_edge(SCREEN_TOP, work_top, notch),
                "the edge is a property of the screen, not of the window's state"
            );
        }
    }

    /*
     * The jump, described exactly. An unmeasured screen with no housing is
     * placed low, and the same screen once measured is placed at the top. That
     * gap is what somebody sees move, which is why nothing may be positioned
     * before the measurement is in.
     */
    #[test]
    fn unmeasured_and_measured_disagree_on_a_notchless_mac() {
        let unmeasured = top_edge(SCREEN_TOP, WORK_TOP_PLAIN, UNMEASURED_NOTCH);
        let measured = top_edge(SCREEN_TOP, WORK_TOP_PLAIN, 0.0);

        assert!(
            unmeasured >= measured,
            "the cautious branch must never sit higher, or it is not cautious"
        );
        assert_eq!(
            measured,
            SCREEN_TOP + FLOAT_GAP,
            "measured and notchless means a gap below the top"
        );
    }

    /// And on a Mac with a housing, the top is never where it goes.
    #[test]
    fn a_housing_always_pushes_the_bar_clear_of_it() {
        let y = top_edge(SCREEN_TOP, WORK_TOP_NOTCHED, NOTCH);
        assert!(y >= WORK_TOP_NOTCHED - 0.01, "the bar would be behind the camera");
    }

    const SCREEN_TOP: f64 = 0.0;
    const WORK_TOP_PLAIN: f64 = 30.0;
    const WORK_TOP_NOTCHED: f64 = 38.0;
    const NOTCH: f64 = 32.0;

    #[test]
    fn the_bar_hangs_a_gap_below_the_top_when_there_is_no_housing() {
        // It sat at SCREEN_TOP, inside the menu bar. It floats now.
        assert_eq!(
            top_edge(SCREEN_TOP, WORK_TOP_PLAIN, 0.0),
            SCREEN_TOP + FLOAT_GAP
        );
    }

    #[test]
    fn the_bar_drops_below_the_menu_bar_when_there_is_one() {
        // The whole point: at SCREEN_TOP it would be behind the camera.
        assert_eq!(
            top_edge(SCREEN_TOP, WORK_TOP_NOTCHED, NOTCH),
            WORK_TOP_NOTCHED
        );
    }

    #[test]
    fn the_bar_clears_the_housing_by_its_full_height() {
        let y = top_edge(SCREEN_TOP, WORK_TOP_NOTCHED, NOTCH);
        assert!(
            y >= SCREEN_TOP + NOTCH,
            "the bar starts at {y}, inside a {NOTCH} point housing"
        );
    }

    /*
     * This test used to assert the opposite, and the thing it asserted was the
     * bug: that the open picker hangs below the menu bar "either way", which on
     * a notchless Mac is thirty points lower than the closed bar it grew out of.
     * That difference was the visible drop on every open.
     *
     * A housing still pushes it clear, because there the closed bar is already
     * at the work area and nothing moves.
     */
    #[test]
    fn the_picker_opens_from_the_same_edge_the_bar_sits_on() {
        assert_eq!(
            top_edge(SCREEN_TOP, WORK_TOP_PLAIN, 0.0),
            SCREEN_TOP + FLOAT_GAP
        );
        // On a housing the gap is a floor, so whichever is lower wins.
        assert_eq!(
            top_edge(SCREEN_TOP, WORK_TOP_NOTCHED, NOTCH),
            (SCREEN_TOP + FLOAT_GAP).max(WORK_TOP_NOTCHED)
        );
    }

    #[test]
    fn a_second_display_is_placed_against_its_own_top_edge() {
        // A monitor above the built-in one has a negative origin, and the bar
        // belongs at that screen's top rather than at zero. Both states, since
        // the edge no longer depends on which one it is in.
        assert_eq!(top_edge(-1080.0, -1050.0, 0.0), -1080.0 + FLOAT_GAP);
    }

    #[test]
    fn nothing_is_treated_as_a_housing_by_accident() {
        // The old rule was "menu bar 34 points or taller means a notch", and a
        // 30 point band on hardware with no camera housing is four points from
        // tripping it. The inset is what decides now, and it is zero here.
        assert_eq!(top_edge(SCREEN_TOP, 33.0, 0.0), SCREEN_TOP + FLOAT_GAP);
        assert_eq!(top_edge(SCREEN_TOP, 36.0, 0.0), SCREEN_TOP + FLOAT_GAP);
    }

    #[test]
    fn a_screen_nobody_could_measure_is_treated_as_having_a_housing() {
        /*
         * ── The failure that would be invisible ──────────────────────────────
         *
         * The bar is centred. The camera housing is centred. A collapsed bar at
         * menu bar level on a 14 or 16 inch MacBook is directly behind it, so
         * for most people buying a Mac today the bar would not exist — and it
         * would fail in the worst possible way, which is silently. Nothing
         * errors, nothing logs, it is simply never on screen.
         *
         * `safeAreaInsets` is measured once, on the main thread, against
         * whichever screen the window is on at the time. Every way that can go
         * wrong — an older system, a nil screen, the window created on an
         * external display and the lid opened afterwards — used to leave the
         * height at zero, which is also exactly what a real Mac with no housing
         * reports. The dangerous answer and the common answer were the same
         * value.
         *
         * They are now different. Unmeasured returns a positive height, which
         * puts the bar below the menu bar: worse on a Mac without a housing,
         * and visible on every Mac there is.
         */
        assert!(UNMEASURED_NOTCH > 0.0, "an unmeasured screen must take the safe branch");
        assert_eq!(
            top_edge(SCREEN_TOP, WORK_TOP_NOTCHED, UNMEASURED_NOTCH),
            (SCREEN_TOP + FLOAT_GAP).max(WORK_TOP_NOTCHED),
            "clear of the menu bar, where nothing can cover it",
        );
    }

    #[test]
    fn zero_still_means_a_measured_screen_with_no_housing() {
        // The other half of the same rule: a real answer of zero must give the
        // bar the plain float, or the housing check has cost every Mac without
        // one the position it was designed for.
        assert_eq!(
            top_edge(SCREEN_TOP, WORK_TOP_PLAIN, 0.0),
            SCREEN_TOP + FLOAT_GAP
        );
    }

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
        assert!(
            BAR_LEVEL > NS_MAIN_MENU,
            "the bar lives inside the menu bar"
        );

        /*
         * The picker has to outrank the band, or it goes wherever the band
         * goes. Measured with a fullscreen app in front: at band level neither
         * the bar nor the picker appeared and ⌘⇧K did nothing, which is the
         * whole product missing for anybody who works fullscreen.
         */
        assert!(
            PICKER_LEVEL > BAR_LEVEL,
            "the picker must survive fullscreen"
        );
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
    fn the_bar_floats_clear_of_every_edge() {
        /*
         * This used to assert the opposite: that the window fitted inside a 24
         * point menu bar, because the bar lived in it. It does not any more. It
         * hangs a centimetre down, touching nothing, which is the difference
         * between system chrome and the app's own object.
         *
         * What has to hold now is that the window leaves room around the bar it
         * draws. The glow and the shadow are painted outside the pill's box and
         * clipped at the window edge, so without margin on every side they cut
         * off square.
         */
        assert!(BAR.0 < COLLAPSED.0, "no room for the glow at the sides");
        assert!(BAR.1 < COLLAPSED.1, "no room for the glow above and below");
        assert!(
            (COLLAPSED.1 - BAR.1) / 2.0 >= 12.0,
            "a shadow needs more than a few points to fall into"
        );
        // And it is genuinely off the top rather than nearly touching it.
        assert!(FLOAT_GAP >= 20.0, "that is not floating, that is a margin");
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
        assert!(
            COLLAPSED.1 < EXPANDED.1,
            "the lip is the smaller of the two"
        );
    }
}
