# Nerdbase scan guidance: strict spec for the Xcode agent

Visual reference: `assets/prototype/gallery.html` (open in a browser, tap the "Scan: live guide" phone to step through the states). It is a static HTML mock, not shipped code. Build it natively in SwiftUI. This file extends `PRD.md` Section 8.1 and `XCODE_PROMPT_CORE_LOOP.md`.

All thresholds below are **starting guesses, not verified**. Put them in `Tuning.swift` under `Tuning.Scan` and tune on a real device with real homework.

## Goal
The user should never wonder what to do. Guidance text, frame color and shutter state always say the next action. Capture happens only when the image is good enough to solve.

## Camera stack
`AVCaptureSession` (photo preset) in a `UIViewRepresentable` preview, `AVCapturePhotoOutput` for capture, `Vision` for page detection, `CoreMotion` for tilt. Use `VNDocumentCameraViewController` only as a fallback if the custom camera is denied or fails. Pre-prompt screen before the system camera permission prompt (PRD onboarding screen 6). If denied, show a settings deep link and a photo library option.

## Live analysis (runs on every Nth video frame, about 8 per second, off the main thread)
1. **Page found:** `VNDetectRectanglesRequest` (min aspect 0.3, max 1.0, min confidence 0.6). Score = rectangle area / frame area.
2. **Distance:** rectangle area in the guide frame. Too small means "come closer", too large (clipped by frame edges) means "move back".
3. **Sharpness:** variance of Laplacian on a downscaled luma crop of the guide frame (Accelerate/vImage). Below threshold means "hold still".
4. **Tilt:** `CMMotionManager` device motion, pitch relative to flat-over-paper (about 90 degrees from vertical when held flat). Tolerance 10 degrees.
5. **Light:** mean luma of the crop. Too dark suggests the flash button pulse.
6. **Steadiness:** gyro magnitude over the last 400 ms.

## States (exact copy, Swedish first, English in the string catalog)
| State | Condition | Hint pill | Frame corners | Shutter |
|---|---|---|---|---|
| aim | page not found or tilt off | "Håll telefonen rakt över sidan" | white | ring only |
| close | page found, too small | "Kom lite närmare" | amber | ring only |
| far | page clipped | "Backa lite" | amber | ring only |
| dark | luma low | "Mer ljus hjälper" plus flash button pulses | amber | ring only |
| blur | sharpness low | "Håll stilla" | amber | ring only |
| hold | all checks pass | "Bra. Håll stilla" | green, laser sweep | green with pulse ring |
| capturing | auto capture fires after 0.6 s of continuous `hold` | none | green flash | haptic |
| solving | image sent | "Läser uppgiften…" then skeleton screen | green | hidden |

Rules:
- Tilt indicator: a horizontal bar with a dot; dot turns green inside tolerance.
- Step chips "1 Rikta, 2 Fånga, 3 Lös" show progress: aim/close/far/dark/blur = step 1, hold/capturing = step 2, solving = step 3.
- **Auto capture** after 0.6 s of `hold`, plus the manual shutter always works. A setting "Auto capture" (default on) can disable it.
- Hint text changes at most once per 500 ms (debounce) so it never flickers. Announce hint changes to VoiceOver.
- Haptics: `.selection` when entering `hold`, `.success` on capture, `.warning` on a failed solve. Respect the Haptics setting.
- Reduce Motion: no laser sweep, no pulse ring; use static green corners.

## After capture
1. Crop to the page rectangle with perspective correction (`CIPerspectiveCorrection`), then show the crop with 4 draggable corner handles for 0.8 s before sending (user can adjust, "Skicka" confirms; auto-sends if untouched).
2. Downscale to 1600 px long edge, JPEG quality 0.8, send to the scan proxy (PRD Section 5). No API key in the app.
3. Show the solving screen: captured image with a laser sweep, "Löser steg för steg…", shimmer skeleton, first tokens stream into the result sheet.
4. Result sheet (detents medium and large): subject tag, answer card, steps list, "Vanligt misstag" callout, buttons "Spara" and "Öva liknande". "Spara" adds the problem to the spaced repetition deck.
5. Free limit: counter "2 skanningar kvar idag" at the bottom of the camera screen. At 0 show the out-of-scans sheet (same pattern as the out-of-lessons sheet in the core loop file).

## Failure states (all need designed screens, never a raw error)
- No problem found after 6 s: "Vi hittar ingen uppgift. Prova närmare eller bättre ljus." with Retry.
- Network error: keep the image, "Ingen uppkoppling. Vi försöker igen när du är online." and a queued retry.
- Server error or timeout (20 s): "Något gick fel. Försök igen." with Retry, no scan consumed.
- Content not homework: "Det här ser inte ut som en uppgift." with Retry.
A failed scan never counts against the daily limit.

## Tests
- Unit: state machine (`ScanGuidanceEngine`) with injected metrics: every table row reachable, debounce works, auto capture needs 0.6 s continuous hold and resets on any break.
- Unit: limit counter (failed scans do not count).
- Manual on device: 10 real homework photos in dim, bright, tilted and shaky conditions; record hit rate of `hold` within 3 s. Target is unknown until measured; write the result in `DECISIONS.md`.
