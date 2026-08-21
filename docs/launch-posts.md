# Posts

Age is the hook, every time. Then the number, immediately, so the hook is not
the whole meal. Every figure below is real and measured on one laptop. Replace
them only with numbers you have actually measured, never with rounder ones that
read better.

Voice rules in [voice.md](voice.md).

---

## The line

> You cannot get a real second opinion from another AI.

Not because the models are bad. Because you can only ever hand the second one a
summary, so what you get back is an opinion on the summary rather than on your
actual problem.

That is the pitch. The 44% is what explains why the summary cannot be fixed,
and it goes second, never first.

## The argument, in one paragraph

You explain your project to one assistant. Then you explain it again to the
next, because none of them can read each other. And when you actually want a
second opinion, the thing a second model is for, all you can give it is a
paste or a summary, so it is answering a compressed version of your question.
Here is the part that makes it unfixable: 44% of what your assistant worked out
about your project was never shown to you either. It writes the reasoning to
your own disk, renders none of it, and drops it from its own memory after the
turn. So you could not include it even if you tried. That is 1,157,450
characters on my laptop across fifteen conversations.

---

## LinkedIn, launch day

> I am 18 and I got sick of explaining my own project to four different AIs
> every single day.
>
> You know the loop. You are deep in something with one of them. You want a
> second opinion so you open another, and now you are typing out the stack, the
> constraints, what you already tried, and why you threw away the obvious answer.
>
> So you paste a summary instead. And the second opinion you get back is an
> opinion on your summary. Not on your problem. Which makes it worth nothing.
>
> Then I opened the actual files these assistants write to my laptop, and found
> the part that made me build this: 44% of what they had worked out about my
> work, I had never seen. The reasoning. The approaches they tried and rejected.
> It is written to my own disk, rendered nowhere, and deleted from their memory
> after every turn.
>
> So a second opinion was never a second opinion. It was a first opinion on half
> a story, and no amount of summarising was going to fix that, because the other
> half never reached me either.
>
> I built Sidq. It reads the conversations your AIs already write to your Mac
> and moves an entire one into a different assistant. Whole. Including the part
> you were never shown.
>
> Mac only. Nothing leaves your machine. I built it alone and I would rather you
> tell me it is wrong than say nothing.
>
> sidq.tech

## X, same day

> I'm 18 and I got sick of explaining my project to four different AIs a day.
>
> Want a second opinion from another model? You can only give it a summary. So
> you get an opinion on the summary.
>
> Then I opened the files. 44% of what my assistant worked out about my work was
> never shown to me at all.
>
> You were never getting a second opinion. You were getting a first one on half
> a story.
>
> Built Sidq to move the whole conversation across instead.

## X, the clip

> Second opinion from a different AI, with everything the first one knew.
>
> [video]
>
> Built by an 18 year old who got tired of typing the same explanation four
> times a day.

---

## The four recurring formats

### 1. The second-opinion post

The strongest one. Everybody has had this exact afternoon.

> Asked a second model to check my work today.
>
> To do that I had to summarise two hours of reasoning into a paragraph. It gave
> me a confident answer about the paragraph.
>
> That is not a second opinion. That is a first impression.

### 2. The re-explaining post

> Counted it. I explained the same three constraints about my project to four
> different assistants this week.
>
> Not because they forgot. Because none of them can read each other, and there
> is no reason for that except that nobody built the thing that lets them.

### 3. The measurement

> 1,436 times last month, my assistant worked something out about my project and
> did not tell me.
>
> I know because it wrote all of them down, on my disk, in a file with no reader.
>
> Your assistant knows more about your work than you can get it to say.

### 4. The build note

> [Thing broke.] [How, in one sentence.] [The interesting detail.] [What changed.]

> Spent an afternoon on a bug where a window resized and the UI never noticed.
>
> Tauri's emit_to builds one kind of event target. The JS listen() registers a
> different one. The matcher has no arm for that pair, so it returns false. No
> error, no warning, no type complaint. The event simply reached nobody.
>
> Fixed it by deleting the event. The window measures its own width now. A fact
> you can read cannot fail to arrive.

### 5. The age post, once a week at most

More than that and it stops being a fact and starts being a bit.

> Things I did not have at 18: a degree, a network, a co-founder, a clue.
>
> Things I did have: four AI assistants that could not read each other, and
> enough free time to be annoyed about it.

---

## Answering the two objections

**"Isn't this just a wrapper?"**

> It was, for about three weeks. It copied the text of a conversation and pasted
> it somewhere else, which is a thing anybody can do.
>
> What changed is that I stopped copying the visible half. 44% of what your
> assistant works out about your project is never rendered to you, and cannot be
> asked for, because the model drops it from its own context after the turn.
>
> Reading it off your own disk is the only way to get it. That is the product.

**"Why not use Projects or memory?"**

> Because those live inside one assistant, and the whole problem is the moment
> you open a different one.

---

## Never post

A roadmap. A "thrilled to announce". A milestone about yourself that is not a
number about the product. Anything a competitor could post about their own
product by swapping two words.
