# Sidq: where this actually is

Written so a fresh session, or you in three weeks, can pick this up cold.

## What the product is

**Sidq reads where you stopped and tells you where to start.**

Not "an AI planner". Deciding what to do has a hundred competitors and no moat.
Remembering what *halfway through* meant has neither, and it is the thing that
kills a morning before it starts.

Two layers:

1. **The resume machine** (day one value). Claude Code writes a transcript per
   session containing a title and the last prompt — literally the point you
   walked away. Sidq reads it locally and opens with *"Earlier today you were in
   Sidq: the retry still drops the second event."*
2. **The instrument** (week four value). From window-title samples it measures
   your own switch-recovery cost, start latency, gateway app and golden hours.
   Nobody has ever told anyone their own numbers.

The plan is the intervention. The measurement is the product.

## Honest assessment

**The bet that is unproven:** whether an always-on-top card earns its pixels
daily, and whether the switch-cost number makes someone say "oh" rather than
"I knew that". Twenty users answers both in a week.

**The nearest competitor is `/resume` in Claude Code.** Free, and it does the
recall. The difference is being there without being asked, and accumulating.

**Who it is for:** someone who works alone, mostly in one editor, and loses the
*start* of sessions rather than the middle. Thousands of people, not millions.
Fine for $10k MRR, not fine for anything larger.

## Architecture, and why

| Piece | Where | Why there |
| --- | --- | --- |
| Resume extraction | `src-tauri/src/work_history.rs` | Transcripts reach 23MB. Substring gate before JSON parse, or startup costs seconds. |
| Resume logic | `src/lib/companion/work-history.ts` | Needs no model. Local, free, offline, nothing uploaded. |
| Attention metrics | `src/lib/companion/attention.ts` | The moat. Recovery is measured to a sustained block *in the same app* — anything else scores 8 minutes of Slack as "recovered". |
| Sample persistence | `src/lib/companion/sample-store.ts` | localStorage, 7 days, pruned on read and write. A number that resets on restart is a novelty, not an instrument. |
| Calibration | `src/lib/calibration.ts` | Gated behind Pro, in the provider *and* on the prompt path. The second gate matters: without it free users get calibrated plans through the system prompt where nobody can see it. |
| Entitlements | `src/lib/entitlements.ts` | Single contract. Every pricing claim is a field here; tests fail if a card promises something the code does not grant. |

## What is done

- 10-step onboarding, gated on real keypresses and real OS permissions
- Desktop card: resume line, day progress, drift nudges, break timing, capture,
  rescue, replay, measured attention line
- Marketing site, pricing, FAQ, real download of a real DMG
- Billing wired end to end, price-verified server side
- 280 tests, Rust tests, typecheck, both builds green

## What is not

**Blocked on you:**

1. **Developer ID Application certificate.** Not the "Apple Development" one you
   have — a different type, created at developer.apple.com. Without it every
   download says "damaged". This is the only thing between you and shipping.
2. **A domain you own.** Then `SIDQ_WEB_ORIGIN=https://yourdomain`. Never guess
   one: a previous build defaulted to `sidq.app`, which belongs to an unrelated
   company, and was sending users to a stranger's login page.
3. **Deploy the functions.** `./scripts/deploy-functions.sh` after filling in
   `supabase/.env.functions`. Until then every plan is the generic local
   fallback, which is most of why the product feels shallow.

**Still open on the build side:**

- ElevenLabs is wired and metered but unproven — no key has ever been set
- `npm run eval` has never run against the real model
- Windows and Linux builds untested
- The attention profile needs ~3 working days before it says anything

## Traps already hit, so they are not hit again

- **Ad-hoc signing changes the app's identity on every rebuild.** macOS forgets
  Accessibility permission each time. `tccutil reset Accessibility app.sidq.desktop`.
  Fixed properly only by Developer ID signing.
- **Global shortcuts steal focus.** ⌘⇧N fired in Rust and focused the overlay, so
  the onboarding step listening for a keydown never saw one. Rust now forwards to
  the setup window while it is open.
- **Never register global ⌘+arrow.** It hijacks "move to end of line" system-wide.
  The card handles arrows locally, only while focused.
- **`osascript` is expensive.** Two spawns per poll at 1.2s froze the whole setup.
  Accessibility state is now `AXIsProcessTrusted()`, a direct call.
- **Tailwind v4 emits `oklab()`** for opacity-modified colours. Contrast checks
  must resolve through a canvas or they silently measure the wrong thing.
- **Never build a replica of an OS dialog.** An earlier version drew a pixel copy
  of the macOS security prompt with dead buttons. That teaches people a window
  looking exactly like a system prompt might be drawn by an app.

## The next three things, in order

1. **Get 20 people using it.** Nothing below matters until the resume line is in
   front of strangers.
2. **Developer ID + notarise.** Removes the only hard blocker to distribution.
3. **Deploy the functions.** Turns generic plans into real ones.

Everything else — ElevenLabs, the banner, Windows, rooms — is downstream of
whether anyone comes back on day two.
