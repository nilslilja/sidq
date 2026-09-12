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
    use objc2::{MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{NSColor, NSGlassEffectView, NSGlassEffectViewStyle, NSWindow};
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
         * Already glazed. Only the radius can have changed — the pill has two
         * sizes and they do not have the same corner — so that is set and
         * nothing is rebuilt. Rebuilding would mean detaching the webview from
         * the window and putting it back, which is a flicker at best.
         */
        let content = match content.downcast::<NSGlassEffectView>() {
            Ok(glass) => {
                glass.setCornerRadius(radius);
                glass.setStyle(style(clear));
                return;
            }
            // Not glass, so it is the webview and this is the first call. The
            // downcast hands it back rather than consuming it.
            Err(content) => content,
        };

        let frame: NSRect = content.frame();
        let glass = unsafe { NSGlassEffectView::initWithFrame(NSGlassEffectView::alloc(mtm), frame) };

        glass.setStyle(style(clear));
        glass.setCornerRadius(radius);
        unsafe {
            glass.setTintColor(Some(&NSColor::colorWithSRGBRed_green_blue_alpha(
                TINT.0, TINT.1, TINT.2, TINT.3,
            )));
        }

        /*
         * Swapped in, then the old content put inside it.
         *
         * The order matters. Setting the glass as the window's content view
         * first removes the webview from the window, which is what makes it
         * free to be added as the glass's own content — doing it the other way
         * round adds a view that still has a superview and AppKit moves it back.
         *
         * `contentView` and not `addSubview`: Apple's own note on this class is
         * that only the content view is guaranteed to be inside the glass, and
         * an arbitrary subview has no promised z-order against the effect.
         */
        window.setContentView(Some(&glass));
        glass.setContentView(Some(&content));
    }
}

#[cfg(target_os = "macos")]
pub use imp::{apply, available};
