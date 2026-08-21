# Posts

Fill in the bracket, post it. Every number below is real and measured on one
laptop — replace them only with numbers you have actually measured, never with
rounder ones that read better.

Voice rules in [voice.md](voice.md). The short version: say the number or say
nothing.

---

## Launch — LinkedIn

> I measured what my AI assistants actually keep.
>
> 5,414 messages. 16 conversations. Four different tools.
>
> Not one of them can read a single word of the others.
>
> Then I looked inside one transcript. 370,055 characters of the model's own
> reasoning — the part it thinks before it answers — that I have never seen and
> never will. It gets dropped from the model's context after the turn. It only
> exists in a file on my laptop that nothing reads.
>
> So every morning I re-explain my stack. My conventions. What I am building.
> To a machine that wrote 370,000 characters about it yesterday.
>
> I built Sidq to stop doing that.
>
> It reads the conversation files your assistants already write to your Mac,
> and carries a whole conversation into a different one. Not a summary — anyone
> can ask for a summary. The reasoning, the tool calls that failed, the places
> you cut it off mid-sentence.
>
> Nothing is uploaded. It reads what is already on your disk.
>
> Mac only. Free. sidq.tech

## Launch — X

> I measured what my AI assistants actually remember about me.
>
> 5,414 messages across 4 tools.
> Zero of them can read each other.
>
> Then I opened one transcript properly:
>
> 370,055 characters of the model's private reasoning I have never seen.
>
> Dropped from its own context after the turn. Sitting on my disk. Read by
> nothing.
>
> Built Sidq to carry it across. Mac, free, nothing uploaded.

## Launch — Show HN

> **Show HN: Sidq — carry a whole AI conversation into a different assistant**
>
> Sidq reads the transcript files Claude Code, Cowork, Cursor, Windsurf and VS
> Code already write to your Mac, indexes them locally with SQLite FTS5, and
> compiles any one of them into a file you attach to a different assistant.
>
> The part I did not expect: the spoken half of a transcript is about 14% of
> the file. In my largest conversation — 3,416 turns — there were 561 blocks of
> reasoning totalling 370,055 characters, plus 1,594 tool calls and their
> results. None of it is visible in the UI, and none of it is recoverable by
> asking the model to summarise itself, because it is dropped from the model's
> own context between turns.
>
> Sidq carries that across, and formats per target: XML for Claude, markdown
> for GPT and Gemini, with the instruction repeated at the end where it is
> actually followed.
>
> Everything is local. The index is a file in Application Support. Browser
> assistants are read by an extension that posts to 127.0.0.1.
>
> It is Mac only, the browser extension is not in the store yet, and the local
> limit enforcement is SQLite on a disk you own, so a determined person can
> edit it. Making it stronger would mean sending a record of every handover to
> a server, which is the one thing this cannot do.

---

## Finding — the template

> [Number], [unit], measured on my own machine this week.
>
> [The one-sentence consequence.]
>
> [What that means for anyone using more than one assistant.]

Filled in:

> 86% of what Claude wrote to me last month, I never saw.
>
> Thinking blocks, tool calls, results. All on my disk. All invisible in every
> interface I own.
>
> Your assistant knows more about your project than you can get it to tell you.

> Four assistants open right now. 5,414 messages between them.
>
> If I ask any one of them what I decided on Tuesday, it says it has no memory
> of previous conversations.
>
> The memory exists. It is 40MB, on this laptop, and none of them can open it.

---

## Build note — the template

> [Thing broke.] [In one sentence, how.]
>
> [The detail that makes it interesting.]
>
> [What you actually changed.]

Filled in:

> Spent an afternoon on a bug where a window resized and the UI never noticed.
>
> Tauri's `emit_to(label, …)` builds one kind of event target. The JS
> `listen()` registers a different one. The matcher has no arm for that pair,
> so it returns false. No error, no warning, no type complaint. The event
> simply reached nobody.
>
> Fixed it by deleting the event. The window now measures its own width. A fact
> you can read cannot fail to arrive.

> Found my own privacy policy claiming Sidq reads your window titles.
>
> It did, for a feature deleted three weeks earlier. Worse, it promised nothing
> reads your transcripts in the background — which the indexer I shipped last
> week makes false.
>
> A privacy policy that under-describes what the software does is the only kind
> of stale copy that actually matters. Rewrote it against the code, line by
> line.

---

## Answering "isn't this just a wrapper"

Do not get defensive. Agree with the version that was true, then give the
number.

> It was. For about three weeks it copied the text of a conversation and pasted
> it somewhere else, which anyone can do by asking the model to summarise
> itself.
>
> What changed is that the text is 14% of the file. The other 86% — 370,055
> characters of reasoning in one conversation, the tool calls, the failures —
> cannot be asked for, because the model does not have it either. It is dropped
> from its context after the turn.
>
> Reading it off your own disk is the only way to get it. That is the product.

## Answering "why not just use projects/memory"

> Because those live inside one assistant. The whole problem is that you use
> four.
