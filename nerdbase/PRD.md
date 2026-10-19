# Nerdbase: Product Requirements Document (iOS MVP)

Owner: Nils (solo founder, Stockholm)
Build agent: Claude in Xcode
Platform: iPhone only, iOS 17+, SwiftUI, fully native
Status: v1.0, ready to build in staged passes (Section 16)

How to use this file: paste it into the Xcode agent as the project spec, then run the passes in Section 16 one at a time. Every item marked `[VERIFY]` is a fact I could not confirm in research. Do not ship a marketing claim marked `[VERIFY]` until it is confirmed.

---

## 0. Founder story (hero content, appears in onboarding screen 2 and in App Store screenshots)

Nils got a **1.8 on Högskoleprovet** after studying **2 days** before the test. He got a **B** in an entire gymnasium course after **2 days** of studying before the exam.

He did not cram for 14 hours. He studied **3 hours per day** in **25 minute focus blocks with 7 minute breaks**, and used the breaks for something he genuinely enjoys. He found real interest in the material first. Nerdbase turns that into a product: become a hyper responder, someone who learns fast because the learning loop is short, rewarding and tied to what they care about.

Proof rule (hard requirement): the 1.8 and the B must be backed by documents. Nils attaches the provresultat and the grade record in Xcode assets as `Proof/` (not bundled in the shipped app, used only for App Store review notes and for the "Verified" badge). If proof is missing, the founder card text falls back to "Built by a student who did it" with no numbers.

Honest framing for copy: "Nils studied 2 days and got 1.8" is an n of 1 story. Never write "guaranteed", "you will get", or imply the result is typical. Use "This is how I did it."

---

## 1. Product summary

**Name:** Nerdbase (Swedish-feeling, short, memorable). Domain, trademark and App Store name availability: unknown, check App Store Connect and PRV (Swedish Patent and Registration Office) before submission.

**One line:** Scan any homework problem, get it solved and explained in seconds, then train the method that makes you learn fast.

**Core promise:** fast as hell, easy as hell, genuinely fun.

**Users:** gymnasium students (16 to 19) and adults retaking Högskoleprovet. Both.

**Subjects at launch:** Matematik 1c to 5 (focus on advanced: 4, 5), Fysik 1 and 2, Engelska 5 to 7, Högskoleprovet (Verbal and Kvantitativ). Content built from original material and officially published tests (see Section 9).

**Languages:** Swedish and English. Language is chosen automatically from the device (see Section 6.2). User can override in Settings.

**Business model:** freemium. Everything is unlocked but heavily limited on free. Two paid plans. No free trial.

---

## 2. Research basis (what we can honestly claim)

| Claim | Evidence | Status |
|---|---|---|
| Practice testing and distributed practice are the two most effective common study techniques | Dunlosky et al. 2013, "Improving Students' Learning With Effective Learning Techniques", rated highest utility. Summarised by [APS](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html) | Verified |
| Highlighting and rereading are low utility | Same review | Verified |
| Meta-analysis of the same ten techniques: 242 studies, mean effect 0.56, distributed practice and practice testing on top | [Frontiers in Education 2021](https://www.frontiersin.org/articles/10.3389/feduc.2021.581216/full) | Verified. Caveat from the authors: most studies measured surface or factual outcomes |
| 25 minute focus blocks with 5 to 7 minute breaks improve learning | Pomodoro is popular but I found no direct evidence in research | `[VERIFY]`. Position it as "Nils' routine", not as science |
| HP Kvantitativ section: 40 items, 55 minutes. XYZ 12, KVA 10, NOG 6, DTK 12 | Official provpass PDFs on [studera.nu](https://www.studera.nu/globalassets/hogskoleprovet/hp-2022-05-07/provpass-1-kvant.pdf) and [allakando.se](https://allakando.se/wp-content/uploads/2024/10/provpass-1-kvant-2024-10-20.pdf) | Verified |
| HP Verbal section structure (ORD, LÄS, MEK, ELF), counts, times, and the 0.0 to 2.0 normering | Not confirmed in research | `[VERIFY]` on studera.nu / UHR before hardcoding |
| Reuse terms for old official tests | Not found. Old tests are public on studera.nu, but commercial reuse terms are unknown | `[VERIFY]` with UHR before bundling any official test text. Until confirmed, link out to studera.nu and use original practice items |
| Annual subscribers: about 30% cancel in the first month | [RevenueCat State of Subscription Apps 2025 coverage](https://subscriptioninsider.com/article-type/news/revenuecats-state-of-subscription-apps-2025-report-ais-dominance-retention-challenges-and-the-shift-away-from-pure-subscriptions) | Verified (secondary source) |
| Longer trials convert better on annual plans (24% for 4 days or less, 44.6% for 17 to 32 days) | [SaaStr analysis of RevenueCat data](https://saastr.com/what-17000-subscription-apps-tell-us-about-free-trial-length-annual-plans-convert-86-better-with-30-day-trials-monthly-tops-out-at-two-weeks-and-ai-apps-hit-a-wall-at-16-days) | Verified (secondary source). Relevant because Nils chose no trial |

### What this means for the product

1. The core learning loop is **retrieval practice plus spacing**, not reading explanations. Scanning gives the answer fast, then Nerdbase immediately turns the problem into a quiz item that comes back later.
2. The "hyper responder" method (Section 3) is Nils' routine wrapped around evidence-backed techniques. Label which parts are evidence-backed and which are personal.
3. No trial plus a high price means the free tier must prove value in the first session. See Section 7.

---

## 3. The Nerd Method (hyper responder system)

This is the content that makes the subscription worth paying for. It is a guided program, not an article.

**Principle:** you learn fast when it is interesting, short, tested often, and rewarded.

### 3.1 The five rules
1. **Hook first.** Before any subject, the user picks 3 interests (football, gaming, music, space, cars, cooking, fashion, finance, etc.). Word problems, physics examples and English reading are themed to these. Rationale: Nils found interest in the material first.
2. **25 / 7 blocks.** Focus 25 minutes, break 7. Built-in timer (Section 8.5). The 7 minute break prompts something enjoyable, chosen by the user in onboarding. Show it as "Nils' routine".
3. **Test, don't reread.** Every session is at least 70% questions the user answers from memory (Dunlosky: practice testing).
4. **Space it.** Wrong answers return after 1 day, 3 days, 7 days, 14 days (simple Leitner schedule, Section 8.4).
5. **Error log.** Every mistake is stored with a one line reason ("sign error", "didn't know formula", "misread"). Weekly view shows the user's top error type. This is the fastest way to raise a score and is the "trick" beyond Nils' routine.

### 3.2 The 3 hour day (default plan)
Six blocks of 25 minutes with 7 minute breaks is about 3 hours. Plan template:
- Blocks 1 to 2: hardest subject while fresh, retrieval only.
- Block 3: new material with a scan-and-solve session.
- Block 4: error log review (spaced items due today).
- Block 5: mixed set (interleaving, topics shuffled).
- Block 6: timed mini-test, scored.
The user can choose 1, 2, 4 or 6 blocks per day. Default for onboarding: 4.

### 3.3 Two day sprint mode (the founder story)
Pre-built plan "Nils' 2 day sprint" for a test or exam in 48 hours: Day 1 diagnose and fix top errors, Day 2 timed mixed practice and error review. Label clearly: "This is how I did it. Results vary." Premium feature.

---

## 4. Scope of the MVP

You asked for a finished product. Scope is **everything below, in staged passes**, because a single prompt that generates all of it will fail in places.

In scope:
1. Opening screen: native globe plus auto-opening animated folder (Section 6).
2. Full onboarding (9 screens, Section 6.3).
3. Paywall with two plans (Section 7).
4. Home shell with tabs: Learn, Scan, Plan, Profile.
5. Working scan (camera to explained solution, Section 8.1).
6. Practice loop with haptics, XP, streak, error log, spaced repetition (Section 8.2 to 8.4).
7. 25/7 focus timer (Section 8.5).
8. Free versus Pro gating through RevenueCat (Section 7).
9. Settings: language, notifications, restore purchases, privacy, terms, delete account/data.

Out of scope for MVP: social features, leaderboards, Android, iPad layouts beyond not breaking, teacher dashboards, offline AI.

---

## 5. Technical architecture

- **Language/UI:** Swift 5.9+, SwiftUI, iOS 17 minimum. iPhone only (`TARGETED_DEVICE_FAMILY = 1`).
- **State/persistence:** SwiftData for local data (problems, attempts, error log, schedule). No backend account system in MVP.
- **Auth:** Sign in with Apple only. Used to link a RevenueCat app user ID and to key the scan proxy.
- **Payments:** RevenueCat SDK (`purchases-ios`). Entitlement id: `pro`. Offering id: `default`. Products below.
- **AI for scans:** the app never holds an API key. Scans go to a thin proxy (one serverless function, Supabase Edge Function or Cloudflare Worker) that calls the Claude vision API and returns structured JSON. The proxy checks the Apple sign in token, enforces per-user limits (free vs Pro) and rate limits.
  - Request: JPEG (max 1600 px long edge, compressed) plus locale and subject hint.
  - Response (streamed): `{ subject, problem_text_latex, steps: [{title, latex, explanation}], final_answer, common_mistake, similar_problem: {...} }`.
  - Image retention: do not store images server-side. Delete after response. State this in the privacy policy.
- **Math rendering:** `SwiftMath` (SPM) for LaTeX in native views. No WebView.
- **Camera:** `VNDocumentCameraViewController` (VisionKit) for edges and perspective correction, with a custom shutter option for single problem crops. Pre-explain camera permission.
- **Globe:** SceneKit sphere rendered in `UIViewRepresentable`/`SceneView` (Section 6.1). No web view.
- **Haptics:** `.sensoryFeedback` (iOS 17) for simple cases and `CoreHaptics` for custom patterns.
- **Sound:** short bundled `.caf` files via `AVAudioPlayer`, respecting the silent switch (`AVAudioSession.ambient`).
- **Notifications:** local only (`UNUserNotificationCenter`) for daily block reminders and spaced repetition due items.
- **Analytics:** PostHog or TelemetryDeck (privacy friendly). Events listed in Section 14. Choose TelemetryDeck by default (no consent banner needed in most setups, `[VERIFY]` with GDPR guidance).
- **Dependencies (SPM):** `purchases-ios`, `SwiftMath`. Keep the list short.
- **Project layout:**

```
Nerdbase/
  App/NerdbaseApp.swift, AppState.swift
  DesignSystem/ Colors.swift, Typography.swift, Components/, Haptics.swift, Sound.swift
  Features/
    Opener/ GlobeView.swift, AnimatedFolderView.swift, OpenerScreen.swift
    Onboarding/ OnboardingFlow.swift, screens...
    Paywall/ PaywallView.swift, PurchaseManager.swift
    Home/ HomeTabs.swift, Learn/, Scan/, Plan/, Profile/
    Practice/ QuestionCard.swift, Session.swift, SpacedRepetition.swift
    Timer/ FocusTimer.swift
  Data/ Models (SwiftData), Repositories, ScanService.swift
  Resources/ Localizable.xcstrings (sv, en), Sounds/, land-dots.json, Content/*.json
  Tests/
```

- **Localization:** String Catalog (`Localizable.xcstrings`) with `sv` and `en`. Every user visible string goes through it. No hardcoded text.
- **Accessibility:** Dynamic Type, VoiceOver labels on every control, Reduce Motion alternative for all animations (replace the globe spin and floating icons with static versions), 4.5:1 contrast.

---

## 6. Design

### 6.0 Design language
Reference quality bar: Klarna's iOS app. Soft, confident, big rounded type, generous whitespace, one memorable color moment, buttery spring animations. **Do not copy Klarna's brand** (pink, logo, wordmark). Own palette below.

**Palette (light):**
- Background `#FBF8F4` (warm paper)
- Surface `#FFFFFF`
- Ink `#14110F`
- Muted text `#6F6A64`
- Accent (brand) `#FB6415` (the orange from the globe marker reference), soft tint `#FFE9DC`
- Success `#22A06B`, Error `#E5484D`

**Palette (dark):** Background `#0F0D0C`, Surface `#1A1715`, Ink `#F6F1EB`, same accent.

**Type:** SF Pro Rounded for display (`.fontDesign(.rounded)`), SF Pro for body. Hero title 40 to 48 pt bold, body 17 pt.

**Shape:** 24 pt corner radius on cards, 18 pt on buttons, continuous corners (`RoundedRectangle(cornerRadius:style:.continuous)`).

**Motion:** springs everywhere. Default `Animation.spring(response: 0.5, dampingFraction: 0.7)`. Overshoot spring for "pop" moments: `spring(response: 0.5, dampingFraction: 0.62)`.

**Haptics map:**
- Button tap: `.impact(flexibility: .soft)`
- Selection (chips, options): `.selection`
- Correct answer: `.success`
- Wrong answer: `.warning`
- Streak or XP milestone: custom CoreHaptics pattern (two soft taps then a rise)
- Paywall purchase success: `.success` plus confetti

**Sound:** 5 tiny sounds under 400 ms each: pop (tap), whoosh (screen transition), ding (correct), thud (wrong, gentle), sparkle (milestone). Generate or source royalty free (record licence in `Resources/Sounds/LICENSES.md`). Volume low. Off if silent switch is on.

**App icon:** simple, a rounded "N" or a folded notebook in the orange on warm paper. Provide 1024 px, no transparency, no text other than the glyph.

### 6.1 Opening screen (the hero)

Goal: the first 3 seconds should feel expensive.

**Layout (top to bottom):**
1. A globe filling the upper 55% of the screen, cropped by the screen edge at the bottom of its container, rotating slowly. Behind it a soft radial warm glow at the bottom.
2. Wordmark "Nerdbase" in the gradient-fade style (ink to transparent), overlapping the globe's top part, like the reference demo.
3. Floating little icons rising upward continuously (see below).
4. Below the globe: the animated folder (see below), centered, with three cards that pop out on a loop.
5. Headline: "Learn like you cheated." `[VERIFY brand voice with Nils]` Alternative: "Scan it. Get it. Keep it." Subhead: "Scan any homework. Get it explained in seconds."
6. Primary button "Kom igång" / "Get started" (full width, 56 pt tall, accent). Secondary text button "Jag har redan ett konto" / "I already have an account" (Sign in with Apple).

**Globe (native port of the cobe reference):**
Reference config to reproduce: `phi` auto-increments by 0.005 per frame, `theta 0.3`, `dark 0` (light mode), `diffuse 0.4`, `mapSamples 16000` (dots), `mapBrightness 1.2`, base color white, marker color `rgb(251,100,21)`, glow white. Ten markers at these lat/long (size): (14.5995, 120.9842, 0.03), (19.076, 72.8777, 0.1), (23.8103, 90.4125, 0.05), (30.0444, 31.2357, 0.07), (39.9042, 116.4074, 0.08), (-23.5505, -46.6333, 0.1), (19.4326, -99.1332, 0.1), (40.7128, -74.006, 0.1), (34.6937, 135.5022, 0.05), (41.0082, 28.9784, 0.06). Add Stockholm (59.3293, 18.0686, 0.1) as the largest, pulsing marker.

Implementation:
- Generate `land-dots.json` once with a script (equirectangular land mask sampled to ~16,000 points on a Fibonacci sphere, keep points on land). Commit the script in `Tools/`. Use Natural Earth public domain land data `[VERIFY licence note in the script header]`.
- Render in SceneKit: one `SCNNode` using `SCNGeometry` from the points (point primitive, `pointSize` ~1.6, `minimumPointScreenSpaceRadius` ~0.8) or instanced small spheres. Base sphere is white with subtle lighting (diffuse 0.4 equivalent). Rim glow via a slightly larger transparent sphere with a fresnel-like shader or a SwiftUI radial gradient overlay.
- Markers: small orange spheres with a pulsing ring (scale and opacity loop, 1.8 s).
- Rotation: continuous `rotateBy` on Y at 0.005 rad per frame equivalent (about 0.3 rad/s at 60 fps). Drag to spin with inertia that decays back to auto-rotation. Light haptic tick when a marker crosses the front center (throttled).
- Camera tilt matches `theta 0.3`.
- Performance: must hold 60 fps on iPhone 12. Fall back to 6,000 dots on low power mode. Reduce Motion: static globe, no pulse.
- Fade in over 500 ms when ready.

**Floating icons:** 14 small icons (SF Symbols and simple custom glyphs: book, atom, function `f(x)`, pencil, lightbulb, flask, globe, star, music note, soccer ball, rocket, camera, calculator, brain) in soft tinted circles. Implemented with `TimelineView(.animation)` + `Canvas`. Each icon: random x in the screen width, starts below the bottom, rises at 20 to 45 pt/s, sways horizontally with a sine of ±12 pt, scales 0.8 to 1.1, fades in over the first 15% and out over the last 25%, opacity max 0.8. Density: 10 to 14 on screen. They stay behind the globe/folder and in front of the background. On tap on the background, a nearby icon pops with a tiny pop sound and `.selection` haptic. Continue the effect softly on onboarding screens (lower density, 6).

**Animated folder (native port of the 21st dev reference):**
Rebuild in SwiftUI (`AnimatedFolderView`). Do not use a WebView.

Anatomy (all sizes in points, container 200 x 160):
- Folder back: 128 x 96, corner radius 8, fill `folderBack` (a deeper tone of accent, e.g. `#E85A10`), shadow.
- Tab: 48 x 16, top-rounded, `folderTab`, at the top-left of the back (offset +16 from the back's left, 12 above it).
- Three cards, each 80 x 112, radius 8, image fill with bottom gradient and a 10 pt title. Cards show: "Matte", "Fysik", "Högskoleprovet" (illustrated, soft tinted artwork generated or hand drawn, no stock photos).
- Folder front: 128 x 96, radius 8, `folderFront` (accent), larger shadow, plus a white-to-clear 135° shine overlay.
- Z-order, bottom to top: back/tab, cards, front, shine.

States:
- Closed: cards at translation (0,0), rotation 0, scale 0.5, opacity 0. Back `rotateX 0`, front `rotateX 0`.
- Open: back `rotateX -15°`, tab `rotateX -25°` and `translateY -2`, front and shine `rotateX 25°` and `translateY +8`, all with anchor bottom center and perspective. Cards: translateY -90, translateX [-55, 0, +55], rotation [-12°, 0, +12°], scale 1, opacity 1, staggered by 80 ms each (index × 80 ms).
- Easing: the reference uses `cubic-bezier(0.34, 1.56, 0.64, 1)` over 500 to 600 ms. SwiftUI equivalent: `.spring(response: 0.55, dampingFraction: 0.62)`.

Behavior (this is different from the web demo, which opens on hover):
- **Auto-open loop:** after 1.2 s on screen, open. Hold open 2.6 s. Close with the same spring (cards go back in reverse stagger, last card first). Wait 1.0 s. Repeat forever while the screen is visible. Pause when the app backgrounds or Reduce Motion is on (then show it open and static).
- Soft haptic and "pop" sound each time it opens (first 3 loops only, then silent, so it never annoys).
- Tap a card: expand into a lightbox using `matchedGeometryEffect` (or `navigationTransition(.zoom)` on iOS 18, fallback to matched geometry on 17). Lightbox shows the subject preview card with title, a short line of what you get, and a "Start with this" button. Swipe left/right moves between the three cards. Dots indicator. Close by swipe down or X. Open/close spring `response 0.45, damping 0.85`. Dim and blur the background.
- Title under the folder: "3 subjects" (localised), subtitle "Tap to explore".

### 6.2 Language and region detection
You asked for detection by location. Use **`Locale.current` and `Locale.preferredLanguages`** instead of CoreLocation. Same result for the purpose (Swedish device region/language gives Swedish), no permission prompt, no App Store privacy nutrition label for location, and no onboarding friction.
- If the preferred language starts with `sv`, use Swedish. Otherwise English.
- Region drives the default curriculum (Sweden: Skolverket courses and Högskoleprovet; others: English general content, HP hidden).
- Settings has a language override.
- Only ask for location if a future feature needs it.

### 6.3 Onboarding flow (9 screens)
Progress as a thin segmented bar at the top. Back chevron on every screen after the first. Each screen: one idea, one primary button at the bottom, spring transitions between screens (slide plus fade), whoosh sound, `.selection` haptic on advance. Floating icons continue softly in the background.

0. **Opener** (Section 6.1).
1. **Founder story.** Title "I studied 2 days and got a 1.8." Card with big number animation: "1.8" counts up from 0.0 to 1.8 over 1.2 s with a ticking haptic, then "Högskoleprovet" under it; a second row "B" with "entire course, 2 days". Footer chip "Verified" only if proof asset is present. Body: "No magic. Short focused sessions, real interest, and testing myself. Nerdbase is that, built into an app." Button "Show me how".
2. **Goal.** "What are you here for?" Options (single or multi): Gymnasium grades, Högskoleprovet, Both, Just stuff I'm curious about. Sets the subject filters.
3. **Level and date.** Subjects checklist (Matte 1c, 2c, 3c, 4, 5, Fysik 1, 2, Engelska 5, 6, 7, HP Verbal, HP Kvant). Target (grade or HP score slider 0.0 to 2.0). Test or exam date picker (optional, "No date yet" chip). Current self-rated level chips.
4. **Interests (the hook).** "Pick 3 things you love." Grid of animated chips. Selecting a chip pops with a haptic and sound. These theme examples.
5. **Your rhythm.** "How many 25 minute blocks per day?" 1, 2, 4, 6 (3 hours is highlighted "Nils' routine"). Picks a break reward: music, walk, snack, game, friend, stretch. A looping mini animation shows a 25 then 7 timer.
6. **Try the scan.** A live demo: sample problem image (bundled) scans with an animated laser line, the solution steps stack in with spring animations. Button "Scan my own" triggers a camera permission pre-prompt screen ("Nerdbase only reads what you point at. Photos are deleted after solving.") then the system prompt. "Skip" is allowed.
7. **Reminders.** Pre-prompt screen explaining the benefit, then the system notification prompt. Time picker for daily start time.
8. **Plan reveal.** "Your plan is ready." Animated: weeks left (if date set), blocks per day, first session preview. A loading shimmer for 1.5 s ("Building your plan") before the reveal, to make it feel computed. Then the paywall.
9. **Paywall** (Section 7). Close button visible after 2 s. Closing goes to Home on the free tier.

Sign in with Apple appears at the end of screen 8 (before paywall) as "Save your plan", skippable once, required before the first scan.

---

## 7. Monetization

**Plans:**
| Plan | Price | Product id | Notes |
|---|---|---|---|
| Monthly | $20 / month | `nerdbase_pro_monthly` | |
| Yearly | $144 / year ($12 / month) | `nerdbase_pro_yearly` | 40% cheaper than 12 months at $20 ($240). Savings badge: "Save $96" |

Prices are set in App Store Connect and shown to the user with `StoreProduct.localizedPriceString` from RevenueCat, so Sweden sees SEK automatically. Never hardcode price text. For the "per month" line on yearly, use `pricePerMonth` from the product. Equivalent SEK price tiers: set using Apple's equalized pricing, unknown exact numbers, check in App Store Connect.

**Free tier (everything unlocked but very limited, so it feels real and runs out):**
- 2 scans per day (resets at local midnight)
- 10 practice questions per day
- 1 timed mini-test per week
- Error log: last 7 days
- Nerd Method: rules and 1 sample day, not the full program

**Pro:**
- Unlimited scans and practice
- Full Nerd Method plans, 2 day sprint mode
- All HP timed tests, full error log with weekly insights
- Spaced repetition for all subjects
- Priority speed on scans

**Paywall design (Klarna-grade clean):**
- Top: animated looping mini version of the folder or a floating-icon field, soft.
- Headline: "Unlock Nerdbase Pro". Three benefit rows with icons, one line each.
- Two plan cards side by side or stacked: Yearly pre-selected with "Best value, save $96" ribbon, Monthly below. Selected card has an accent border and a spring scale to 1.02 with `.selection` haptic.
- Primary button: "Continue". Small text under it: price and renewal terms in plain language ("$144 per year. Renews automatically. Cancel anytime in Settings.").
- Links: Restore purchases, Terms, Privacy.
- Success: confetti burst plus `.success` haptic and sparkle sound, then dismiss to Home.
- Because there is no free trial, show a concrete value moment before the paywall (screen 6 scan demo and screen 8 plan reveal). Also add a soft paywall when the free daily limit is hit: "You used today's 2 scans."

**App Store compliance checklist (Guideline 3.1.2 and related):**
- Show price, billing period, and auto-renewal terms clearly on the paywall.
- Restore Purchases button visible.
- Links to Terms of Use (can use Apple standard EULA) and Privacy Policy.
- Paywall must be dismissible.
- Subscription group with both products so users can switch plans.
- Privacy nutrition labels: identifiers (Apple ID token), usage data, photos (processed, not stored).
- Do not use the word "official" for Högskoleprovet content unless it is the real published test. Do not imply endorsement by UHR or Skolverket.
- Reviewer notes must include a demo path to the scan feature (provide a test account or a bundled sample image path) and the founder proof.

**Honest expectations (not verified for edu or Sweden, treat as ranges to test, not forecasts):**
- About 30% of annual subscribers cancel in month one (RevenueCat 2025, secondary source).
- Conversion without a trial is typically lower than with one; the cited data shows longer trials lift annual conversion. Plan to A/B test a 3 day or 7 day trial in week 4 if download-to-paid is under your target. Unknown target. Set one before launch.
- $20 per month is high for a student product. Whether students will pay it is unknown. Test by showing yearly first and measuring paywall conversion by variant (yearly-first versus monthly-first).

---

## 8. Features (post-onboarding)

### 8.1 Scan
- Entry: center tab button, a large circular scan button with a pulsing ring. Long press: scan from photo library.
- Flow: camera (VisionKit) → crop confirmation → "Solving…" state with an animated laser-line pass over the captured image and a streaming placeholder → result sheet.
- Result sheet (bottom sheet, detents medium and large):
  - Problem (rendered LaTeX).
  - Answer highlighted in a card.
  - "Steps" accordion, each step expands with spring.
  - "Common mistake" callout.
  - Buttons: "Try a similar one" (generates a practice item), "Save to my deck" (adds to spaced repetition), "Ask why" (follow up question in a small chat, Pro).
- Speed target: first token visible in under 2 s, full answer under 8 s on a good connection. Show a skeleton immediately.
- Handles: math, physics, English text (grammar and meaning), HP-style questions. Detect subject automatically.
- Failure states: blurry (ask to retake with a hint), no problem found, offline (queue the image and retry), limit reached (paywall sheet), server error (friendly retry).
- Safety: block clearly non homework use is not required, keep scope to study help. Do not store scans server-side.

### 8.2 Learn / practice
- Card-based question session, one question per screen, big tap targets. Types: multiple choice (HP style with 4 or 5 options), numeric input with custom keypad, short text for English.
- Instant feedback: correct → green flash, `.success`, ding, XP count up; wrong → soft shake, `.warning`, thud, then a 2 line explanation card and "Why did I miss this?" chips (sign error, didn't know formula, misread, guessed, ran out of time) feeding the error log.
- Session length options: 5, 10, 25 min (ties to the focus timer).
- Streak: day streak with a flame icon, grace of one missed day per week (freeze). XP and levels, kept simple.
- Content source: Section 9.

### 8.3 Plan tab
- Today's blocks (up to 6 cards with durations), tapping starts a 25/7 session.
- Countdown to the test date if set.
- Weekly insight (Pro): top error type, accuracy trend, time studied.

### 8.4 Spaced repetition
- Leitner boxes with intervals 1, 3, 7, 14, 30 days. Correct moves up a box, wrong moves back to box 1. Daily "Due" count on the Learn tab. Deterministic and testable (unit tests required).

### 8.5 Focus timer
- 25 minute focus, 7 minute break. Large ring timer, springs, a gentle haptic at start, end of focus, and end of break. Live Activity and Dynamic Island for the running timer. During the break, show the user's chosen break reward ("Go listen to music") and a button to extend. Background-safe (use end timestamp, not tick counting).

### 8.6 Profile / Settings
Language, daily reminder time, subjects, plan status and manage subscription (deep link `https://apps.apple.com/account/subscriptions`), restore purchases, privacy policy, terms, export data, delete my data (clears local data and requests proxy deletion), app version.

---

## 9. Content plan

Honest position: the content is why people stay subscribed, and it is the biggest unknown in this PRD.

**Sources:**
1. **Original items** written for Nerdbase (AI assisted generation with human review by Nils, stored as JSON in `Resources/Content/`). Each item: id, subject, topic, difficulty 1 to 5, question LaTeX, options or answer, worked solution, tags, interest theme variants.
2. **Official Högskoleprovet tests** are published as PDFs on [studera.nu](https://www.studera.nu/globalassets/hogskoleprovet/hp-2022-05-07/provpass-1-kvant.pdf) (UHR). Reuse and commercial terms are not confirmed `[VERIFY]`. Until Nils confirms in writing with UHR, do not bundle official test text. In the meantime the app links to the official PDFs and lets the user scan their own printed questions, which gets the same value without redistribution.
3. **Skolverket course syllabi** (kursplaner and ämnesplaner) for topic structure. Public documents; use them to build the topic map, not to copy text. `[VERIFY]` terms if quoting.

**Launch volume target (MVP):**
- Matte 4 and 5: 12 topics × 25 items = 300
- Matte 1c to 3c: 20 topics × 15 = 300
- Fysik 1 and 2: 10 topics × 20 = 200
- Engelska 5 to 7: 6 topics × 20 = 120
- HP Kvant (original items matching the four sub-test formats XYZ, KVA, NOG, DTK): 400
- HP Verbal (original ORD, LÄS, MEK, ELF style items): 300 `[VERIFY sub-test format on studera.nu before writing]`
- Total about 1,600 items. This takes real work: AI draft, Nils checks every math answer. Wrong math answers kill trust faster than any bug. Add a "Report a problem with this question" button on every question.

**Quality gate:** every math/physics item has a machine verified answer (SymPy script in `Tools/verify_content.py`) before it ships.

---

## 10. Data model (SwiftData)

- `Profile`: language, goals, subjects, targetScore, examDate, blocksPerDay, breakReward, interests[], onboardingDone.
- `Problem`: id, subject, topic, latex, imageThumb (local only), createdAt, source (scan or bank).
- `Attempt`: problemId, correct, timeMs, errorReason?, createdAt.
- `SRSItem`: problemId, box, dueAt.
- `Session`: startedAt, blocks, minutes, xp.
- `Streak`: current, longest, lastActiveDate, freezesLeft.
- `UsageCounter`: day, scansUsed, questionsUsed (client display only; the proxy is the source of truth for scans).

---

## 11. Notifications
- Daily block reminder at the user's chosen time.
- "N cards due today" (max 1 per day).
- Streak at risk (evening, only if the streak is 3 days or longer).
- No marketing pushes in MVP. Cap: 2 per day, all local.

---

## 12. Privacy and legal
- Privacy policy and Terms hosted on a simple page (required for App Store).
- GDPR: the audience includes minors (16 to 18). Sweden's age of digital consent is 13 `[VERIFY]`. Keep data minimal, no ad SDKs, no tracking, so no ATT prompt.
- Scans: processed and discarded, stated in policy. Proxy logs must not store images or problem text beyond what is needed for abuse prevention.
- Founder claims: keep proof on file.
- Entity: operating as a sole trader in Sweden. App Store Small Business Program (15% commission under $1M) `[VERIFY eligibility and enrollment]`. Swedish VAT on subscriptions is handled by Apple as the merchant of record for in-app purchases.

---

## 13. Marketing surfaces in the app (the "marketed really nicely" part)
- Founder card (onboarding screen 1) is the credibility moment. It must be beautiful and true.
- Paywall copy: benefit led, no fake urgency, no fake countdowns, no fabricated reviews or user counts. Add social proof only when real.
- Share card: after a good session, "Share my streak" generates a clean image (streak, XP, Nerdbase wordmark) via `ImageRenderer`. Referral is out of scope for MVP.
- App Store assets (separate pass): 6 screenshots in this order: scan result, the globe opener, the 25/7 timer, the error log insight, the plan reveal, the paywall. Headline per screenshot, 3 to 5 words.
- ASO starting keywords (unverified, validate with App Store Connect search ads or a keyword tool): läxhjälp, högskoleprovet, plugga, matte, skanna, räknare. Subtitle: "Skanna läxan. Förstå den." `[VERIFY keyword volumes]`.

---

## 14. Analytics events
`onboarding_start`, `onboarding_step_viewed(step)`, `onboarding_completed`, `scan_started`, `scan_succeeded(latency_ms)`, `scan_failed(reason)`, `practice_answered(correct, subject)`, `focus_block_completed`, `paywall_viewed(source)`, `plan_selected(plan)`, `purchase_started`, `purchase_succeeded(plan)`, `purchase_cancelled`, `limit_hit(type)`, `restore_tapped`.

**Success metrics for the first 30 days (targets are placeholders, set real ones before launch):**
- Onboarding completion rate.
- Percent of new users who do a first scan in session 1 (activation).
- Day 1 and Day 7 retention.
- Paywall view to purchase rate, yearly share of purchases.
- Scan p50/p90 latency.
- Month one annual cancellation rate (benchmark: about 30%, RevenueCat).

---

## 15. Acceptance criteria (definition of done)

1. App builds with zero warnings on Xcode 16+, runs on iPhone 12 and newer, iOS 17+.
2. Cold start to interactive opener in under 1.5 s.
3. Opener holds 60 fps with globe, floating icons and folder all running (verify with Instruments Time Profiler on a real device).
4. Folder auto-opens and closes on a loop exactly as in Section 6.1 and the lightbox transition works with swipe between cards.
5. Reduce Motion, Dark Mode, Dynamic Type XXL, VoiceOver all pass a manual walkthrough of onboarding.
6. Swedish and English both complete with no truncated or hardcoded strings.
7. Purchases work in the Sandbox for both products, restore works, entitlement gating works, free limits enforce correctly.
8. Scan returns a rendered solution for a sample math, physics and English problem. No API key in the binary (verify with `strings`).
9. Unit tests pass for spaced repetition, usage limits, and entitlement logic.
10. Spaced repetition and timer survive app backgrounding and relaunch.
11. App Store privacy labels and review notes drafted.

---

## 16. Build plan: staged prompts for the Xcode agent

Run in order. Do not start the next pass until the previous builds and runs. Each pass should end with a commit.

**Pass 1: Foundation and design system.** Create the project, folder layout from Section 5, color assets (light and dark), typography, button/card/chip components, haptics and sound helpers, localization catalog (sv, en), SwiftData models, tab shell with placeholder screens. Done when it builds and the component gallery screen renders in light and dark.

**Pass 2: Opener.** Implement the globe (script to generate `land-dots.json`, SceneKit view, markers, drag and inertia), floating icons, folder with auto-open loop and lightbox, headline and buttons. Done when Section 15 items 3 and 4 pass.

**Pass 3: Onboarding.** Implement screens 1 to 8 with transitions, progress bar, state persisted in `Profile`, number count-up with haptics, Sign in with Apple. Done when a full run reaches the paywall placeholder with a stored profile.

**Pass 4: Monetization.** Integrate RevenueCat, build the paywall (Section 7), `PurchaseManager`, entitlement gating, free limit counters, soft paywall on limit. Done when sandbox purchases and restore work.

**Pass 5: Practice engine.** Question cards, session flow, feedback with haptics and sound, error log, Leitner scheduling with tests, streak and XP, content loader with a seed set of 60 items across subjects.

**Pass 6: Scan.** Camera flow, upload to the proxy, streaming result rendering with SwiftMath, save-to-deck, limits. Includes the proxy function (separate folder `Backend/`) with Apple token verification and per-user limits.

**Pass 7: Timer, plan, notifications, settings.** 25/7 timer with Live Activity, plan tab, local notifications, settings screens, delete data.

**Pass 8: Polish and submission prep.** Accessibility pass, performance pass, App Store screenshots, privacy labels, review notes, TestFlight build.

**Standing instructions to the agent in every pass:**
- No hardcoded user visible strings. No hardcoded prices.
- No secrets in the repo or binary.
- Prefer native APIs over dependencies.
- Every animation has a Reduce Motion fallback.
- Write unit tests for logic (not for views).
- After each pass, list what you did not finish.

---

## 17. Risks and open items

**Biggest risks (ranked):**
1. **Content correctness and volume.** About 1,600 items, each must be right. Mitigation: SymPy verification, report button.
2. **Price versus audience.** $20 per month for students, no trial. Whether this converts is unknown. Mitigation: yearly first, soft paywall at limits, A/B in week 4.
3. **Scan cost.** Each scan costs real money in API calls. Free users get 2 per day, which can add up. Mitigation: per-user caps in the proxy, image downscaling, caching identical problems. Estimate cost per scan with the actual model pricing before launch: unknown until measured.
4. **Official test reuse rights.** Unknown. Do not bundle until UHR confirms.
5. **Solo capacity.** One person doing app, content, backend, and marketing. The passes above are sized to be built by the agent; content review is the human bottleneck.

**What Nils needs to provide (in Xcode, not here):**
- Proof: HP result document and the course grade record (`Proof/`).
- Apple Developer account, bundle id, App Store Connect app record, the two subscription products.
- RevenueCat project, public SDK key, entitlement `pro`, offering `default`.
- Claude API key stored only in the proxy environment.
- Logo/app icon direction, final tagline choice.
- 21st dev presets beyond the two already given (globe, folder), if any.
- Written answer from UHR on reusing official tests.
- Confirmation of the HP Verbal sub-test format and the scoring scale from studera.nu.

---

## Sources
- [Which Study Strategies Make the Grade? (APS, on Dunlosky et al. 2013)](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html)
- [A Meta-Analysis of Ten Learning Techniques (Frontiers in Education, 2021)](https://www.frontiersin.org/articles/10.3389/feduc.2021.581216/full)
- [HP provpass 1 Kvant, 2022-05-07 (studera.nu)](https://www.studera.nu/globalassets/hogskoleprovet/hp-2022-05-07/provpass-1-kvant.pdf)
- [HP provpass 1 Kvant, 2024-10-20 (allakando.se)](https://allakando.se/wp-content/uploads/2024/10/provpass-1-kvant-2024-10-20.pdf)
- [RevenueCat State of Subscription Apps 2025, coverage by Subscription Insider](https://subscriptioninsider.com/article-type/news/revenuecats-state-of-subscription-apps-2025-report-ais-dominance-retention-challenges-and-the-shift-away-from-pure-subscriptions)
- [SaaStr: what 17,000 subscription apps tell us about free trial length](https://saastr.com/what-17000-subscription-apps-tell-us-about-free-trial-length-annual-plans-convert-86-better-with-30-day-trials-monthly-tops-out-at-two-weeks-and-ai-apps-hit-a-wall-at-16-days)
