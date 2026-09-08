# Sidq: where this actually is

Written so a fresh session, or you in three weeks, can pick this up cold.

Last rewritten 29 August 2026. The version before this one described a day
planner that measured your attention from window-title samples. Every part of
that is gone — the planner was deleted, and the window sampling was removed
because reading which app you had open all day, on battery, to throw the answer
away, was indefensible next to the privacy claim on the front page. If you find
a doc that still says otherwise, it is older than this line.

## What the product is

**Sidq reads the AI conversations already on your Mac and carries any one of
them into whichever AI you open next.**

Not a summary. The conversation, word for word, from one keystroke. What it
leaves out are turns that said nothing, and — only when a conversation is too
large for a context window — the turns carrying least. Both are named in the
file. Nothing is ever shortened or rewritten, which is the distinction the whole
product rests on.

The gap it fills: most people now pay for three or four assistants and not one
of them can read another. You explain your project to the first, then explain it
again to the second. The workaround — asking for a summary and pasting it — is
the thing that fails, because a summary is the model's account of what happened
rather than what happened.

Two kinds of source, and only one needs anything from the person. Editors write
transcripts to disk and are read with nothing to set up, including history from
before Sidq existed. Browser assistants keep nothing readable, so they are read
out of the page through Accessibility while it is open.

## Honest assessment

**What is proven:** the mechanism works, on real conversations, across ChatGPT,
Claude.ai, Gemini, Claude Code, Cowork and Cursor. Handovers are complete rather
than truncated, and the receiving model behaves as though it was there.

**What is not proven:** whether anyone pays. Stripe is in live mode and no real
card has ever been put through it. That is the single largest untested path in
the product.

**The strongest signal so far** is that two people, independently and unprompted
— one in a LinkedIn thread, one at a hackathon — asked for the same thing: a
shared context for a team rather than one person. Duo now does a real version of
that. It is the only piece of demand that has arrived twice without being
solicited.

**Who it is for:** someone who pays for several assistants and moves between
them. Founders and developers first, because they feel it daily.

## What is done

- Reading, indexing and handover across every source above
- The pill: ⌘⇧K, above everything, ranked by real work rather than recency
- Search across everything indexed, FTS5, plan-gated reach
- The profile: standing instructions taken word for word from your own turns,
  carried into every handover
- Duo: team context through a synced folder, plus explicitly shared handovers
- Onboarding, ten steps, gated on real keypresses and real OS permissions
- Marketing site, prerendered, with a real signed and notarised DMG behind it
- Billing wired end to end and verified server side
- Analytics, and a `seen()` ping that writes only a date

## What is not

**Blocked on you, not on code:**

1. **`RESEND_API_KEY` is unset.** The waitlist records the address and the
   function reports `sent: false`. Anybody who signed up is waiting on a link
   that has to be sent by hand until this is set.
2. **No real card has gone through Stripe.** It is in live mode.
3. **Nothing since 0.1.51 is shipped.** The perf fix and Duo are in the binary,
   so they need a release, not just a site deploy.

**Unverified rather than broken:**

- Grok and Safari have never been watched working end to end
- Invite redemption has never been run with two real accounts
- Windows and Linux do not exist. One person at a hackathon and one LinkedIn
  commenter were both blocked on this

## Traps already hit, so they are not hit again

- **Ad-hoc signing changes the app's identity on every rebuild**, so macOS
  forgets Accessibility permission each time. `tccutil reset Accessibility
  app.sidq.desktop`. Fixed properly by Developer ID signing.
- **Global shortcuts steal focus.** Rust forwards to the setup window while it
  is open, or the onboarding step listening for a keydown never sees one.
- **Never register global ⌘+arrow.** It hijacks "move to end of line"
  system-wide.
- **`osascript` is expensive.** Two spawns per poll at 1.2s froze setup.
  Accessibility state is `AXIsProcessTrusted()`, a direct call.
- **Tailwind v4 emits `oklab()`** for opacity-modified colours, so contrast
  checks must resolve through a canvas or they measure the wrong thing.
- **Never build a replica of an OS dialog.** An earlier version drew a pixel copy
  of the macOS security prompt with dead buttons.
- **`npx tsc --noEmit` checks nothing here.** The root config only holds
  references. Use `npm run typecheck`, which is `tsc -b`.
- **The picker read every transcript on the machine on every open** — 157MB and
  1.5 seconds, growing daily. Cached against size and mtime now. If listing ever
  feels slow again, that cache is the first place to look.
- **Two Duo members with no name set would overwrite each other's file**, because
  the filename comes from the name and the fallback is the same for everybody.
  The window will not let a folder be chosen before a name exists.

## The next three things, in order

1. **Ship it.** The perf fix alone is the difference between the shortcut feeling
   instant and feeling broken, and it is sitting in the repository.
2. **Set `RESEND_API_KEY`** and send the backlog by hand.
3. **Put one real card through Stripe**, then decide whether Windows is worth it
   on the evidence rather than on two requests.
