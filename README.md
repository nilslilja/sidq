# Sidq

**The models remember everything except you.**

A macOS app that reads the AI conversations already on your Mac and carries any
one of them, whole, into whichever AI you open next. Word for word, never a
summary. Nothing is uploaded.

This repository is both halves: the desktop app and the marketing site at
sidq.tech are one React codebase, and which one you get is decided by the route.

---

## Run it

```bash
npm install && npm run desktop
```

`npm run dev` gives you the website on :5173 alone, which is faster when the
work is marketing copy. Everything under `/home`, `/pill` and `/welcome` expects
the Tauri bridge and will sit waiting in a plain browser tab.

| Command | What it does |
|---|---|
| `npm run desktop` | The app, in dev |
| `npm run dev` | The site only, on :5173 |
| `npm run typecheck` | `tsc -b --noEmit`. Use this, not bare `tsc` — the root config only holds references, so plain `tsc --noEmit` checks nothing |
| `npm test` | Frontend suite |
| `cargo test` in `src-tauri` | Rust suite |
| `npm run build:web` | Site build: bundle, prerender, copy the installers in |
| `npm run desktop:build` | Unsigned local app build |
| `npm run release -- <version>` | Signed, notarised, both architectures. Needs `.env.signing` |

---

## How it actually works

**Two kinds of source, and only one needs anything from you.**

Assistants that write transcripts to this Mac — Claude Code, Cowork, Cursor,
Windsurf, VS Code — are read straight off disk, including everything from before
Sidq was installed. Assistants that live in a browser — ChatGPT, Claude.ai,
Gemini, Grok, DeepSeek — keep nothing readable here, so they are read out of the
page through the macOS Accessibility API while you have them open. Scroll up and
one read reaches further back.

**The index** is SQLite with FTS5, in Application Support. `sessions` is what the
picker lists; `messages` is the searchable text. They are separate so listing
never has to load a conversation body.

**The pill** is an `NSPanel` above every window, summoned with ⌘⇧K. It has to
feel instant, which is why the transcript listing is cached against each file's
size and mtime — see `index_store::transcript_digest`, and the ignored timing
test in `work_history` that measures it.

**A handover** is the whole conversation plus a compiled brief saying what it is,
where it got to, and the standing instructions this person keeps giving
assistants. It goes to the clipboard or to a file. `compiler.rs` builds it.

**The profile** — the "How you work" tab — is built from your own repeated
sentences, returned word for word. Nothing there is generated, which is why each
line shows the number of conversations it came from: the count is the evidence.

**Duo** shares that profile between the people on one team, through a folder they
already sync rather than through a server, because "nothing is uploaded" is the
product and cannot be made false for the tier people pay for. See the header of
`team_context.rs` for the reasoning and the rules of the folder.

---

## Where things live

```
src/routes/          Home, Pill, Onboarding, Landing, the legal pages
src/components/
  landing/           The marketing site
  onboarding/        First run
  companion/         Shared between app surfaces
src/lib/
  plans.ts           The one definition of what each tier costs and offers
  onboarding/bridge  Every Tauri command, typed, in one place

src-tauri/src/
  main.rs            Commands, windows, the tray, the shortcut
  screen_reader.rs   Reading a browser page through Accessibility
  work_history.rs    Claude Code and Cowork transcripts
  cursor_history.rs  Cursor, Windsurf, VS Code
  index_store.rs     SQLite: sessions, messages, settings, caches
  compiler.rs        Turning a conversation into a handover
  profile.rs         Standing instructions, from your own turns
  team_context.rs    Duo's shared folder
  entitlement.rs     What each plan may do. The limits live here, not in the UI

supabase/            Auth, billing, invites, the waitlist function
scripts/             Release, prerender, font subsetting, web assets
```

---

## Rules this codebase holds itself to

**Never claim what the program does not do.** Every line on the pricing page and
in the FAQ is checked by a test against `entitlement.rs`, because a feature that
does not exist is the worst thing a pricing page can sell. Several of those tests
exist because a claim had already drifted.

**The limits are enforced in Rust.** The window may draw whatever it likes; it
does not decide what an account is allowed to do.

**Nothing leaves the Mac** unless the person did it deliberately — a handover
they made, a file they shared. There is no telemetry of conversation content and
no background upload.

**Comments say why, not what.** Most of the long ones in here are a record of
something that went wrong and the reasoning that replaced it. They are the most
useful thing in the repository; do not tidy them away.

---

## Docs

- `docs/releasing.md` — signing, notarising, shipping
- `docs/voice.md` — how the product writes
- `docs/state-of-play.md` — where the product is, commercially
- `docs/extension-submission.md` — the browser extension
