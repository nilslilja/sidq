# How subscription apps make people pay, and what Nerdbase should do

Purpose: reverse engineer the payment mechanics of successful subscription and edtech apps, then turn them into a concrete Nerdbase monetization design with experiments. Companion to `PRD_V2.md`.

Evidence rule: every number has a source link or is marked `[not verified]` or `unknown`. Sources are mostly secondary coverage of vendor reports, so treat numbers as directional and re-measure on your own traffic.

---

## 0. Verdict (read this first)

**Wrong: freemium with no trial at a price 2x the nearest competitor is the lowest converting combination.**
1. Hard paywall apps show a median Day 35 conversion of about 10.7% versus about 2.1% for freemium, and median revenue per install at Day 14 of $2.32 versus $0.27. Year one annual retention is about the same (27% hard, 28% freemium). Source: [RevenueCat 2026 benchmarks](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026), coverage via [SaaStr](https://saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps-how-115000-mobile-apps-deliver-16b-in-revenue-whats-working-whats-quietly-killing-growth). The exact metric definition is not verified in the secondary coverage.
2. Your yearly price of $144 is about 2x Photomath Plus ($69.99 a year) and about 2.4x Gauth Plus ($59.99 a year). Sources: [Android Central](https://www.androidcentral.com/apps-software/google-unveils-photomath-app), [Gauth review](https://www.aichatdaily.com/tools/gauth). One aggregator lists a different Photomath annual price, so re-check both on the App Store.
3. Longer trials lift annual conversion (24% for 4 days or less, 44.6% for 17 to 32 days, per [SaaStr on RevenueCat data](https://saastr.com/what-17000-subscription-apps-tell-us-about-free-trial-length-annual-plans-convert-86-better-with-30-day-trials-monthly-tops-out-at-two-weeks-and-ai-apps-hit-a-wall-at-16-days)). This is correlation across apps, not a controlled test.

**Recommended launch configuration (one recommendation, confidence medium):**
- Multi page paywall at the end of onboarding (Superwall data: 12.41% multi page vs 9.07% single page, [Superwall](https://www.superwall.com/blog/new-postmulti-page-onboarding-paywalls-convert-37-better-than-single-page-heres-why)).
- Launch **A/B from day one: freemium (your current design) versus hard paywall with 7 day trial on the yearly plan**. Ship the winner by revenue per install at Day 14. Decision rule in Section 6.
- Launch yearly at **$99** with monthly at **$19.99** (the monthly price is the anchor; yearly shows as about 59% cheaper). Keep $144 as a test arm. Prices live in RevenueCat and App Store Connect so they change without an app release. Confidence low to medium: no evidence here says $99 beats $144, it simply moves you closer to the market. Test it.

---

## 1. Funnel anatomy

```
Install -> Onboarding -> Aha moment -> Paywall -> Trial/Purchase -> Renewal -> (Win-back)
```
| Stage | What decides it | Benchmark (source) | Nerdbase lever |
|---|---|---|---|
| Install to onboarding complete | Short, personal, fast | unknown | 8 screens, one idea each |
| Trials start on Day 0 | Onboarding is the sale | 82% of trials start Day 0 ([RevenueCat SOSA 2025 via Airbridge](https://www.airbridge.io/en/blog/paywall-conversion-structural-decisions)) | Paywall inside onboarding |
| Paywall to trial or purchase | Page count, price framing | 12.41% multi page vs 9.07% single page ([Superwall](https://www.superwall.com/blog/new-postmulti-page-onboarding-paywalls-convert-37-better-than-single-page-heres-why)) | 2 to 3 page paywall |
| Download to paid, Day 35 | Hard vs freemium | 10.7% vs 2.1% median ([RevenueCat 2026](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)) | A/B test |
| Annual plan first month cancel | Value felt, expectation set | about 30% cancel in month one ([RevenueCat 2025 coverage](https://subscriptioninsider.com/article-type/news/revenuecats-state-of-subscription-apps-2025-report-ais-dominance-retention-challenges-and-the-shift-away-from-pure-subscriptions)) | Progress recap, streak, renewal reminders |
| Annual retention at 1 year | Habit | about 27% to 28% median ([RevenueCat 2026](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)) | Learning loop and streak |
| Paid share of active users, at scale | Freemium at huge scale | Duolingo about 9% of MAU paid ([Duolingo 10-K FY2025](https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm)) | Do not copy their free model without their scale |

Important: Duolingo's 9% is a freemium result at over 130 million MAU with huge organic reach. Hard paywall data suggests small apps without that reach earn more per install by asking earlier. This is the core reason to test.

---

## 2. The 12 mechanics (what they do, why it works, what Nerdbase does)

### 1. Personalization quiz before the ask
- **What:** 5 to 9 questions (goal, level, date, daily time). Answers visibly shape the plan.
- **Why it works:** commitment and consistency, plus sunk effort. The user has invested before seeing a price.
- **Nerdbase:** goal, course, exam date, daily goal, blocks per day, break reward, interests. The plan reveal must truly use these answers.
- **Rule:** never fake the computation. A loading animation is fine only if the output is genuinely derived from the answers.

### 2. Value before the ask (aha moment)
- **What:** Duolingo lets a new user finish a lesson before any signup. Scan apps show a solved problem in the first minute.
- **Why:** the user feels the benefit before being asked to pay.
- **Nerdbase:** onboarding screen 6 is a live demo scan; first lesson is available before the paywall closes. Aha metric to track: percent who complete one lesson or one scan in session 1.

### 3. Multi page paywall
- **What:** 2 to 3 screens that sell the outcome, then the plans.
- **Why:** Superwall measured 12.41% vs 9.07% conversion (37% relative lift), on about 40 million onboarding paywall opens. Vendor data, not a controlled test.
- **Nerdbase:** page 1 outcome and method, page 2 what you unlock (with real screenshots), page 3 plans.

### 4. Plan framing
- **What:** annual pre selected, monthly as anchor, per month equivalent shown, savings badge.
- **Why:** anchoring and default effects.
- **Apple constraint:** the billed amount must be the most conspicuous price on screen; trial or per month figures must be visually subordinate ([forum reports of rejections](https://developer.apple.com/forums/thread/127616), secondary, check the live guideline at developer.apple.com).
- **Nerdbase:** the yearly card shows "$99 per år" in the largest type and "$8,25 per månad" smaller. Compute per month from the store price, never hardcode.

### 5. Trial
- **What:** 3 to 7 days is most common; some apps go longer.
- **Why:** lowers perceived risk; most trials start Day 0.
- **Risk:** trial abuse and surprise charges cause refunds and one star reviews.
- **Nerdbase:** 7 day trial on the yearly plan only (test arm B). Reminder notification on day 5 stating the date and price. Paywall states the renewal clearly (Apple requires clear disclosure, see Section 7).

### 6. Usage metering (free limits that bite)
- **What:** Duolingo limits free mistakes (hearts, now energy for free users, announced July 2025, [Duolingo](https://blog.duolingo.com/duolingo-energy/)). Photomath keeps step by step behind Plus. Gauth limits advanced features daily ([review](https://www.aichatdaily.com/tools/gauth)).
- **Why:** the user hits the limit at a moment of high intent.
- **Nerdbase:** 3 lessons and 2 scans per day. Mistakes never cost anything. Limit hit opens the out of lessons sheet (paywall trigger).

### 7. Streaks and loss aversion
- **What:** daily streak, freezes, friendly nudges.
- **Why:** losing something hurts more than gaining the same (loss aversion, per secondary analyses of Duolingo's design). It raises retention, which drives lifetime value.
- **Nerdbase:** streak with earned freezes (see `XCODE_PROMPT_CORE_LOOP.md` Section 8). Guardrail: the audience includes minors, so nudges stay encouraging, one per day, stop after 3 ignored days.

### 8. Paywall at high intent moments
- **What:** the paywall reappears when the user hits a limit, taps a locked feature, or finishes a great session.
- **Nerdbase triggers:** out of lessons, out of scans, tapping a Pro feature (timed tests beyond 1 per week, full Nerd Method), 3rd lesson completed on day 1 (dismissible).

### 9. Social proof
- **What:** ratings, user counts, testimonials.
- **Nerdbase rule:** use only real numbers. At launch you have none, so use the founder story (with proof) and no fake counts. Add real ratings after the first reviews.

### 10. Exit offer and win back
- **What:** closing the paywall shows a one time discount or a longer trial; lapsed users get a win back offer.
- **Why:** captures price sensitive users. One vendor case study reports a 240% lift in trial starts from targeting unsubscribed users with an extra trial offer (anecdotal, vendor published, [Superwall](https://superwall.com/solutions/by-team/marketers)).
- **Nerdbase:** v1.1, not MVP. Use App Store promotional offers via RevenueCat. Do not stack it on day one; you need a baseline first.

### 11. Price localization and family or parent paths
- **What:** local price points; family plans (Duolingo has one).
- **Nerdbase:** App Store local price tiers (SEK in Sweden). Your buyer is often a parent, because users are 16 to 19. Add "Skicka till förälder" on the paywall (share sheet with a link) and enable Family Sharing on the subscription `[VERIFY in App Store Connect]`.

### 12. Renewal management
- **What:** value recap before renewal, easy cancel, no dark patterns.
- **Why:** about 30% of annual subscribers cancel in the first month; a clear value story and honest terms reduce refunds and bad reviews.
- **Nerdbase:** week 3 and pre renewal "your progress" recap (XP, nodes mastered, streak). Manage subscription link in Profile.

---

## 3. Competitor pricing snapshot (re-verify before launch)

| App | Monthly | Annual | Notes | Source |
|---|---|---|---|---|
| Photomath Plus | $9.99 | $69.99 (one aggregator says $59.99) | 7 day trial per 2026 review | [Android Central](https://www.androidcentral.com/apps-software/google-unveils-photomath-app), [review](https://www.myengineeringbuddy.com/blog/photomath-reviews-alternatives-pricing-offerings/) |
| Gauth Plus | $7.99 | $59.99 | Free tier with daily limits | [review](https://www.aichatdaily.com/tools/gauth) |
| Brainly, Quizlet Plus, Duolingo Super | not verified | not verified | look up on the App Store | n/a |
| **Nerdbase (your plan)** | $20 | $144 | 2x the nearest annual | this doc |
| **Nerdbase (recommended)** | $19.99 | $99 | monthly is the anchor | this doc |

Why you can charge more than a scan app: scan apps sell answers; Nerdbase sells a score outcome (advanced math, högskoleprovet, the Nerd Method). That story must be visible in the paywall and screenshots, otherwise buyers compare you to a $60 scanner.

---

## 4. Nerdbase monetization design (final)

### 4.1 Offering
| Item | Value |
|---|---|
| Entitlement | `pro` |
| Offering | `default` (RevenueCat), with experiment variants |
| Products | `nerdbase_pro_monthly`, `nerdbase_pro_yearly` |
| Trial | Arm A: none. Arm B: 7 days on yearly only |
| Free tier | 3 lessons per day, 2 scans per day, 1 timed test per week, first unit of each guidebook |
| Pro | unlimited everything, full Nerd Method, all timed tests, full error log insights |

### 4.2 Paywall pages (arm B and arm A share copy; only the offer differs)
1. **Outcome:** "Plugga smartare, inte längre." Method card (25 / 7, test yourself, space it) plus the founder line.
2. **What you unlock:** four real screenshots (scan solution, path, timed test, error log) with one line each.
3. **Plans:** yearly selected. Billed amount largest. Terms line directly under the button. Restore, Terms, Privacy links. Close button after 2 seconds. "Skicka till förälder" link.

### 4.3 Triggers (event, placement id)
`onboarding_end`, `limit_lessons`, `limit_scans`, `locked_timed_test`, `locked_nerd_method`, `after_lesson_3_day1`, `profile_upgrade_card`. One paywall component, placement decides copy.

### 4.4 Guardrails (non negotiable)
- No fake countdowns, fake scarcity, fake user counts or fake testimonials.
- Price, billing period and auto renewal stated in plain language next to the button.
- Easy cancel path linked from Profile (`https://apps.apple.com/account/subscriptions`).
- Minors: no guilt notifications; cap one per day; stop after 3 ignored days.
- Do not call Högskoleprovet content "official" unless it is the real published test.
- Founder stats shown only with proof on file.

---

## 5. Unit economics model (fill with your own numbers)

Do not trust any single number until measured. Variables:

- `P_m`, `P_y`: monthly and yearly store price (net of VAT where Apple handles it).
- `c`: Apple commission. Standard 30%, 15% for the Small Business Program (under $1M proceeds) and 15% on subscriptions after a subscriber's first year `[VERIFY on developer.apple.com]`.
- `cps`: AI cost per scan (unknown until measured with real model pricing and real image sizes).
- `s`: average scans per active user per month (unknown).
- `a`: other variable cost per user per month (backend, analytics) (unknown).
- `r_m`: month one renewal rate; use about 70% as a placeholder for annual plans per the cited 30% first month cancel, then replace with your own.
- Contribution per yearly subscriber (year one) = `P_y × (1 − c) − 12 × (s × cps + a)`.
- Break even paid conversion for an acquisition cost per install `CPI`: `CPI / (P_y × (1 − c) × share_yearly − cost)`. Compute once you have CPI. Unknown today.
- Free users also cost money: each free scan costs `cps`. Cap free scans (2 per day) and cache identical problems.

Measure in week one of beta: real `cps`, real scans per user, trial to paid, month one cancels. Then set price.

---

## 6. Experiment backlog (run one at a time, in this order)

| # | Test | Metric | Decision rule |
|---|---|---|---|
| 1 | Freemium vs hard paywall (7 day trial on yearly) | Revenue per install at Day 14 | If hard is at least 2x freemium and D7 retention is not worse by more than 20% relative, ship hard. Otherwise keep freemium. Sample size needed: unknown, plan for thousands of paywall views before trusting a result |
| 2 | Yearly $99 vs $144 | Revenue per paywall view | Pick higher revenue per view, not higher conversion |
| 3 | Paywall copy: outcome headline vs feature headline | Paywall to purchase rate | Winner stays |
| 4 | Trial length 3 vs 7 days | Trial to paid and refunds | Pick higher net revenue |
| 5 | Plan reveal with vs without loading animation | Onboarding completion and paywall conversion | Keep if no drop |
| 6 | Exit offer on paywall close | Incremental purchases | Keep only if net positive after discount |
| 7 | Pre renewal recap notification | Month one annual cancel rate | Keep if cancels drop |

Rules: one variable per test; stop a test only after your pre set sample size; log every exposure in analytics.

---

## 7. Apple compliance checklist (paywall and subscription)

Secondary sources, confirm on developer.apple.com before submission.
- Show subscription length, price and what the user gets. Billed amount most prominent; trial and per month figures subordinate ([forum](https://developer.apple.com/forums/thread/127616), [overview](https://ptkd.com/app-store/guidelines/3-1-2)).
- State clearly that the subscription renews automatically and how to cancel.
- Functional links to Privacy Policy and Terms of Use (Apple's standard EULA is acceptable).
- Restore Purchases visible.
- Trial: state the price that starts after the trial.
- Metadata (App Store description) repeats the renewal and cancellation terms.

---

## 8. Metrics to instrument from day one

`onboarding_step_viewed(step)`, `onboarding_completed`, `first_lesson_completed`, `first_scan_completed`, `paywall_viewed(placement, variant)`, `plan_selected(plan)`, `purchase_started`, `trial_started`, `purchase_succeeded`, `purchase_cancelled`, `limit_hit(type)`, `restore_tapped`, `d1/d7/d30 retention`, `annual_cancel_month1`, `refund`. Dashboard: revenue per install by variant at D7, D14, D35; paywall view to purchase; trial to paid.

---

## Sources
- [RevenueCat: subscription app trends and benchmarks 2026](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)
- [SaaStr: top learnings from RevenueCat State of Subscription Apps](https://saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps-how-115000-mobile-apps-deliver-16b-in-revenue-whats-working-whats-quietly-killing-growth)
- [Subscription Insider: RevenueCat 2025 report coverage](https://subscriptioninsider.com/article-type/news/revenuecats-state-of-subscription-apps-2025-report-ais-dominance-retention-challenges-and-the-shift-away-from-pure-subscriptions)
- [SaaStr: free trial length data](https://saastr.com/what-17000-subscription-apps-tell-us-about-free-trial-length-annual-plans-convert-86-better-with-30-day-trials-monthly-tops-out-at-two-weeks-and-ai-apps-hit-a-wall-at-16-days)
- [Superwall: multi page onboarding paywalls](https://www.superwall.com/blog/new-postmulti-page-onboarding-paywalls-convert-37-better-than-single-page-heres-why)
- [Airbridge: paywall conversion structural decisions](https://www.airbridge.io/en/blog/paywall-conversion-structural-decisions)
- [Duolingo FY2025 10-K](https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm)
- [Duolingo: energy replaces hearts](https://blog.duolingo.com/duolingo-energy/)
- [Android Central: Photomath pricing](https://www.androidcentral.com/apps-software/google-unveils-photomath-app)
- [Gauth review](https://www.aichatdaily.com/tools/gauth)
- [Apple developer forum: pricing rejection](https://developer.apple.com/forums/thread/127616)
