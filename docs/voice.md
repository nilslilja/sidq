# How Sidq talks

The product and the founder sound like the same person. That is the whole
mechanism: the reason anyone believes a post is that they can go and check it
in the app thirty seconds later, and the reason anyone trusts the app is that
it talks the way the person selling it does.

Everything below is one rule wearing different clothes: **say the number, or
say nothing.**

---

## The five rules

**1. Lead with the number.**
Not "a lot of your AI history is invisible." *370,055 characters of reasoning
in one conversation, that nobody has ever read.* Numbers are checkable, which
is why they land, and why you must never invent one. If you do not have the
number, go and measure it. The measuring is usually the post.

**2. Name what it replaces.**
Every sentence should make something else look worse by comparison. "Pick up
where you left off" is nothing. "Your assistant forgot your stack for the
ninth time this week" is a product. Never describe Sidq in the abstract when
you could describe the thing it makes unnecessary.

**3. No hedging, ever.**
Delete: seamlessly, effortlessly, powerful, revolutionary, game-changing,
supercharge, unlock, leverage, robust, cutting-edge, "we believe", "designed
to", "helps you". If a sentence survives having every adverb removed, it was a
real sentence.

**4. Short. Then shorter.**
The strongest line in any post is under nine words. Write the paragraph, find
that line, delete the paragraph.

**5. Say the ugly part yourself.**
"It is Mac only." "The limit is not unbreakable — it is SQLite on a disk you
own." "Sidq keeps 14% of your transcript" was true last week and it went in a
post before anyone else could say it. Admitting the flaw is the single
cheapest way to be believed about everything else, and it removes the only
attack anybody had.

---

## The one argument

Everything is a restatement of this. Do not dilute it, do not add a second.

> Every assistant you use starts from nothing. Your last two hundred
> conversations are sitting on your own disk right now, and not one of them
> can read a single word of it.

Three follow-ons, in order of force:

- **The 86%.** They cannot read each other, and none of them can read the part
  the model never showed you either.
- **The tax.** Explaining your stack again is a cost you pay every single day
  and have stopped noticing.
- **The disk.** It is already yours. Sidq does not fetch anything. It reads
  what is already there.

---

## In the product

The attitude is continuous because it lives in the surfaces people touch daily,
not in a post they read once. Every string in the app follows the five rules.

| Instead of | Write |
|---|---|
| You've reached your plan limit | That is 10 handovers this week |
| No results found | Nothing matches that |
| Loading your conversations... | Reading your conversations |
| Something went wrong | Could not read that one |
| Upgrade to Pro for unlimited history | Free search reaches back 7 days |
| We couldn't find any data yet | You have not handed one over yet |

Errors say what happened and what to do. Empty states say empty. Nothing in
the app ever apologises, and nothing ever congratulates the person for using
it.

---

## Posting

**Cadence: three a week.** Two findings, one build note. Never a "thrilled to
announce".

**A finding is a number you measured this week.** You have one every week
because the product is a measuring instrument pointed at your own machine:

- 5,414 messages indexed on one laptop
- 86% of what Claude wrote was never shown to me
- 370,055 characters of reasoning in a single conversation
- 16 conversations, 4 different tools, zero of them able to read the others

**A build note is a thing that broke and what it taught you.** The Tauri event
that compiled, returned Ok and reached nobody. The privacy policy that
described a feature deleted three weeks earlier. These outperform launches,
because everybody has had that week and nobody posts about it.

**Never post:** a roadmap, a "we're hiring" with no role, a milestone about
yourself (funding, follower counts, "one month in"), or anything a competitor
could have written about their own product with two words swapped out.

---

## Formats

Templates in `docs/launch-posts.md`. They exist so posting takes eleven minutes
rather than an afternoon; the number is the only part that changes.
