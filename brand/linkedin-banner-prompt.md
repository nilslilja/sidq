# LinkedIn banner — prompt for ChatGPT

Upload **`sidq-mark-white-square.png`** with this prompt (the white mark on a
transparent background — it composites onto any dark field without a halo).

---

## The prompt

> I'm attaching a logo mark on a transparent background. Create a LinkedIn
> personal banner using it.
>
> **Canvas:** 1584 × 396 pixels, exactly. No border, no frame, no rounded
> corners — LinkedIn crops the edges and overlays a circular profile photo on
> the lower left, so keep the left 350px clear of anything important.
>
> **Background:** a dawn sky gradient, running top to bottom — deep indigo
> `#33325F` at the top, through a muted violet `#514E86`, into a warm dusty rose
> `#B08FA0`, then a soft apricot `#D9A88E`, finishing in a pale cream `#F3D3B0`
> at the very bottom. Smooth, no visible banding, no seams. Think the twenty
> minutes before sunrise, not a saturated sunset.
>
> **Composition:** place the supplied logo mark centred horizontally, sitting in
> the upper-middle of the canvas where the background is still dark. Render it in
> pure white. Keep it at about 200px wide — small and confident, not filling the
> space.
>
> **Text, directly under the mark:**
> - Wordmark: **Sidq** — white, geometric sans-serif, medium weight, tight
>   letter-spacing, roughly 44px
> - Beneath it: **One clear day, every morning.** — white at about 70% opacity,
>   same typeface, regular weight, roughly 20px, generous letter-spacing
>
> Both centred. Comfortable space between the mark, the wordmark and the line.
>
> **Style rules:**
> - Flat and clean. No 3D, no bevel, no drop shadow, no glow, no lens flare
> - No stock photography, no people, no desks, no laptops
> - No extra icons, badges, decorative shapes, stars, sparkles or particles
> - Do not redraw, restyle or reinterpret the logo — use the supplied file as-is
> - Do not add any text I have not asked for
> - Nothing in the lower-left 350 × 200px region
>
> Output at 1584 × 396, PNG.

---

## Why these choices

**The dawn gradient** is the same one on the landing page hero. A banner that
matches the site is worth more than a banner that looks good on its own, because
the point is that someone recognises the second surface from the first.

**The left 350px stays empty** because LinkedIn overlays the profile photo there
on desktop and clips further on mobile. Centred content survives both.

**No people, no desks.** Every founder banner has a laptop on it. A flat field
with one mark is louder in a feed precisely because nothing else is.

**Don't let it redraw the logo.** Image models will happily "improve" a supplied
mark into something similar but wrong. Saying so explicitly usually holds; check
the output against `sidq-mark-white-square.png` before using it, and if it has
been altered, ask it to composite the original file unchanged instead.

## If the output is not usable

Image models are unreliable at exact canvas sizes and at leaving text alone. If
it keeps failing, the fallback that always works: ask it for **the background
gradient only** at 1584 × 396, with no text and no logo. Then drop the mark and
the two lines on top yourself in any tool — the composition is three centred
elements and takes about two minutes.

## Files

| File | Use |
| --- | --- |
| `sidq-mark.svg` | Master. Vector, indigo, transparent. Scales to anything. |
| `sidq-mark-white-square.png` | **Send this one to ChatGPT.** White, transparent, 2048px. |
| `sidq-mark-square.png` | Indigo on transparent, for light surfaces. |
| `sidq-mark-on-ink.png` | White on dark ink. Social avatar. |
| `sidq-mark-on-paper.png` | Indigo on paper. Light-background avatar. |
| `sidq-icon.svg` / `.png` | Rounded-square app icon, as it appears in the Dock. |

Colours: indigo `#4F46E5`, ink `#12121A`, paper `#F7F6F3`.
