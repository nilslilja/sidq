//! The pill, made of Apple's own glass.
//!
//! Everything the pill was made of before this was CSS: `backdrop-filter:
//! blur(26px) saturate(180%)` and a hand-painted rim. That is a frost, and a
//! frost is not what the bar is supposed to be. Glass bends what is behind it.
//!
//! ── Why this cannot be done in the webview ───────────────────────────────────
//! `backdrop-filter` cannot displace pixels. It can blur them, saturate them
//! and tint them, and no combination of those refracts anything. The only CSS
//! route to real refraction is an SVG `feDisplacementMap` used as
//! `backdrop-filter: url(...)`, which Chrome supports and WebKit does not — and
//! the pill is a WKWebView, so that route is closed permanently rather than
//! until some version lands.
//!
//! It is also the wrong place to spend the frames. A `backdrop-filter` under a
//! transform-animated ancestor is recomputed every frame, which is exactly the
//! cost that had to be stripped out of the landing page film. The OS draws this
//! outside the webview entirely, so the webview goes from compositing a blur
//! per frame to compositing nothing.
//!
//! ── What this is ────────────────────────────────────────────────────────────
//! `NSGlassEffectView` is the view behind Liquid Glass. The window's own
//! content view is put *inside* it, so the webview draws on the glass rather
//! than over it, and the glass samples what is behind the window.
//!
//! ── macOS 26 or nothing ─────────────────────────────────────────────────────
//! The class does not exist before macOS 26. `extern_class!` bindings do not
//! check: sending `alloc` to a class the runtime has never heard of is a
//! message to nil, and building a view out of that is how an app that launches
//! fine on the machine it was written on fails to launch anywhere else. So the
//! class is looked up by name first and everything here is skipped when it is
//! absent. Earlier releases keep the CSS, which is what they have always had.

#[cfg(target_os = "macos")]
mod imp {
    use objc2::runtime::AnyClass;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use objc2::rc::Retained;
    use objc2::{MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{
        NSAutoresizingMaskOptions, NSColor, NSGlassEffectView, NSGlassEffectViewStyle, NSView,
        NSWindow, NSWindowOrderingMode,
    };
    use objc2_foundation::NSRect;

    /**
     * The tone, matching `--color-lilac` and `.row-glass-on` in global.css.
     *
     * Low alpha on purpose. `tintColor` on a glass view colours the material
     * itself rather than painting over it, so a value that looks right as a fill
     * reads as a plastic lozenge here. This is the tint the panel already
     * carries at a tenth of the strength.
     */
    const TINT: (f64, f64, f64, f64) = (0.722, 0.651, 1.0, 0.10);

    /**
     * Which of the two materials, and why it is not the same for both sizes.
     *
     * Apple's own rule, and it was learned here the hard way. `Clear` carries
     * almost no opacity of its own: it is for glass over media, where the point
     * is to see through. The collapsed bar is 112 by 24 points holding a mark
     * and a number, so Clear is exactly right and it looks like a bead of glass
     * on the desktop.
     *
     * The picker is 560 by 380 and full of small text. Clear made it
     * *unreadable* — a headline in the window behind it came straight through
     * and collided with the conversation titles, which is the whole reason the
     * CSS had a 72% fill before any of this. `Regular` is the material for
     * chrome that sits over content and carries enough opacity to be a surface,
     * which is what a list of things to read has to be.
     */
    fn style(clear: bool) -> NSGlassEffectViewStyle {
        if clear {
            NSGlassEffectViewStyle::Clear
        } else {
            NSGlassEffectViewStyle::Regular
        }
    }

    /// Whether this Mac has Liquid Glass at all.
    ///
    /// Asked by name rather than by version number. A version check has to be
    /// kept in step with whatever Apple does next; the class either answers or
    /// it does not.
    pub fn available() -> bool {
        AnyClass::get(c"NSGlassEffectView").is_some()
    }

    /**
     * Put the window's content inside a pane of glass.
     *
     * Idempotent: calling it twice leaves one glass view, not two nested ones,
     * because the pill is applied to on setup and again whenever it changes
     * size and a second wrapper would double the material.
     *
     * `radius` is in points and has to match what the page draws, or the glass
     * corners and the CSS corners disagree by a pixel or two and the edge reads
     * as a rendering fault.
     */
    pub fn apply(window: &NSWindow, radius: f64, clear: bool, mtm: MainThreadMarker) {
        if !available() {
            return;
        }

        let Some(content) = (unsafe { window.contentView() }) else {
            return;
        };

        /*
         * Already made. Shown again rather than rebuilt.
         *
         * `remove` hides it rather than detaching it, so the view outlives
         * every collapse and only its shape and material can have changed.
         */
        if let Some(glass) = installed() {
            glass.setCornerRadius(radius);
            glass.setStyle(style(clear));
            glass.setHidden(false);
            return;
        }

        let glass =
            NSGlassEffectView::initWithFrame(NSGlassEffectView::alloc(mtm), content.bounds());
        glass.setStyle(style(clear));
        glass.setCornerRadius(radius);
        unsafe {
            glass.setTintColor(Some(&NSColor::colorWithSRGBRed_green_blue_alpha(
                TINT.0, TINT.1, TINT.2, TINT.3,
            )));
            glass.setAutoresizingMask(
                NSAutoresizingMaskOptions::ViewWidthSizable
                    | NSAutoresizingMaskOptions::ViewHeightSizable,
            );

            /*
             * ── A sibling behind the webview, never a parent of it ───────────
             *
             * The first version made the glass the window's content view and
             * put the webview inside it, which is what `NSGlassEffectView` is
             * documented for. It rendered beautifully and it crashed:
             *
             *   Terminating app due to uncaught exception 'NSRangeException',
             *   reason: 'Cannot remove an observer <WKWindowVisibilityObserver>
             *   for the key path "contentLayoutRect" from <SidqPanel> because
             *   it is not registered as an observer.'
             *
             * A WKWebView registers KVO against its window, and moving it
             * between content views breaks the pairing badly enough that WebKit
             * takes the process down when it later tries to unregister. So the
             * webview does not move at all. The glass is inserted underneath it
             * as a sibling and removed the same way, and nothing WebKit is
             * holding on to is ever touched.
             *
             * This is also how `window-vibrancy` inserts an NSVisualEffectView,
             * which is a good sign that it is the shape AppKit expects.
             */
            content.addSubview_positioned_relativeTo(&glass, NSWindowOrderingMode::Below, None);
        }

        // Held by the content view from here on, so the address stays good.
        GLASS.store(Retained::as_ptr(&glass) as usize, Ordering::Relaxed);

        window.invalidateShadow();
    }

    /**
     * Take the glass back off.
     *
     * ── Why anything would ever want this ───────────────────────────────────
     * Because glass behind the webview stops `backdrop-filter` working inside
     * it: the webview's backdrop becomes the glass rather than the desktop, so
     * a CSS blur has nothing left to sample and quietly produces none.
     *
     * That is right for the bar and wrong for the picker, and the difference
     * was only visible by looking. The bar is 112 by 24 points holding a mark
     * and a number: native glass is the whole charm of it and there is no small
     * text to protect. The picker is 560 by 380 of conversation titles over
     * whatever is on the desktop, and `blur(44px)` destroys a display-size
     * headline behind it in a way `NSGlassEffectView` does not come close to.
     * Its blur is far gentler, it has no radius to turn up, and no tint that
     * still looked like glass made up the difference: 0.55 and 0.68 both
     * ghosted a headline straight through the first row of the list.
     *
     * So the two sizes get different materials, and this puts the picker back
     * on the one that can carry reading.
     */
    pub fn remove(window: &NSWindow) {
        /*
         * Hidden, not detached.
         *
         * Removing it from its superview would drop the last strong reference
         * and leave `GLASS` pointing at freed memory. Hiding costs one message
         * and keeps the pointer meaning what it says.
         */
        if let Some(glass) = installed() {
            glass.setHidden(true);
        }

        /*
         * ── And tell the window server the shape changed ────────────────────
         *
         * A transparent window's shadow is derived from the pixels it actually
         * draws, and macOS caches that. Hiding the glass leaves the shadow it
         * computed while the glass filled the window, which draws as a second
         * rounded rectangle a few points outside the picker's own edge: the
         * panel is inset from the window by its `mx-2`, so the stale outline
         * sits in the gap and reads as a rendering fault.
         */
        window.invalidateShadow();
    }

    /**
     * The glass view, once it exists.
     *
     * ── Why a pointer and not a search ──────────────────────────────────────
     * This was `content.subviews().iter().find_map(downcast_ref)`, and that
     * aborted the process the first time it ran. It never ran at startup, only
     * on the first ⌘⇧K, which is inside `global_hotkey`'s `extern "C"` handler
     * where a panic cannot unwind and becomes an abort with the original
     * message swallowed:
     *
     *   thread 'main' panicked at panic_cannot_unwind
     *   thread caused non-unwinding panic. aborting.
     *
     * Proved it was this and not something older by running the same build
     * with the glass switched off, which toggles happily.
     *
     * `window-vibrancy` does not downcast either: it declares a subclass
     * carrying a tag so it can find its own view again. Same conclusion by a
     * different route. There is one pill window for the life of the app, so
     * one pointer answers the question with no search, no downcast, and no
     * objc2 machinery on a path that cannot report a failure.
     *
     * The view is owned by its superview for as long as it is installed, and
     * this is only ever read on the main thread.
     */
    static GLASS: AtomicUsize = AtomicUsize::new(0);

    fn installed() -> Option<&'static NSGlassEffectView> {
        let address = GLASS.load(Ordering::Relaxed);
        if address == 0 {
            return None;
        }
        // SAFETY: written only by `apply` below, from the pointer AppKit gave
        // it, and the view is retained by the content view it was added to.
        Some(unsafe { &*(address as *const NSGlassEffectView) })
    }
}

#[cfg(target_os = "macos")]
pub use imp::{apply, available, remove};
