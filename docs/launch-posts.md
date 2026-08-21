# Posts

Age is the hook, every time. Then the number, immediately, so the hook is not
the whole meal. Every figure below is real and measured on one laptop. Replace
them only with numbers you have actually measured, never with rounder ones that
read better.

Voice rules in [voice.md](voice.md).

---

## The argument, in one paragraph

Every AI you use forgets you the moment you close the tab. The workaround
everybody has settled on is asking it to summarise, and a summary is exactly
where the detail dies: the reasoning, the things it tried and rejected, the
part where you stopped it and said no. I measured it. In one conversation on my
laptop there were 370,055 characters of the model's own thinking that I have
never seen and never will, because it gets dropped from its own context after
the turn. It exists in one place, a file on my disk, and not a single one of my
assistants can read it.

---

## LinkedIn, launch day

> I am 18 and I have spent the last month reading my own AI conversations.
>
> Not using them. Reading the files.
>
> Here is what I found on my laptop: 5,414 messages, 16 conversations, four
> different assistants. Not one of them can read a single word of the others.
>
> Then I opened one transcript properly. 3,416 turns. 561 blocks of the model's
> private reasoning, 370,055 characters of it, that I have never seen and never
> will. It gets dropped from the model's own context after the turn. It exists
> in exactly one place: a file on my disk that nothing reads.
>
> The spoken part of that conversation, the bit you actually see in the app, is
> 14% of the file.
>
> Everybody's answer to this is "just ask it to summarise". That is the problem,
> not the fix. A summary is where the detail goes to die. It keeps the
> conclusion and throws away the reasoning, the three approaches that were tried
> and rejected, and the moment you cut it off mid-sentence and said no, not like
> that. Those are the parts that took you two hours to arrive at.
>
> So I built Sidq. It reads the conversation files your assistants already write
> to your Mac, and carries a whole conversation into a different assistant. Word
> for word. Including the 86% you were never shown.
>
> Nothing is uploaded. It reads what is already on your machine.
>
> I am 18, I built this alone, and I would rather you tell me it is wrong than
> say nothing.
>
> sidq.tech

## X, same day

> I'm 18 and I spent a month reading my own AI conversation files.
>
> 5,414 messages. 4 assistants. Zero of them can read each other.
>
> Then I opened one properly:
>
> 370,055 characters of the model's private reasoning I have never seen.
>
> Dropped from its own context after the turn. Sitting on my disk. Read by
> nothing.
>
> Everyone says "just ask it to summarise". Summaries are where the detail dies.
>
> Built Sidq to carry the whole thing across instead. Mac. Nothing uploaded.

## X, the clip

> This is 86% of an AI conversation that you have never seen.
>
> [video]
>
> Built by an 18 year old who got tired of explaining his stack every morning.

---

## The four recurring formats

### 1. The measurement

> [Number], measured on my own machine this week.
>
> [One-sentence consequence.]
>
> [What it means for anyone using more than one assistant.]

> 86% of what Claude wrote to me last month, I never saw.
>
> Thinking blocks, tool calls, results. All on my disk. All invisible in every
> interface I own.
>
> Your assistant knows more about your project than you can get it to tell you.

### 2. The summary problem

> I asked four assistants to summarise the same conversation.
>
> All four kept the conclusion. All four dropped the two approaches we tried
> first and abandoned, which is the only part that would stop the next one
> repeating them.
>
> A summary is a lossy compression of the thing you actually needed.

### 3. The build note

> [Thing broke.] [How, in one sentence.] [The interesting detail.] [What changed.]

> Spent an afternoon on a bug where a window resized and the UI never noticed.
>
> Tauri's emit_to builds one kind of event target. The JS listen() registers a
> different one. The matcher has no arm for that pair, so it returns false. No
> error, no warning, no type complaint. The event simply reached nobody.
>
> Fixed it by deleting the event. The window measures its own width now. A fact
> you can read cannot fail to arrive.

### 4. The age post, used sparingly

Once a week at most, or it stops being a fact and starts being a bit.

> Things I did not have at 18: a degree, a network, a co-founder, a clue.
>
> Things I did have: a laptop with 5,414 AI messages on it that no assistant
> could read, and enough free time to find out why.

---

## Answering the two objections

**"Isn't this just a wrapper?"**

> It was. For about three weeks it copied the text of a conversation and pasted
> it somewhere else, which anybody can do by asking for a summary.
>
> What changed is that the text is 14% of the file. The other 86%, the 370,055
> characters of reasoning, the tool calls, the failures, cannot be asked for,
> because the model does not have it either. It is dropped from its context
> after the turn.
>
> Reading it off your own disk is the only way to get it. That is the product.

**"Why not use Projects or memory?"**

> Because those live inside one assistant. The whole problem is that you use
> four.

---

## Never post

A roadmap. A "thrilled to announce". A milestone about yourself that is not a
number about the product. Anything a competitor could post about their own
product by swapping two words.
