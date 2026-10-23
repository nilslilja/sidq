# NERDBASE CORE LEARNING LOOP: STRICT BUILD PROMPT FOR XCODE AGENT

Read this entire file before writing code. Follow it literally. Where this file is silent, choose the simplest native iOS solution and list your choice in `DECISIONS.md`.

This file defines the learning loop, the path, the lesson player, the feedback system, the streak/XP system, and the free/Pro gate. It is modeled on the proven mechanics of Duolingo, adapted for **advanced mathematics (Swedish gymnasium Matematik 3c, 4, 5) and Högskoleprovet (Kvantitativ first, Verbal second)**.

It extends `nerdbase/PRD.md`. If the two files conflict, **this file wins** for everything listed in Section 0.2. Everything else in the PRD still applies (design tokens, onboarding, paywall, scan, architecture, localization, accessibility).

---

## 0. Ground rules

### 0.1 Scope discipline
The user asked for mechanics without clutter. Build exactly what is listed. Everything in Section 14 ("Cut list") is **forbidden** in this build. Do not add leagues, gems, shops, friends, quests, chests, or a mascot.

### 0.2 What this file overrides in the PRD
1. Tabs become: **Learn** (the path), **Scan**, **Practice**, **Profile**. The PRD "Plan" tab is merged into Practice (timed tests and the 25/7 timer live there).
2. Free tier limits become: **3 lessons per day** and **2 scans per day**. The PRD rule "10 practice questions per day" is removed. Mistakes never cost anything (Section 9).
3. The practice engine in PRD Pass 5 is replaced by the lesson engine defined here.

### 0.3 Legal and brand rule
Duolingo is a reference for mechanics only. Mechanics (paths, streaks, XP, feedback sheets) are not protected, but their brand and assets are. **Do not** copy or imitate: the owl or any mascot, the Feather font, Duolingo's exact greens and blues, their sound effects, their illustrations, their copywriting, or the word "Duolingo" anywhere in code, comments, assets or the App Store listing. Use the Nerdbase tokens from the PRD (Section 6.0) and SF Pro Rounded.

### 0.4 Evidence status (what is known versus decided)
This file mixes two kinds of statements. Do not confuse them.
- **Observed Duolingo pattern**: path of nodes, short lessons, bottom feedback sheet, daily streak, XP, daily goal, wrong answers re-queued, energy replacing hearts for free users (announced July 2025, per [Duolingo](https://blog.duolingo.com/duolingo-energy/)). Streaks work through loss aversion, per secondary analyses.
- **Decided for Nerdbase**: every number in this file (lesson length 12, XP values, 3 free lessons, node levels). These are design decisions, not claims about Duolingo. Duolingo's exact internal values were not verified and sources disagree on lesson length (one says 7 to 14 questions, one says 3 to 5 minutes). Put all tunable numbers in `Tuning.swift` (Section 13) so they can change without touching logic.

### 0.5 Engineering rules (apply to every file)
1. SwiftUI only. iOS 17 minimum. No UIKit unless wrapping a system controller.
2. No hardcoded user visible strings. All through `Localizable.xcstrings` (sv and en).
3. No magic numbers in views. Colors, spacing, durations, springs come from `DesignSystem/Tokens.swift`.
4. Every animation has a Reduce Motion fallback (instant state change plus a crossfade).
5. Every interactive element has an accessibility label and works with VoiceOver and Dynamic Type up to XXL.
6. Logic lives in plain Swift types with unit tests (`LessonEngine`, `Grader`, `StreakStore`, `XPStore`, `MathExpression`, `SkillMastery`). Views contain no business logic.
7. Persist with SwiftData. Time based logic (streak, daily limits) uses an injectable `Clock` so tests can control time. Day boundaries use the user's current calendar and time zone.
8. After finishing, update `DECISIONS.md` and list anything not finished.

---

## 1. The core loop (the whole product in one diagram)

```
Open app
  -> Learn tab: the Path (vertical winding line of nodes)
  -> tap the current node -> "Start" sheet
  -> Lesson (12 exercises, about 4 minutes)
       each exercise: answer -> Check -> feedback sheet -> Continue
       wrong answers are re-queued to the end
  -> Lesson complete screen (XP, accuracy, time)
  -> Streak screen (only if this lesson extends today's streak)
  -> Daily goal screen (only when the goal is first reached today)
  -> back to Path, next node unlocked, path scrolls to it
```

Design target: from app open to the first exercise on screen in **3 taps or fewer** and under **2 seconds**. The user returning daily should always land on the Path with the next node highlighted and a bouncing "START" label.

---

## 2. Curriculum structure

Hierarchy: **Course > Section > Unit > Skill (node) > Lesson**. Users see a single vertical Path per course. Two courses at launch: **Matematik** and **Högskoleprovet**. Course switcher is a pill in the top bar (Section 3.2).

- **Section**: a big banner on the path ("Derivata", "KVA"). 4 to 8 units each.
- **Unit**: a themed group of 4 to 6 skills, ending in a **Unit Test** node (a harder lesson of 16 exercises, no hints, needs 80 percent to pass).
- **Skill (node)**: one concept. Has **4 levels** (0 = not started, 1, 2, 3 = mastered/gold). Each completed lesson of the node raises its level by 1 (max 3). Higher levels draw harder exercises from the same pool.
- **Lesson**: 12 exercises generated by `LessonBuilder` (Section 5).
- **Guidebook**: each unit has one 60 second read (3 to 5 cards, LaTeX, one worked example) reachable from a book icon on the unit banner and shown automatically once before the first node of a unit. Duolingo teaches by doing; math needs a short explanation first, so this is the one place we diverge.

### 2.1 Matematik course (advanced focus). Content outline
Mark every topic list below `[VERIFY against Skolverket ämnesplan for matematik]` before writing content. Do not invent syllabus claims.

| Section | Units (skills inside each) |
|---|---|
| Matte 3c | Derivata (definition, derivering av potens, produktregeln, kedjeregeln, extrempunkter), Exponential och logaritm, Trigonometri (enhetscirkeln, ekvationer) |
| Matte 4 | Komplexa tal (rektangulär form, räkneregler, polär form), Trigonometri (additionsformler, radianer), Derivata fortsättning, Integraler, Bevis |
| Matte 5 | Differentialekvationer, Serier och summor, Induktion, Avancerad integration |

Launch target for seed content: **Matte 4 section fully built (5 units), 3c and 5 as stubs** (nodes visible, locked behind "Coming soon" with notify toggle). Do not ship empty nodes that open nothing.

### 2.2 Högskoleprovet course. Content outline
Kvantitativ sub-tests (counts and recommended times verified from official provpass PDFs: 40 items per section, 55 minutes; XYZ 12 items 12 min, KVA 10 items 10 min, NOG 6 items 10 min, DTK 12 items 23 min; see [studera.nu provpass](https://www.studera.nu/globalassets/hogskoleprovet/hp-2022-05-07/provpass-1-kvant.pdf)).

| Section | Units |
|---|---|
| XYZ | Aritmetik och bråk, Procent och förändringsfaktor, Algebra och ekvationer, Geometri, Sannolikhet och kombinatorik, Funktioner |
| KVA | Jämförelsetekniken (test x=0, 1, -1, bråk), Storleksordning, Parametrar med olika värden |
| NOG | Tillräcklig information (logiken i svarsalternativen), Räkna eller resonera, Fällor |
| DTK | Läsa diagram, Tabeller, Kartor och skalor, Snabb uppskattning |
| Verbal (phase 2) | ORD, LÄS, MEK, ELF. Sub-test names are confirmed, formats are `[VERIFY on studera.nu]`. Ship Verbal as a stub section that says "Soon" until formats are verified and original items exist. |

Every HP unit includes a **Strategy skill** node (technique first: elimination, plug in numbers, estimate, when to guess). Whether wrong answers are penalised on the real test: `[VERIFY]` before writing the "always guess" advice; until verified, say only "answer every question you can".

---

## 3. The Learn tab (Path) UI

### 3.1 Path layout
- Vertical `ScrollView` with a `LazyVStack`. Nodes alternate horizontally along a gentle sine curve: x offset = `sin(index * 0.9) * 56pt` from center. Sine amplitude is a token.
- Node size **76 x 76 pt** circle. Vertical spacing between nodes **28 pt** plus the node height.
- Each node is a **3D button**: a circle with a darker 6 pt "lip" underneath (same style as primary buttons, Section 4.1). Press = lip collapses and the node moves down 6 pt (80 ms).
- Path connectors: none (floating nodes like the reference pattern), but add a faint dotted line behind them in `ink.opacity(0.08)`.
- Section banners: full width rounded card, 20 pt vertical padding, section number small caps ("AVSNITT 2, ENHET 3"), title in 22 pt bold rounded, a guidebook icon button at right.
- Decorations between units (very light): one small SF Symbol cluster or a tinted shape every 4 nodes, opacity 0.12, never interactive.
- Floating icons effect from the PRD opener is reused at very low density (3 icons) on the Path background. Disabled when Reduce Motion is on.

### 3.2 Top bar (sticky, 56 pt, blur background)
Left to right: **course pill** (flag-like glyph + "Matte 4" with a chevron, opens a course switcher sheet), **streak** (flame icon + number, tappable), **daily lessons left** for free users (bolt icon + "3", Pro users see an infinity glyph). Nothing else. No gems, no hearts.

### 3.3 Node states
| State | Look | Behaviour |
|---|---|---|
| Locked | Gray fill `surface.opacity` with lock glyph | Tap: shake 6 pt twice, `.warning` haptic, tooltip "Finish the node above" |
| Available (current) | Accent fill, white glyph, **progress ring** (empty) | Bouncing "START" label above it (translateY 0 to -6, 0.9 s ease in out, repeating). Tap opens Start sheet |
| In progress (level 1 or 2) | Accent fill, ring partially filled (one third per level) | Tap opens Start sheet |
| Mastered (level 3) | Gold fill `#F5B301`, white glyph, full ring | Tap opens Start sheet (practice) |
| Needs refresh | Same as its level but ring is **dashed** and node has a hairline crack overlay | Appears when `SRSItem` for the skill is due. Tap starts a 8 exercise refresh lesson |
| Unit Test | Larger node 92 pt with a trophy glyph | Locked until all skills in the unit are level 1+ |

Only **one** node is "current" at a time (the first not yet leveled to 1). Other leveled nodes remain tappable for practice.

### 3.4 Start sheet
Tapping a node opens a bottom sheet anchored to the node (a popover bubble with an arrow, like the reference pattern; on small screens a medium detent sheet):
- Skill title, a one line description, level dots (3 dots).
- Primary button "START +10 XP" (or "FORTSÄTT" if mid lesson). Secondary "Guidebook".
- If the free daily lessons are used up: the button becomes "Upgrade for unlimited" and opens the paywall. Below it a secondary text "Do a Mistakes Review to earn 1 more lesson" (Section 9).

### 3.5 Scroll and entry behaviour
- On first appearance after a lesson, auto scroll so the current node is vertically centered with a spring (response 0.7, damping 0.85).
- When a new node unlocks: after the lesson-complete flow, the newly unlocked node plays a **unlock animation**: scale 0.6 to 1.1 to 1.0 with spring, a sparkle burst (12 particles, 600 ms), sparkle sound, `.success` haptic.
- A "Jump to current" floating pill appears when the current node is off screen.

---

## 4. Visual design system for the lesson (Duolingo-like feel, our look)

Tokens come from PRD Section 6.0. Add these to `Tokens.swift`:

| Token | Light | Dark |
|---|---|---|
| `correct` | `#22A06B` | `#2FBF84` |
| `correctTint` | `#DDF5E8` | `#12332A` |
| `wrong` | `#E5484D` | `#F26A6E` |
| `wrongTint` | `#FFE3E4` | `#3A1A1B` |
| `accentLip` (darker accent for 3D lip) | `#D94F0A` | `#D94F0A` |
| `surfaceLip` (for cards, 3D lip) | `ink.opacity(0.14)` | `white.opacity(0.14)` |
| `gold` | `#F5B301` | `#F5B301` |

### 4.1 The chunky 3D button (use everywhere)
Implement `ChunkyButtonStyle` as a `ButtonStyle`:
- Height 54 pt (full width) or 76 pt circle for nodes. Corner radius 16 pt continuous.
- Face color plus a **lip**: the same shape offset down by 4 pt in the darker color, drawn behind.
- Pressed: face moves down 4 pt and the lip height collapses to 0, animation `.easeOut(duration: 0.08)`; released: spring back `response 0.3, damping 0.6`. `.sensoryFeedback(.impact(flexibility: .soft), trigger:)` on press down.
- Disabled: face `surface`, label `muted`, lip `surfaceLip`, no press animation.
- Label: 17 pt bold rounded, uppercase letter spacing 0.8 for primary actions in Swedish and English ("KONTROLLERA", "CHECK"). Uppercase is applied through `textCase`, not by changing the string.
Provide variants: `.primary` (accent), `.success` (correct), `.danger` (wrong), `.neutral` (surface with border).

### 4.2 Choice cards (multiple choice options)
- Rounded rect radius 16, 2 pt border `surfaceLip`, face `surface`, 4 pt lip below (same trick as buttons).
- Selected: border and lip become `accent`, face becomes `accent.opacity(0.12)`. Pop scale 1.0 to 1.03 to 1.0 (spring), `.selection` haptic, pop sound.
- After Check: correct choice turns `correct` border + `correctTint` face; a wrongly selected choice turns `wrong` + `wrongTint` and does a horizontal shake (8 pt, 3 oscillations, 300 ms).
- Minimum height 60 pt, label 17 pt, LaTeX rendered inline with `SwiftMath` at 18 pt baseline matched.
- Number keys on the keypad use the same style at 52 pt height.

### 4.3 Lesson screen frame
```
+---------------------------------------------+
| (X)   [=======progress bar=====      ]  (1)  |  header, 44 pt
|                                             |
|   Instruction line (muted, 15 pt)           |
|   Prompt (22 pt bold) / LaTeX / figure      |
|                                             |
|   [ answer area: cards / input / ordering ] |
|                                             |
+---------------------------------------------+
| [        KONTROLLERA        ]               |  bottom bar, safe area aware
+---------------------------------------------+
```
- **X** (close): confirmation sheet "Quit lesson? You will lose progress in this lesson" with buttons "Keep going" (primary) and "Quit" (danger text).
- **Progress bar**: height 16 pt, radius 8, track `surfaceLip`, fill `accent`. A white `opacity 0.35` highlight stripe 4 pt high near the top inside the fill (gives the glossy pill look). Fill animates with `spring(response 0.45, damping 0.8)`. A small sparkle travels along the fill leading edge on each correct answer.
- **Counter (1)** at right shows lessons left today for free users; hide for Pro.
- The bottom bar is pinned. The main button states: **Check** (disabled until an answer exists) then, after checking, the feedback sheet takes over the bottom bar (Section 6).
- Transitions between exercises: current content slides out left with fade (180 ms) while the next slides in from right (260 ms) with spring. Reduce Motion: crossfade 150 ms.
- Screen never scrolls vertically if content fits; if it does not (long LaTeX, figures), only the middle region scrolls and the bottom bar stays.

### 4.4 Typography
Display 28 pt bold rounded, prompt 22 pt bold rounded, body 17 pt, instruction 15 pt muted. All through `Font.nerd.*` helpers that scale with Dynamic Type via `@ScaledMetric`.

---

## 5. Lesson generation (the engine)

### 5.1 Data model (SwiftData plus JSON content)
```swift
enum CourseID: String, Codable { case matte, hp }

struct Skill: Codable, Identifiable {
  let id: String            // "matte4.komplexa.polar"
  let course: CourseID
  let section: String, unit: String
  let title: LocalizedString, blurb: LocalizedString
  let prerequisites: [String]
  let poolSize: Int
}

enum ExerciseKind: String, Codable {
  case choice          // 4 or 5 options, one correct
  case numeric         // answer typed with MathKeypad
  case orderSteps      // reorder solution steps
  case spotMistake     // tap the first wrong line of a worked solution
  case match           // pair expressions with equivalents
  case graphRead       // tap a point / pick the graph
  case kva             // fixed four options: x>y, x<y, x=y, cannot be determined
  case nog             // sufficiency, fixed options
  case dtk             // chart/table + choice question
}

struct Exercise: Codable, Identifiable {
  let id: String
  let skillID: String
  let kind: ExerciseKind
  let difficulty: Int       // 1...5
  let prompt: LocalizedString          // may contain LaTeX between $...$
  let figure: FigureRef?               // bundled vector image or chart spec
  let options: [LocalizedString]?      // for choice/kva/nog/dtk/match
  let answer: Answer                   // typed enum, see Grader
  let explanation: LocalizedString     // shown in the feedback sheet, 1 to 3 lines
  let steps: [LocalizedString]?        // for orderSteps/spotMistake
  let trap: String?                    // optional tag of the typical mistake, feeds the error log
  let timeHintSeconds: Int?            // HP timed mode
}
```
Content JSON lives in `Resources/Content/<course>/<skillID>.json`. A `ContentValidator` unit test fails the build if any exercise lacks an answer, explanation, or has a duplicate id. A Python tool `Tools/verify_content.py` (SymPy) checks that every `numeric` and `choice` answer for math is actually correct before content ships.

### 5.2 LessonBuilder (deterministic and testable)
`LessonBuilder.build(skill:, level:, profile:, clock:) -> [Exercise]` returns **12 exercises** in this order of difficulty:
1. 2 warm ups: difficulty `max(1, level)`.
2. 6 core: difficulty `level + 1` (clamped 1...5), at least 3 distinct `ExerciseKind`s.
3. 2 challenges: difficulty `min(5, level + 2)`.
4. 2 review: drawn from previously learned skills in the same unit (interleaving). If none exist, draw from the same skill at lower difficulty.
Rules:
- No exercise repeats within a lesson. Prefer exercises the user has not seen in 7 days, then exercises answered wrong before (error driven).
- Never place two exercises of the same kind more than twice in a row.
- Refresh lessons (node needs refresh): 8 exercises, all drawn from items the user got wrong or has not seen for the longest.
- Unit Test: 16 exercises, difficulty 3 to 5, no explanation shown until the end.
- HP "Prov" mode (Practice tab): a timed set mirroring a real sub-test layout (e.g. XYZ: 12 items, 12 minutes). Shown as timed with a countdown ring; no feedback sheet between questions, review at the end.

### 5.3 Wrong answer handling (copy this behaviour exactly)
- A wrong answer is **appended to the end of the queue** once (the same exercise, same position rule: always after the last unseen exercise). If it is wrong a second time, show the explanation and do not re-queue again.
- The progress bar counts exercises completed correctly; the bar can only reach 100 percent when every exercise has been answered correctly at some point.
- Lesson accuracy = first-try-correct / 12.
- A lesson never fails. There is no "out of hearts" ending. The user always finishes by getting everything right eventually or by tapping through explanations.

### 5.4 Skill mastery
`SkillMastery` stores for each skill: `level (0...3)`, `lastPracticedAt`, `ease` (starts 2.5). Update on lesson finish:
- Accuracy >= 0.9: level +1 (max 3), ease +0.1.
- 0.7 <= accuracy < 0.9: level stays if > 0, else becomes 1; ease unchanged.
- accuracy < 0.7: level stays; ease -0.2; schedule a refresh sooner.
Spaced refresh uses the PRD Leitner intervals (1, 3, 7, 14, 30 days) scaled by `ease / 2.5`. When `dueAt <= now` the node shows "Needs refresh".

---

## 6. Feedback system (the most important part of the feel)

### 6.1 Check button
Disabled until an answer is selected/typed. On tap: lock input, evaluate with `Grader`, then present the feedback sheet **in under 100 ms**.

### 6.2 Feedback sheet (bottom, replaces the bottom bar)
Height adapts to content (minimum 150 pt). Slides up with `spring(response 0.35, damping 0.8)`; background is a full-bleed rounded top (radius 24) in `correctTint` or `wrongTint`.
- **Correct**: green check icon in a circle (scale pop), title random from pool ("Rätt!", "Snyggt!", "Exakt!", "Bra jobbat!"), optional line "Streak i lesson: 4 i rad" when combo >= 3. Button: `.success` "FORTSÄTT" / "CONTINUE".
- **Wrong**: red cross icon (shake), title "Inte riktigt" / "Not quite", then **the correct answer** rendered in LaTeX, then the `explanation` (1 to 3 lines) with a collapsible "Visa lösningen" / "Show solution" that reveals `steps` one by one. Button: `.danger` "FORTSÄTT" / "CONTINUE". The wrongly selected input stays visible above.
- Small flag icon at the right opens "Report a problem with this question" (stores `exerciseID` + note locally and queues for upload when a backend exists).
- Tapping Continue dismisses the sheet (slide down 200 ms) and advances.
- The sheet is reachable by VoiceOver first when presented (post `UIAccessibility.post(.screenChanged)`).

### 6.3 Sound and haptics table
Sounds are short (under 400 ms), bundled `.caf`, played via `AVAudioPlayer` on an ambient session (respects the silent switch). **Never reuse any third party app's sounds.** Generate original tones (simple sine/FM tones synthesized offline) and document in `Resources/Sounds/LICENSES.md`.

| Event | Haptic | Sound |
|---|---|---|
| Select an option | `.selection` | `tap` soft pop |
| Press chunky button | `.impact(.soft)` | none |
| Correct | `.success` | `correct` rising two-note; pitch rises by 1 semitone per consecutive correct, capped at +8, reset on wrong |
| Wrong | `.warning` (single) | `wrong` low soft thud (never harsh) |
| Combo milestone (3, 5, 8 in a row) | custom CoreHaptics (two taps then a rise) | `combo` sparkle |
| Lesson complete | `.success` then a 3-pulse pattern | `complete` fanfare 1 s |
| Streak extended | heavy impact + `.success` | `streak` whoosh + chime |
| Node unlock | `.success` | `sparkle` |
| Error shake (locked node) | `.warning` | none |
Add a Profile setting: **Sound** on/off and **Haptics** on/off. Respect both everywhere through `Haptics.swift` and `Sound.swift`, never call platform APIs from views directly.

### 6.4 In-lesson combo
Track `consecutiveCorrect`. At 3, 5, 8 show a small pill under the progress bar for 1.2 s ("3 i rad", "5 i rad!", "8 i rad!!") that scales in with spring and fades. Combo does not carry across lessons.

---

## 7. Exercise types: exact UI and grading

### 7.1 `choice`
Vertical stack of up to 5 `ChoiceCard`s (HP XYZ uses 5 options, others 4). Single select, tapping again deselects. Option order is shuffled per attempt except for KVA/NOG, which have **fixed order**. Grader: exact match on option index.

### 7.2 `numeric` (the key math input)
- Prompt on top, a large **answer field** (min height 64 pt, radius 16, 2 pt border) showing the typed expression rendered live with SwiftMath.
- Custom **MathKeypad** replaces the system keyboard (never present the system keyboard). Layout (4 rows, 5 columns):
  - Row 1: `7 8 9 ÷ ⌫`
  - Row 2: `4 5 6 · (` ... `)`
  - Row 3: `1 2 3 - +`
  - Row 4: `0 , a/b √ x^`
  - Row 5 (collapsible "more" row): `π e ± ln sin cos`
  The **decimal comma** is the default in Swedish locale and the decimal point in English. Accept both in input regardless of locale.
- `a/b` inserts a fraction template with the cursor in the numerator; `x^` inserts a superscript template; `√` inserts a root template. Cursor navigation: left/right arrows appear in a slim bar above the keypad when a template is active.
- **Grading must accept equivalent forms** (this is required, otherwise the app feels broken):
  1. Parse the input to an AST with `MathExpression.parse` (own small recursive descent parser: numbers, decimals with comma or point, + - · * / ^, parentheses, `sqrt`, `pi`, `e`, `ln`, `sin`, `cos`, `tan`, implicit multiplication like `2x` and `2(x+1)`, fractions as `/`).
  2. If the expected answer has no variables: evaluate both numerically (Double) and compare with relative tolerance `1e-9`, plus accept if the exact rational equivalent matches.
  3. If it has variables (e.g. an expression answer): evaluate both at **8 random points** (avoid poles, use values in -3...3 excluding 0 and 1) and require all within `1e-7`.
  4. Never mark an unparseable input as wrong; show a "Check your input" inline message and keep the Check button available.
- Units and rounding: if the exercise has `roundTo`, accept values within half a unit of the last place.
- Unit tests: at least 40 cases, including `0,5 == 1/2`, `2x+2 == 2(x+1)`, `sqrt(8) == 2*sqrt(2)`, `x^2-1 == (x-1)(x+1)`.

### 7.3 `orderSteps`
A vertical list of 4 to 7 solution step cards (LaTeX), initially shuffled. User drags to reorder (`onMove` with custom drag handles, haptic tick `.selection` on each swap, cards animate with spring). Grader: exact order match. Feedback shows the correct order with numbered badges.

### 7.4 `spotMistake`
A worked solution of 4 to 6 lines. One line contains an error. User taps that line (card style like choices). Feedback shows the line, the fix, and the `trap` tag (e.g. "teckenfel", "glömde kedjeregeln"). This type is the highest value for advanced math because it trains error detection.

### 7.5 `match`
Two columns of 4 pairs (expression to equivalent). Tap one on the left then one on the right; a correct pair locks with a green pulse and disappears with scale down; a wrong pair shakes and resets. No Check button; the exercise auto-completes when all pairs match; a wrong pair counts as one mistake (one mistake max per exercise for accuracy).

### 7.6 `graphRead`
Renders a function plot with Swift Charts (`LineMark`, axes in `muted`) or a bundled vector figure. Question types: pick the correct graph (4 thumbnails), or tap a point on the plot (hit test within 24 pt tolerance, snapped to nearest candidate). Figures are generated from a spec, not images, so they stay crisp and localize.

### 7.7 HP specifics
- **`kva`**: two quantities shown side by side in cards labeled "Kvantitet I" and "Kvantitet II", four fixed options: "I är större", "II är större", "I och II är lika stora", "Informationen är otillräcklig". Show the trick badge when the unit teaches it (e.g. "Try x = 0, 1, -1").
- **`nog`**: statement, two numbered pieces of information, five fixed sufficiency options. Exact wording of the five official options is `[VERIFY from an official provpass]`; do not invent it. Use the wording found in the official PDFs.
- **`dtk`**: a chart or table (Swift Charts / native `Grid`), then a choice question. Pinch to zoom the figure; the figure stays visible above the options.
- **Timed Prov mode** shows a ring timer in the header and a skip arrow (skipped items return at the end). No feedback sheet until the review screen.

---

## 8. Completion flow, XP, streak, daily goal

### 8.1 XP
`XP = 10 (base) + 5 (if accuracy == 100%) + 3 (if max combo >= 5)`. Unit Test: base 20. Refresh lesson: base 5. Timed Prov: 1 XP per correct answer. All values in `Tuning.swift`. XP only ever increases. Store total XP and per-day XP.

### 8.2 Lesson complete screen (in this order, each is a full screen with a Continue button)
1. **Lesson complete**: big check animation, three stat cards animate in with stagger (80 ms): **XP gained** (count up), **Accuracy** (percent, count up), **Time** (mm:ss). Confetti burst (30 particles, 1.2 s). `complete` sound and haptic. If the lesson raised the node's level, show the level dots filling.
2. **Streak extended** (only if today is not yet counted): flame icon scales in with glow, number counts up from the old to the new value, a 7-day row of circles (M T W T F S S) with today's circle filling with a check and the flame. Text "5 dagars streak!" / "5 day streak!". `streak` sound + heavy haptic.
3. **Daily goal reached** (only the first time today the goal is met): ring animation to full.
4. **Rating prompt**: ask for an App Store rating **once**, only after the 3rd lesson ever completed with accuracy >= 90 percent and never inside the first 24 hours. Use `SKStoreReviewController` (system controlled, no custom copy).
5. Back to Path with the scroll and unlock animation (Section 3.5).
Skip steps 2 to 4 silently when not applicable. The flow must never show more than 4 screens.

### 8.3 Streak rules
- A day counts when the user **completes at least one lesson** (any kind, including refresh) in the local calendar day.
- Streak = consecutive counted days ending today or yesterday. Missing a day resets to 0, unless a **Streak Freeze** covers it.
- **Streak Freeze**: protects one missed day automatically. Free users earn 1 freeze at every 7 day streak milestone (max 2 stored). Pro users have 2 stored at all times, refilled monthly. Using a freeze shows a banner next day ("A freeze saved your streak").
- Streak store functions are pure and take `Clock`. Unit tests must cover: same day twice, next day, skipped day with and without freeze, daylight saving change, time zone change, leap day.
- Streak display: flame icon in the Path top bar. Flame color: gray when today is not yet counted, orange when counted. A subtle pulse on the flame when not counted and it is after 18:00 local time.
- The streak number in the top bar animates (scale pop) when it increments.

### 8.4 Daily goal
Chosen in onboarding (add this to onboarding screen 5): **Chill 10 XP, Steady 20 XP, Serious 30 XP, Insane 50 XP**; default Steady. Shown as a ring on the Profile tab and a small progress strip under the Path top bar. Changing it applies from the next day.

### 8.5 Notifications (friendly, no guilt)
Local only, max 1 per day: a reminder at the user's chosen time, and (if streak >= 3) a "Your 5 day streak is waiting" evening nudge if not yet counted. Copy is encouraging, never shaming, never fake urgency. Streak loss aversion is a strong lever and the audience includes minors, so keep it positive. Stop all nudges after 3 ignored days in a row.

---

## 9. Free versus Pro (the gate)

Replace Duolingo's hearts and energy with a simpler model that does not punish mistakes (Duolingo itself moved from hearts to energy in 2025 to reward correct answers instead of punishing errors, per [their announcement](https://blog.duolingo.com/duolingo-energy/)).

| | Free | Pro |
|---|---|---|
| Lessons per day | **3**, resets at local midnight | Unlimited |
| Scans per day | 2 | Unlimited (fair use) |
| Mistake cost | none | none |
| Extra lesson | +1 lesson for completing a **Mistakes Review** (6 exercises from the user's wrong answers), max +2 per day | n/a |
| Unit Tests | yes (counts as a lesson) | yes |
| Guidebooks | first unit of each course | all |
| Timed Prov mode | 1 per week | unlimited |
| Streak freezes | earned (max 2) | 2 always |

Behavior:
- Starting a lesson consumes one daily lesson **when the first answer is submitted**, not when opened, so abandoning immediately is free.
- When 0 remain: tapping any node opens the **out of lessons sheet**: "You are out of lessons today" with big primary "Go Pro" (opens paywall), secondary "Earn 1 more with a Mistakes Review", tertiary "Come back tomorrow" and a live countdown to midnight.
- A Mistakes Review lives in the Practice tab and is always available (it is also free of the daily count).
- All gating is in one place: `EntitlementGate.canStart(lessonKind:) -> GateResult` backed by RevenueCat's `pro` entitlement. Views never read entitlement directly.
- Paywall triggers: the out of lessons sheet, tapping a locked Pro feature, and the end of the third lesson on the first day (soft, dismissible).

---

## 10. Practice tab

Cards (vertical list, each a large rounded card with an icon):
1. **Mistakes Review**: count badge of stored mistakes; starts a 6 exercise set.
2. **Weak spots**: the 3 skills with lowest ease; tap to start a refresh lesson on that skill.
3. **Timed test (HP)**: choose sub-test (XYZ, KVA, NOG, DTK), see the official recommended time, start. After finishing: score, time per question, errors by type.
4. **Focus timer (25/7)**: starts the PRD focus timer; a session may include several lessons; the break screen shows the break reward chosen in onboarding.
5. **Error log**: top error types from `trap` tags and the "why did I miss this" chips.

---

## 11. Profile tab
Header with avatar placeholder (initials), total XP, streak, level of mastery (count of gold nodes). Weekly XP bar chart (Swift Charts, 7 bars, today highlighted). Daily goal ring and edit. Settings list (language, sound, haptics, notifications time, subscription, restore, privacy, terms, delete data). **Founder card** at the bottom ("Why I built this", with the verified stats only if the proof asset exists, see PRD Section 0).

---

## 12. State machine for the lesson player (implement exactly)

```swift
@Observable final class LessonSession {
  enum Phase { case answering, feedback(correct: Bool), finished }
  private(set) var queue: [Exercise]          // remaining, in order
  private(set) var current: Exercise?
  private(set) var phase: Phase = .answering
  private(set) var firstTryCorrect = 0
  private(set) var total: Int                 // initial count, always 12 (or 8/16)
  private(set) var completedCorrect = 0       // drives the progress bar
  private(set) var consecutiveCorrect = 0
  private(set) var maxCombo = 0
  private var retried: Set<String> = []       // exercise ids already re-queued
  let startedAt: Date

  func submit(_ input: AnswerInput) {
    guard case .answering = phase, let ex = current else { return }
    let correct = Grader.grade(ex, input)
    if correct {
      completedCorrect += 1
      consecutiveCorrect += 1; maxCombo = max(maxCombo, consecutiveCorrect)
      if !retried.contains(ex.id) { firstTryCorrect += 1 }
    } else {
      consecutiveCorrect = 0
      if !retried.contains(ex.id) { retried.insert(ex.id); queue.append(ex) }
      else { completedCorrect += 1 }       // second miss: move on, count it done
    }
    phase = .feedback(correct: correct)
  }

  func advance() {
    queue.removeFirst()
    current = queue.first
    phase = current == nil ? .finished : .answering
  }
  var progress: Double { Double(completedCorrect) / Double(total) }
}
```
Add unit tests: all correct, all wrong once, wrong then right, wrong twice, queue ordering, combo reset, progress reaches exactly 1.0 at finish, quitting mid lesson does not change mastery or XP.

---

## 13. Tuning file (single source for numbers)

`Tuning.swift`:
```swift
enum Tuning {
  static let lessonLength = 12, refreshLength = 8, unitTestLength = 16
  static let xpBase = 10, xpPerfectBonus = 5, xpComboBonus = 3
  static let xpUnitTestBase = 20, xpRefreshBase = 5
  static let freeLessonsPerDay = 3, freeScansPerDay = 2, maxBonusLessonsPerDay = 2
  static let unitTestPassRatio = 0.8
  static let comboMilestones = [3, 5, 8]
  static let maxCorrectPitchSemitones = 8
  static let leitnerDays = [1, 3, 7, 14, 30]
  static let streakFreezeEveryDays = 7, maxStoredFreezesFree = 2, freezesPro = 2
  static let dailyGoalXP = ["chill": 10, "steady": 20, "serious": 30, "insane": 50]
  static let pathSineAmplitude: CGFloat = 56, nodeSize: CGFloat = 76, nodeSpacing: CGFloat = 28
}
```
No other file may contain these values.

---

## 14. Cut list (do NOT build)
Leagues and leaderboards, gems or any virtual currency, shop, hearts, energy meters, friends, friend streaks, follow/feed, daily and monthly quests, chests, badges beyond node levels, mascot or character animations, stories, podcasts, ads, video lessons, chat tutor (the PRD's scan follow-up question stays in Scan only), speech exercises, social sharing beyond the PRD share card, AI generated lessons at runtime (content is pre-authored and verified). If you believe one of these is needed, write it in `DECISIONS.md` and stop; do not build it.

---

## 15. Seed content required to make the loop real (acceptance needs it)

Create enough original, verified content to test the loop end to end:
- **Matematik, Matte 4, unit "Komplexa tal"**: 5 skills x 30 exercises each (150 total), mix of `choice`, `numeric`, `orderSteps`, `spotMistake`, `match`, with Guidebook cards.
- **Högskoleprovet, unit "Jämförelsetekniken" (KVA)**: 4 skills x 30 exercises (120), and **unit "Procent och förändringsfaktor" (XYZ)**: 4 skills x 30 exercises (120).
- All math verified by `Tools/verify_content.py`. The agent must not mark content as done if any item is unverified. All Swedish text native quality, no machine-literal phrasing. English translations for all.
- All other nodes ship as locked "Coming soon" stubs.
Official Högskoleprov test text must **not** be bundled until usage rights are confirmed (PRD Section 9). Write original items modeled on the official formats.

---

## 16. Build order (do in this order, commit after each, run tests each time)

1. `Tokens.swift`, `Tuning.swift`, `Clock`, `Haptics`, `Sound`, `ChunkyButtonStyle`, `ChoiceCard`, `ProgressBarView`. Gallery screen to inspect all components in light, dark, Dynamic Type XXL.
2. Models, content loader, `ContentValidator` test, 20 sample exercises.
3. `Grader` + `MathExpression` parser + tests (40+ cases). **Do not proceed until all pass.**
4. `LessonBuilder` + `LessonSession` + tests.
5. Lesson player UI for `choice` first, then feedback sheet, then `numeric` with `MathKeypad`, then `orderSteps`, `spotMistake`, `match`, `graphRead`, `kva`, `nog`, `dtk`.
6. Completion flow: XP, streak, daily goal, rating prompt rule, stores and tests.
7. Path UI: nodes, banners, states, Start sheet, unlock animation, top bar.
8. Free/Pro gate with RevenueCat, out of lessons sheet, Mistakes Review.
9. Practice tab, Profile tab, notifications, Guidebooks.
10. Polish: Reduce Motion, VoiceOver pass, performance pass (Instruments), localization pass.

---

## 17. Acceptance tests (all must pass before you say done)

1. From a fresh install, after onboarding, the user reaches the first exercise in 3 taps or fewer.
2. A complete lesson of 12 exercises runs end to end with feedback sheets, re-queued mistakes, XP, accuracy and time on the completion screen.
3. Entering `0,5`, `.5`, `1/2` all pass for an expected `1/2`. `2x+2` passes for `2(x+1)`. An unparseable input never counts as wrong.
4. Wrong answers are re-queued exactly once and the bar reaches 100 percent only at the end.
5. Streak: a lesson on day 1 and day 2 gives 2; skipping day 3 resets to 0 without a freeze and keeps 2 with one (tested with injected clock including a DST change).
6. After 3 lessons a free user sees the out of lessons sheet; a Mistakes Review earns 1 more; a Pro sandbox purchase removes the limit immediately.
7. The Path shows locked, current, in progress, mastered and needs refresh states correctly for seeded data, auto scrolls to the current node, and plays the unlock animation.
8. Every sound and haptic in Section 6.3 fires on the right event and respects the Sound/Haptics settings and the silent switch.
9. Reduce Motion, Dark Mode, Dynamic Type XXL and VoiceOver all work for Path and Lesson.
10. No file other than `Tuning.swift` contains tunable numbers; no hardcoded strings; no secrets; no use of any third party brand name, mascot or asset.
11. Unit tests green for Grader, MathExpression, LessonBuilder, LessonSession, StreakStore, XPStore, EntitlementGate, SkillMastery.

When finished, output: what you built, what is stubbed, every decision you made that this file did not specify, and the list of `[VERIFY]` items still open.

---

## Sources
- [Duolingo blog: Duolingo energy (hearts replaced by energy)](https://blog.duolingo.com/duolingo-energy/)
- [UX Design: Duolingo's small UI switch that changes everything](https://uxdesign.cc/duolingos-small-ui-switch-that-changes-everything-fae257203633)
- [Desirability Lab: Duolingo streak design](https://desirabilitylab.com/backfill/backfill-2025-46-duolingo-streak-design)
- [eLearning Industry: Duolingo gamified language learning](https://elearningindustry.com/duolingo-gamified-language-learning)
- [HP provpass 1 Kvant, studera.nu](https://www.studera.nu/globalassets/hogskoleprovet/hp-2022-05-07/provpass-1-kvant.pdf)
