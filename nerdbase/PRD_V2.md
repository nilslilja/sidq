# Nerdbase PRD v2: complete iOS product and optimal plan

Owner: Nils (solo founder, Stockholm). Build agent: Claude in Xcode. Platform: iPhone, iOS 17+, SwiftUI, native.
Status: v2.0. Supersedes `PRD.md` where they conflict (Section 1). Companion files: `XCODE_PROMPT_CORE_LOOP.md` (learning loop), `SCAN_UX_SPEC.md` (camera guidance), `MONETIZATION_TEARDOWN.md` (payments), `assets/` (icon, 5 screenshots, visual prototype).

Items marked `[VERIFY]` are unconfirmed facts. Do not ship a claim marked `[VERIFY]`.

Reference code: `nerdbase/app/src/mathx.js` and `content.js` are tested JavaScript reference implementations (math expression parser with complex numbers, equivalence grader, symbolic derivative with Swedish steps, parametric exercise generators; about 15,000 automated checks pass in `app/tests`). The Xcode agent ports them to Swift and reuses the test cases. They are specs, not shipped code.

---

## 0. Verdict

The product is a **Duolingo style learning loop for advanced math and Högskoleprovet, with a camera that explains any homework problem, built around the Nerd Method** (short focus blocks, retrieval practice, spaced repetition, error log).

Three decisions change from v1, each backed by data in `MONETIZATION_TEARDOWN.md`:
1. Paywall inside onboarding (multi page), and an A/B test of freemium versus hard paywall with a 7 day yearly trial from day one.
2. Yearly price test starting at $99 (monthly $19.99 anchor) against your $144.
3. Parents are a buyer path: "send to parent" link and Family Sharing.

---

## 1. What this file overrides in earlier docs
| Topic | Earlier | Now |
|---|---|---|
| Tabs | Learn, Scan, Plan, Profile (PRD v1) then Learn, Scan, Practice, Profile | **Learn, Scan, Practice, Profile.** The daily plan lives at the top of Practice |
| Launch | onboarding for new users | **Every cold launch opens the Opener screen**; new users continue into onboarding, returning users continue to Learn |
| Paywall | one page at end of onboarding | 3 page paywall inside onboarding, plus placement triggers |
| Pricing | $20 / $144, no trial | Test matrix in Section 8 |
| Free tier | 3 lessons and 2 scans a day | unchanged, but arm B (hard paywall) tests removing it |

---

## 2. Product

**Name:** Nerdbase. `[VERIFY]` trademark and App Store name availability.
**One line:** Scan it. Understand it. Train it.
**Users:** gymnasium students (16 to 19) and adults retaking Högskoleprovet. **Buyer** is often a parent for under 18s.
**Subjects at launch:** Matematik 3c, 4, 5 (Matte 4 fully built), Högskoleprovet Kvantitativ (XYZ, KVA first; NOG and DTK as the next release), Fysik and Engelska as visible "Soon" courses.
**Languages:** Swedish and English, chosen from device language and region (`Locale`), override in Profile.
**Business model:** freemium with a paywall test (Section 8).

### 2.1 Founder story and proof
Nils: 1.8 on Högskoleprovet after 2 days of studying, and a B in an entire course after 2 days. Study routine: 3 hours a day in 25 minute blocks with 7 minute enjoyable breaks, and real interest in the material.
- Show numbers only with proof on file (`Proof/`, not shipped). The "Verifierat" chip appears only if the asset exists.
- Copy rule: "Så gjorde jag", never "du kommer få". n of 1 story.

---

## 3. Information architecture and app launch

```
Cold launch
  -> OPENER (globe, floating icons, auto opening folder)           [always]
       new user    -> Onboarding (8 screens) -> Paywall (3 pages) -> HOME
       returning   -> "Fortsätt" (or auto advance after 3 s)      -> HOME
HOME (tab bar)
  LEARN     path of nodes -> Lesson player -> completion flow
  SCAN      hub -> camera guidance -> solving -> result sheet
  PRACTICE  daily plan, mistakes review, weak spots, timed tests, focus timer, error log
  PROFILE   study card, week, streak calendar, mastery, routine, settings, subscription
Global: paywall placements, out of lessons sheet, out of scans sheet
```
Rules: the tab bar is hidden inside lessons, camera and timers. Every tab has a designed empty state. No screen is a placeholder; if a feature is not ready it is hidden, not stubbed.

---

## 4. Screen specifications

### 4.1 Opener
Spec in `PRD.md` Section 6.1 (globe from the cobe reference ported to SceneKit, floating icons via `TimelineView` + `Canvas`, folder auto open loop). Additions:
- Returning user: show the same screen with "Fortsätt" and a 3 second auto advance that cancels on touch.
- Plays first only after assets are ready (no blank frame). Cold start to interactive under 1.5 s.
- Sound and haptics follow Profile settings.

### 4.2 Onboarding (8 screens, progress bar, back on every screen after the first)
1. **Story**: founder card (Section 2.1).
2. **Goal**: Gymnasiebetyg, Högskoleprovet, Båda, Bara nyfiken.
3. **Course and target**: subjects checklist, target grade or HP score (0.0 to 2.0 slider), exam date optional `[VERIFY]` current HP scoring scale and next test dates on studera.nu.
4. **Interests**: pick 3 (theme word problems). Chips pop with haptic and sound.
5. **Rhythm**: daily goal (Chill 10, Steady 20, Serious 30, Insane 50 XP), blocks per day (1, 2, 4, 6; 3 hours is highlighted "Nils rutin"), break reward.
6. **Try the scan**: live demo on a bundled problem with the laser sweep and steps stacking in. "Skanna min egen" triggers camera pre prompt then system permission. Skip allowed.
7. **Plan reveal**: shimmer 1.5 s then the generated plan (blocks per day, weeks left if a date was set, first session). The plan must really use the answers.
8. **Sign in with Apple** ("Spara din plan"), skippable once, required before the first scan. Then the paywall.

### 4.3 Paywall (3 pages, details in `MONETIZATION_TEARDOWN.md` Section 4)
Page 1 outcome and method, page 2 what you unlock with real screenshots, page 3 plans (yearly preselected, billed amount largest, terms under button, Restore, Terms, Privacy, "Skicka till förälder", close appears after 2 s). Products and prices from RevenueCat only.

### 4.4 Learn
Full spec in `XCODE_PROMPT_CORE_LOOP.md`: path with node states, Start sheet, lesson player (12 exercises, requeue wrong answers, feedback sheet, combo), completion flow (XP, streak, daily goal), 3 free lessons a day, guidebooks, unit tests, refresh nodes.

### 4.5 Scan (hub plus camera)
**Hub screen (tab):**
- Large title "Skanna". Primary button "Skanna uppgift" (opens camera). Secondary: "Välj bild" and "Skriv in uppgift".
- Counter chip: "2 skanningar kvar idag" (free) or "Obegränsat" (Pro).
- "Senaste" list: thumbnail, subject tag, first line of the problem, date. Tap reopens the result sheet.
- "Sparade" section (the deck from "Spara").
- Short tips card "Så skannar du": flat light, hela uppgiften i ramen, håll stilla.
**Camera, guidance, results, failures:** `SCAN_UX_SPEC.md` is binding. Additions for v2:
- Typed entry: a math input with the custom keypad; derivative problems are solved locally with steps (the reference solver in `mathx.js` verifies every answer numerically before showing it). Anything else goes to the backend.
- "Öva liknande" generates a new problem of the same type and grades the typed answer with the equivalence grader.
- Photo understanding requires the backend proxy (Claude vision). It must exist before the camera ships; without it the scan tab would only do typed entry. Backend contract: `SCAN_UX_SPEC.md` and `PRD.md` Section 5.

### 4.6 Practice (so the tab is fully occupied)
Large title "Öva". Cards in this order:

1. **Dagens plan** (the Nerd Method day): today's blocks as a vertical checklist, default 4 blocks: block 1 hardest topic (retrieval only), block 2 new material with a scan session, block 3 spaced repetition due items, block 4 timed mini test. Each block shows duration (25 min), status and a play button. Progress ring for the daily goal. Edit blocks in Profile.
2. **Misstagsrepetition**: count badge of saved mistakes, starts a 6 exercise set. Finishing one grants +1 free lesson (max 2 a day) for free users. Empty state: "Inga misstag att repetera. Bra jobbat."
3. **Svaga punkter**: the 3 skills with lowest ease; each row has level dots and a "Repetera" button (8 exercise refresh lesson).
4. **Högskoleprovet tidsprov**: segmented control XYZ and KVA now, NOG and DTK greyed "Snart". Shows official recommended time and item count (verified from official provpass PDFs: XYZ 12 items 12 min, KVA 10 items 10 min, NOG 6 items 10 min, DTK 12 items 23 min, 40 items in 55 min per Kvantitativ section: [studera.nu provpass](https://www.studera.nu/globalassets/hogskoleprovet/hp-2022-05-07/provpass-1-kvant.pdf)). Timed mode with ring countdown, skip arrow (skipped items return at the end), no feedback until the review screen. Results: score, time per question, errors by type, best score history. Free: 1 a week.
5. **Fokustimer**: 25 minute focus, 7 minute break, large ring, Live Activity and Dynamic Island, break reward from onboarding, extend break button, timestamp based (background safe). Sessions and minutes feed Profile.
6. **Felloggen**: top error types (from `trap` tags and the "why did I miss this" chips) as proportional bars; tap a type to start a 6 exercise drill on it.

Empty states are designed for a brand new user (everything shows an invitation, never a blank list).

### 4.7 Profile (Apple design, soft, and unique)

**Design intent:** looks like a first party Apple app (large title, inset grouped lists, SF Symbols, system toggles, materials), with one signature piece that is Nerdbase: the **Studiekort** (study card). Soft, warm, calm. Not a generic AI dashboard.

**Layout, top to bottom (`NavigationStack`, large title "Profil", `ScrollView`):**
1. **Studiekort**: a paper like card, 28 pt continuous corner radius, warm off white with a faint grain (3% noise via `Canvas`, skipped when Reduce Transparency is on), soft shadow (y 8, blur 24, 6% black). Contents: monogram circle (initial; long press to rename) wrapped by the daily goal ring, name, "Matte 4 · Högskoleprovet", then three large numbers set in the system serif design (`.fontDesign(.serif)`, which gives New York): streak days, total XP, mastered nodes. Tap flips the card (rotation 3D, 0.5 s spring) to show "Så pluggar jag": the Nerd Method in three lines with Nils' story and the verified chip if proof exists.
2. **Din vecka**: Swift Charts, 7 rounded bars (corner radius 6), today in accent, others in a soft tint, dashed goal line, axis labels in muted type. Caption in a sentence: "Du la 38 min på tisdag, ditt bästa i veckan." generated from data. Empty: "Din första vecka börjar nu."
3. **Streak**: month grid of small circles (filled accent when a lesson was done, soft ring for a freeze used, hollow otherwise), current and best streak under it, freezes left as small crystal symbols (SF Symbol `snowflake`).
4. **Mastery**: per course disclosure group; each skill row shows 3 level dots, "Behöver repeteras" tag when due. Tap a row to start practice.
5. **Rutin**: grouped list: Pass per dag (Stepper 1 to 6), Paus (Picker: Musik, Promenad, Mellanmål, Spel, Vän, Stretch), Dagligt mål (segmented four values), Påminnelse (compact `DatePicker`, time only).
6. **Prenumeration card** (grouped section): Free shows "Gratis" with usage meters "2 av 3 lektioner kvar idag" and "1 av 2 skanningar kvar", and a "Uppgradera till Pro" row (opens paywall `profile_upgrade_card`). Pro shows plan, renewal date, "Hantera prenumeration" (opens `https://apps.apple.com/account/subscriptions`), "Återställ köp".
7. **Inställningar**: Språk (Svenska, English), Ljud (Toggle), Haptik (Toggle), Skicka feedback, Dela Nerdbase, Integritetspolicy, Användarvillkor, Version.
8. **Din data**: "Exportera data" and, destructive, "Radera min data" with a confirmation dialog.

**Visual rules (the "not AI slop" list, binding):**
- Native first: `List(.insetGrouped)`, `Toggle`, `Picker`, `Stepper`, `DatePicker`, `ShareLink`. Custom only for Studiekort, the week chart and the streak grid.
- One accent (orange `#FB6415`). Supporting tints are muted (peach, butter, sage, sky at about 14% opacity). **No purple gradients, no neon glows, no gradient text, no glassmorphism stacked on glassmorphism.**
- **No emoji as icons.** SF Symbols with hierarchical rendering only.
- **No row of four identical stat tiles with colored icon chips.** The hierarchy is: one hero card, one chart, one calendar, then lists.
- Copy is plain Swedish and specific ("38 min i tisdags"), never motivational filler ("Keep crushing it!").
- Numbers use the serif design; labels use SF Pro Rounded. Consistent 16 pt gutters, 28 pt card radius, 12 pt list radius.
- Dark mode is designed, not inverted: warm near black `#0F0D0C`, card `#1A1715`, grain off.
- Motion: 0.5 s springs, haptic `.selection` on every toggle and picker change, Reduce Motion replaces the flip with a crossfade.
- Accessibility: Dynamic Type up to XXL (the card reflows to a vertical stack), VoiceOver reads "Streak 7 dagar, bäst 12 dagar", all hit targets at least 44 pt.

### 4.8 Global sheets
- **Out of lessons** (free): "Du har inga lektioner kvar idag", Go Pro, "Få 1 till med Misstagsrepetition", countdown to midnight.
- **Out of scans** (free): same pattern, with "Skriv in uppgiften" as an alternative.
- **Quit lesson** confirmation.

---

## 5. Design system (single source)
Tokens as in `PRD.md` Section 6.0 and `XCODE_PROMPT_CORE_LOOP.md` Section 4: warm paper background `#FBF8F4`, ink `#14110F`, accent `#FB6415` with lip `#D94F0A`, success `#22A06B`, error `#E5484D`, gold `#F5B301`; chunky 3D buttons in lessons and paywall, native controls elsewhere; SF Pro Rounded with New York serif for hero numbers; springs everywhere with Reduce Motion fallbacks; sounds under 400 ms, original, silent switch respected. Haptics and sound toggles in Profile are honored by one `Haptics` and one `Sound` wrapper.

---

## 6. Architecture (summary)
SwiftUI, SwiftData, Sign in with Apple, RevenueCat (`pro`, offering `default` with experiments), Claude vision through a proxy (no API key in the app), VisionKit and AVFoundation camera with Vision rectangle detection and CoreMotion tilt, SwiftMath for LaTeX, Swift Charts, local notifications, ActivityKit for the focus timer, TelemetryDeck or PostHog. Full details: `PRD.md` Section 5. Everything tunable lives in `Tuning.swift`.

Backend (one function): verifies the Apple token, enforces free limits, rate limits, calls the vision model, returns structured JSON, never stores images. Cost per scan is unknown until measured.

---

## 7. Content plan
- **Parametric generators** for drill skills (complex numbers, percent, equations, KVA templates): correct by construction, unlimited variety, verified by automated tests. Reference: `app/src/content.js`.
- **Authored items** for concepts, spot the mistake, order the steps, and strategy skills.
- **Guidebooks** (60 second reads) per unit, authored by Nils.
- Official Högskoleprov tests: do not bundle until UHR confirms reuse rights in writing `[VERIFY]`; link out to studera.nu in the meantime.
- Launch volume: Matte 4 fully built (5 units), HP XYZ and KVA (4 units), others as "Soon" courses with a notify toggle. Every math item passes `Tools/verify_content` (SymPy) before shipping. Report button on every question.
- Verbal section formats and the HP scoring scale `[VERIFY]` before writing content.

---

## 8. Monetization (decisions)
Detail and evidence in `MONETIZATION_TEARDOWN.md`. Launch matrix:
| Variant | Gate | Trial | Yearly | Monthly |
|---|---|---|---|---|
| A (control) | Freemium: 3 lessons and 2 scans a day | none | $99 | $19.99 |
| B | Hard paywall after onboarding | 7 days on yearly | $99 | $19.99 |
| Price arm | whichever of A or B leads | same | $144 | $20 |
Decision metric: revenue per install at Day 14 (rule in the teardown doc). All prices through RevenueCat and App Store Connect; never hardcoded.

---

## 9. Analytics and success metrics
Events in `MONETIZATION_TEARDOWN.md` Section 8. Product KPIs (targets are unknown until a baseline exists, so set them after the TestFlight beta): onboarding completion, first lesson in session 1, first scan in session 1, D1 and D7 retention, paywall view to purchase, revenue per install by variant, scan p50 and p90 latency, month one annual cancel rate (benchmark about 30%).

---

## 10. Acceptance: "everything works" checklist
1. Cold launch always shows the Opener first; returning users reach Learn in one tap (or 3 s).
2. Onboarding completes with persisted answers and a generated plan, then the 3 page paywall; closing it reaches Learn on the free tier.
3. Learn: path shows all node states, a lesson runs end to end, XP, streak, goal flow, unlock animation, 3 free lessons enforced, Pro removes the limit instantly (sandbox).
4. Scan: camera permission flow, live guidance states, auto capture, manual shutter, photo library fallback, typed entry, result sheet, save, "Öva liknande", failure screens, free limit counter, denied permission path.
5. Practice: every card works from a cold start on a fresh install, with designed empty states; timed test timer survives backgrounding; focus timer Live Activity works.
6. Profile: every section renders with zero data and with seeded data; toggles change behavior (sound, haptics, language); subscription section reflects entitlement; delete data wipes everything and returns to the Opener.
7. Light and dark mode, Dynamic Type XXL, VoiceOver, Reduce Motion pass on all four tabs.
8. Sandbox purchase, restore, entitlement gating and experiments verified.
9. Unit tests green: grader, expression parser, generators, spaced repetition, streak with injected clock, limits, entitlement gate, scan guidance state machine.
10. No secrets in the binary, no hardcoded prices, no hardcoded strings.

---

## 11. Optimal plan

Effort is an estimate for a solo founder using the Xcode agent. Unknowns are called out. The critical path is **content plus backend**, not UI.

### Phase 0: prerequisites (Nils, before any code, about 1 week, parallel)
- Apple Developer Program account (cost `[VERIFY]`, about $99 a year), App Store Connect app record, bundle id, two subscription products in one group.
- RevenueCat project, public SDK key, entitlement `pro`, offering `default`.
- Proof documents for 1.8 and the B, saved in `Proof/`.
- Email UHR about reusing official tests; check HP dates, scoring and Verbal formats on studera.nu.
- Pick the vision backend host (Supabase Edge Function or Cloudflare Worker) and put the Claude API key there.
- Decide TelemetryDeck or PostHog.

### Phase 1: foundation and opener (agent pass 1 and 2)
Design system, tabs shell, models, localization, opener with globe and folder, onboarding skeleton. Gate: opener at 60 fps on iPhone 12, light and dark.

### Phase 2: learning loop (pass 3 and 4)
Grader and expression parser (port from the reference JS with its test cases), lesson builder and session, player, feedback sheet, path, XP, streak, goal flow. Gate: acceptance items 3 and 9.

### Phase 3: monetization (pass 5)
RevenueCat, 3 page paywall, gates, experiments wiring (placement ids and variants), out of limit sheets. Gate: sandbox purchase and restore.

### Phase 4: scan (pass 6, needs the backend)
Camera guidance state machine with tests, capture and crop, proxy integration, result sheet, typed entry with the local derivative solver, failure states. Gate: 10 real homework photos in varied light; record the hit rate of reaching "Bra. Håll stilla" within 3 seconds (target unknown, set after measuring), and measure real cost per scan.

### Phase 5: practice and profile (pass 7)
All Practice cards, timed tests, focus timer with Live Activity, Profile with Studiekort, chart, streak grid, mastery, routine, subscription section, settings, data deletion. Gate: acceptance items 5 and 6.

### Phase 6: content (parallel from Phase 1, Nils plus tooling)
Matte 4 complex numbers first (generators exist), then derivative, integrals; HP XYZ and KVA; guidebooks; verification tooling. This is the longest pole: the hours are unknown, estimate from the first unit you finish and extrapolate.

### Phase 7: beta and submission (pass 8)
TestFlight with about 20 real students (your school network); track the metrics in Section 9; fix the top issues; App Store assets (icon and 5 screenshots exist in `assets/`, regenerate from real simulator captures), privacy labels, review notes with a demo path to the scan feature, subscription metadata. Submit.

### Phase 8: launch and iterate
Launch ahead of the next Högskoleprov registration and test dates `[VERIFY dates on studera.nu]`. Channels (start with the one you can sustain): short videos telling the founder story (TikTok, Instagram Reels), gymnasie communities, one outreach batch to study influencers. Run experiments 1 to 3 from `MONETIZATION_TEARDOWN.md` Section 6 in the first month.

### Order of agent passes (updated)
1. Foundation and design system. 2. Opener. 3. Onboarding and paywall pages. 4. Learning loop. 5. RevenueCat and gating. 6. Scan with backend. 7. Practice and Profile. 8. Polish, accessibility, performance, localization. Commit and run tests after each; list unfinished items at the end of each pass.

### Kill and pivot criteria (set numbers after the beta baseline)
- If the first lesson completion rate in session 1 is low, fix onboarding and the first lesson before spending on acquisition.
- If cost per scan times scans per paying user exceeds your net revenue per paying user, reduce free scans, cache, or downscale images before launch.
- If experiment 1 shows hard paywall wins by 2x or more with similar D7 retention, remove the free tier.

---

## 12. Risks and open decisions
| Risk or decision | Status |
|---|---|
| Price vs competitors ($99 or $144 vs about $60 to $70 for scan apps) | Test (Section 8) |
| Content volume and correctness | Generators plus verification; Nils' time is the bottleneck |
| Official test reuse rights | Unknown; email UHR |
| Scan cost per user | Unknown; measure in beta |
| Photo scan needs a backend before launch | Required |
| Under 18 buyers and GDPR | Keep data minimal, no ad SDKs, no ATT; Swedish digital consent age 13 `[VERIFY]`; parent purchase path |
| Founder claims | Proof on file before any use in store assets |
| Brand and name | Trademark check `[VERIFY]` |
| HP Verbal formats and scoring scale | `[VERIFY]` on studera.nu |

## 13. What Nils must supply
Proof documents, Apple account and products, RevenueCat keys, backend host and API key, guidebook text for each unit, final tagline, HP date confirmation, UHR answer, and the first 20 beta students.

---

## Sources
- [studera.nu: provpass 1 Kvant](https://www.studera.nu/globalassets/hogskoleprovet/hp-2022-05-07/provpass-1-kvant.pdf)
- [Apple: Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/) (design reference)
- Monetization sources: see `MONETIZATION_TEARDOWN.md`
