# Nerdbase assets

- `icon/AppIcon-1024.png`: App Store / app icon, 1024 x 1024, opaque, no rounded corners (iOS applies the mask). Source: `icon/icon.svg`.
- `screenshots/1.png` to `5.png`: App Store screenshots, 1290 x 2796 px (6.7 inch class). Swedish. Confirm the accepted sizes in App Store Connect before upload `[VERIFY]`.
- `prototype/gallery.html`: all screens as a static visual spec. Open in a browser. `gallery-preview.png` is a snapshot.
- `prototype/screens.js`, `screens.css`, `shots.html`, `render.mjs`: source. Re-render with `node prototype/render.mjs <path to this folder>` (needs Playwright with Chromium).

Not shipped code. The real app is SwiftUI, built from `PRD.md`, `XCODE_PROMPT_CORE_LOOP.md` and `SCAN_UX_SPEC.md`.
Screenshots use Inter instead of SF Pro and a simulated device frame; replace with real simulator captures once the app builds.
The founder story screen in the gallery shows the 1,8 and B claims. Do not use it in any store asset until the proof documents are on file.
