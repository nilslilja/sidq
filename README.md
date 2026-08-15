# Sidq

One clear day, rebuilt every morning.

A web app that turns a distractible brain's scattered goals into a single honest daily
plan. Web only, PWA-installable, no native app.

---

## Run it

```bash
npm install && npm run dev
```

It works with **zero configuration**. With no backend configured the app runs the whole
loop against `localStorage` and a local heuristic planner, and labels every generated
plan `DEMO PLAN` in the UI. That fallback exists so the app is never a dead screen —
it is not the product, and nothing about real plan quality should be inferred from it.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :5173 |
| `npm run build` | Typecheck + production build |
| `npm test` | Full unit suite (79 tests) |
| `npm run eval` | **The gate.** Runs the planner prompt against real fixtures |
| `npm run eval:offline` | Renders the prompts without an API call or a key |

---

## The gate — do this before trusting anything else

Build order step 1 is "nail the prompt, gate everything on this." That is a repeatable
command rather than a one-off manual check:

```bash
export ANTHROPIC_API_KEY=sk-ant-... && npm run eval
```

It runs the prompt against eight fixtures, each probing one specific failure mode
(overload, carryover rot, vague goals, a meeting-heavy day, degenerate empty input),
grades every result, prints the plans, and **exits non-zero on any error-level
violation**. Wire it into CI and the core IP cannot silently rot.

Automated checks are the floor, not the bar. The real question the eval cannot answer
is *would you actually work this day* — read the printed plans.

**Before you rely on it:** open `prompt/eval/fixtures.ts` and replace the `real-week`
fixture's goals and derailers with your actual ones. It currently holds a plausible
stand-in, not your week.

### Where the prompt lives

`supabase/functions/_shared/prompt.ts` — one file, imported by both the edge function
and the eval harness, so the thing you evaluate is byte-identical to the thing that
ships. Edit the prompt there and nowhere else.

`supabase/functions/_shared/plan.ts` holds two deliberately separate tiers:

- **`parsePlan`** — lenient, never throws. Strips fences and prose, snaps off-spec
  durations, reorders so the named priority is first, falls back to reading prose as a
  list, and floors out at a hand-written day. A user must never see an error screen
  because the model wrote `30` instead of `25`.
- **`gradePlan`** — strict. Every violation is the prompt failing. Enforced by the
  eval, only *logged* in production.

---

## Architecture

```
src/
├── components/
│   ├── ui/          primitives + the four upstream reference components
│   ├── intake/      IntakeStepper        (3-question intake)
│   ├── day/         DayTimeline          (the board, reveal + completion pop)
│   └── landing/     ScrollStroke         (scroll-drawn hero)
├── routes/          one file per screen
├── state/           SidqProvider — the whole state machine
├── lib/
│   ├── store/       repository pattern: LocalStore | SupabaseStore
│   ├── streak.ts    the forgiving streak
│   ├── carryover.ts unfinished work moving forward
│   └── date.ts      local-day boundaries
└── styles/          design tokens
supabase/
├── migrations/      schema + RLS
└── functions/       generate-day, create-checkout, stripe-webhook,
                     register-push, send-ritual-push
```

**Try-before-signup is structural.** `SidqStore` has two implementations behind one
interface, so an anonymous visitor gets the identical product on `localStorage` and
signing up is a data migration, not a different app. Nothing is gated on having an
account.

### Three pieces worth knowing about

**The forgiving streak** (`lib/streak.ts`). A conventional streak is a loss-aversion
machine that works until the first miss and then loses you the user. Here, missed days
are paid out of a grace balance before the count is touched; grace refills one per full
week; a genuine break resets to **1, never 0**. There is no state anywhere in the module
for "streak lost" — the UI cannot shame the user with a number this code refuses to
produce.

**Carryover** (`lib/carryover.ts`). Every unfinished task becomes a real row on tomorrow
carrying a `carry_count`. The prompt's most useful rule keys off it: a task carried
twice or more gets **shrunk or dropped, never reprinted**. This needed a `carry_count`
column not in the blueprint — `carried_from_day_id` points at a *day*, so there is no
task lineage to walk and no way to tell "carried once" from "carried five times".

**Local day boundaries** (`lib/date.ts`). A day is the user's local day.
`new Date().toISOString().slice(0,10)` is the obvious version and it is wrong: west of
UTC it rolls over during the evening, which is exactly when shutdown runs.

---

## Design system

Dark, minimal, editorial. Tokens in `src/styles/global.css`.

No gradients, no drop shadows, no glow, no elevation, no blue. Surfaces separate on
hairline borders alone; depth comes from type scale and negative space. One accent
(`#C2F84F`), used only for the pinned priority, progress fill, completion pop, and the
primary button.

**Instrument Serif** for editorial moments against **Geist** for body/UI.

Motion is 150–240ms. Two signature moments get the investment — the plan reveal stagger
(fade + 8px rise, 40ms apart) and the completion pop (1.0 → 1.06 → 1.0 over 180ms).
Everything else is calm. All of it respects `prefers-reduced-motion`, globally in CSS
and again in JS so staggers are skipped rather than merely shortened.

---

## Reference components

The four upstream 21st.dev sources sit unmodified in `src/components/ui`, viewable at
**`/gallery`** in dev. They are lazily imported and dev-gated, so they are not in any
production bundle (verified in the build).

| Upstream | Shipped adaptation |
|---|---|
| `onboarding-dialog.tsx` | `intake/IntakeStepper` |
| `timeline.tsx` | `day/DayTimeline` |
| `loader-10.tsx` (GooeyLoader) | `ui/loader` — ring variant |
| `svg-follow-scroll.tsx` (Skiper19) | `landing/ScrollStroke` |

Each upstream component carries something the design system bans — gradient placeholder
art, `shadow-2xl`, a cream canvas, a blue primary — which is why the shipped versions
are rewrites rather than imports.

They render correctly because `global.css` maps shadcn's semantic palette
(`--primary`, `--foreground`, `--border`, …) onto the Sidq tokens. That also means any
future `npx shadcn@latest add` lands on-brand: `primary` resolves to the lime accent,
not the upstream blue.

Two known semantic collisions, both cosmetic and confined to the gallery:

- **`accent`** — shadcn means a subtle hover surface; Sidq means the brand lime. Sidq's
  meaning wins, so `hover:bg-accent` in upstream components goes lime.
- **`muted`** — shadcn means a subtle *surface*; Sidq means muted *text*. Sidq's meaning
  wins. `text-muted-foreground` maps correctly; `bg-muted` does not.

---

## Deviations from the blueprint

Four, all deliberate:

1. **`profiles`, not `users`.** Supabase owns `auth.users` and you cannot add columns to
   it. A profile table keyed on the auth uid is the standard pattern.
2. **`tasks.carry_count` added.** Required for the carryover-rot rule; see above.
3. **`generation_events` table added.** Meters the free tier per *model call*, so a
   regeneration costs the same as a first generation and the cap cannot be sidestepped
   by deleting and recreating a day.
4. **IntakeStepper does not use embla.** Drag has to be off in a 3-question form (it
   fights the textarea), which leaves none of embla's value — drag physics, momentum,
   snap — in use. What remained was its measurement pass, which caches snap positions at
   init and dies silently if the viewport is zero-width at that moment: the step index
   advances and the track never moves. This was observed, not theorised. A percentage
   translate on a flex track needs no measurement. Embla is still a dependency, used by
   the upstream `onboarding-dialog` in the gallery.

---

## Security

- The Anthropic key exists only in `generate-day`. It is never in a bundle, never in a
  `VITE_`-prefixed variable, never in a network tab.
- RLS is on **every** table from the first migration. Task ownership is proved through
  its day.
- `plan_tier` is guarded by a database trigger — only the service role can change it.
  Without it, a user could grant themselves a paid plan with one PATCH against the REST
  API.
- The Stripe webhook verifies its signature before trusting the body (`constructEventAsync`
  — the sync variant uses Node crypto and does not run on Deno).
- CORS reflects only allow-listed origins. These endpoints take an `Authorization`
  header, so a wildcard would let any site spend a user's quota.

---

## Status

**Done and verified:** the prompt + eval harness, defensive parsing (21 tests), the full
intake → generate → reveal → focus → shutdown → momentum loop, the forgiving streak
(21 tests), carryover (15 tests), local-date handling (12 tests), the design system, PWA
shell + service worker, schema with RLS, and all five edge functions.

**Written but not yet run against live infrastructure** — every one of these needs your
keys, and none has been executed end to end:

- `npm run eval` has never been run against the real model. **This is the gate; run it
  first.** Everything downstream assumes a plan quality that is currently unverified.
- Supabase: migration not applied, edge functions not deployed, auth flow not exercised.
- Stripe: no live checkout or webhook round-trip.
- Web push: no VAPID keys, `send-ritual-push` never fired. It expects an hourly schedule.

**Known gaps:**

- Icons are SVG-only. Add maskable PNGs (192/512) before launch for full install support.
- Landing ships 130 kB gzipped against a 150 kB budget. Most of it is `motion`, used
  only for the hero stroke — hand-rolling that with IntersectionObserver would reclaim
  roughly 40 kB if the budget gets tight.
- Calendar connectors are unimplemented; `PlanInput.calendar` is plumbed through the
  prompt and always empty.
