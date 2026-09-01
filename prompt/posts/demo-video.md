# DEMO VIDEO

Two outputs, one recording session.

  YC        60 seconds. Raw. No music, no edits, no intro card.
  LinkedIn  30-40 seconds, cut from the same footage afterwards.

Record the YC one properly. The LinkedIn cut is a trim of it.


═══════════════════════════════════════════════════════════════
DOES IT NEED TO BE PERFECT
═══════════════════════════════════════════════════════════════

No, and for YC actively not.

Partners watch these at 2x having seen thousands. Production value reads as
time spent on a video instead of on the product. What they are checking is
whether the thing works and whether you can explain it.

One take. Your voice. Your screen. If you stumble on a word, keep going.
A re-record is only warranted if the product misbehaved.

The one thing that does have to be perfect is THE PROOF MOMENT at 0:35.
Everything else is setup for it.


═══════════════════════════════════════════════════════════════
WHICH AIs TO USE
═══════════════════════════════════════════════════════════════

FROM   Claude (or Claude Code)
TO     ChatGPT

Cross two rival companies on purpose. That is the entire wedge: OpenAI will
never build this for Anthropic and Anthropic will never build it for OpenAI,
so it can only come from outside. Going Claude to Claude throws that away.

They are also visually distinct on screen, so a viewer at 2x can see that the
window changed.


═══════════════════════════════════════════════════════════════
WHICH CONVERSATION TO USE
═══════════════════════════════════════════════════════════════

Pick one that is:

  LONG        it has to look like something nobody would retype
  TECHNICAL   YC partners are technical, depth reads as real
  YOURS       a genuine Sidq session beats anything staged
  DECIDED     it must contain a decision with a reason behind it

That last one is not optional. The proof question depends on it.

DO NOT USE a conversation containing any of:

  - .env contents, Supabase keys, the Stripe keys
  - anything about pricing you have not published
  - personal messages
  - this session, it has your Supabase URL and anon key in it

Open the conversation and scroll it once before recording. Whatever is on
screen is in the video permanently.


═══════════════════════════════════════════════════════════════
BEFORE YOU HIT RECORD
═══════════════════════════════════════════════════════════════

  [ ] Sidq running from /Applications, not a mounted DMG
  [ ] test the grab hotkey once. if it does not fire, use the pill instead
      and do not mention hotkeys at all
  [ ] close Slack, Mail, Messages. no notification banners
  [ ] Do Not Disturb on
  [ ] desktop cleared, no personal files visible in the dock preview
  [ ] browser: one window, no other tabs showing anything private
  [ ] QuickTime > New Screen Recording, microphone ON
  [ ] do one full dry run without recording


═══════════════════════════════════════════════════════════════
THE SCRIPT
═══════════════════════════════════════════════════════════════

Say it in your own words. These are the beats, not lines to memorise.

0:00 - 0:08   THE SETUP
  SCREEN  your long Claude conversation, scroll it so the length is obvious
  SAY     "This is a conversation I've had with Claude about the app I'm
           building. A few hundred messages. I want a second opinion from
           ChatGPT."

0:08 - 0:14   THE PAIN
  SCREEN  switch to an empty ChatGPT window
  SAY     "Normally this is where I spend twenty minutes re-explaining it,
           and I still leave things out."

0:14 - 0:24   SIDQ
  SCREEN  hit the grab hotkey, or click the pill. the picker opens
  SAY     "Sidq reads it straight off my Mac. That whole list opens in about
           fifty milliseconds, and nothing is uploaded anywhere."
  NOTE    let the picker opening speed speak. do not talk over it

0:24 - 0:34   THE HANDOVER
  SCREEN  select the conversation, the file lands, drop it into ChatGPT
  SAY     "It writes the whole conversation into one file and I drop it in."

0:34 - 0:50   THE PROOF          <-- the only part that has to land
  SCREEN  type your question, let ChatGPT answer, do not cut away
  SAY     "Now I ask it something it can only answer if it genuinely has
           the context."
  ASK     a question about a DECISION and its REASON, for example:
             "what did we decide about caching, and why did we throw out
              the first approach?"
  NOTE    it must be something unanswerable from a summary or a guess.
          let the full answer render. this is the whole video

0:50 - 0:60   CLOSE
  SAY     "Ten assistants, nothing leaves the machine, built in Rust.
           It's on sidq.tech."


═══════════════════════════════════════════════════════════════
WHY THE PROOF QUESTION IS EVERYTHING
═══════════════════════════════════════════════════════════════

Anyone can show a file being pasted. What nobody can fake is the second model
answering a question it could only answer with the real context.

Ask "what are we building" and it proves nothing, a summary would cover it.
Ask "why did we reject the first approach" and the answer either demonstrates
the handover worked or it does not.

Pick your question BEFORE recording and know what the right answer is.


═══════════════════════════════════════════════════════════════
THE LINKEDIN CUT, AFTERWARDS
═══════════════════════════════════════════════════════════════

From the same footage, 30-40 seconds:

  - open on the picker snapping open, not on the setup. speed is the hook
  - cut the pain explanation entirely, captions carry it
  - keep the proof moment whole and uncut
  - burn in captions, most people watch muted
  - no music over the YC version. music is fine on this one

Caption text over the opening: "i built this so you never have to explain
your project to an AI twice"


═══════════════════════════════════════════════════════════════
IF SOMETHING BREAKS ON CAMERA
═══════════════════════════════════════════════════════════════

Keep recording and say what happened. A founder who narrates a hiccup and
recovers reads as someone who knows their product. A suspiciously flawless
demo reads as staged, and YC has seen both.


═══════════════════════════════════════════════════════════════
THE EXACT CONVERSATION AND THE EXACT QUESTION
═══════════════════════════════════════════════════════════════

Checked all nine Claude Code transcripts on this Mac. Use this one:

  SESSION   5f90fa88
  SIZE      88,373 words across 817 turns, 32 MB
  SUBJECT   building Sidq. "sidq" appears 6,773 times in it

Safety, verified rather than assumed:
  - no real API keys. the one eyJ match is random base64, not a JWT
  - "service_role" is SQL role names in a migration, no value attached
  - "sk-ant-..." appears once, literally with the ellipsis, as a placeholder
  - three other transcripts DO contain real JWTs. do not use 40b3270f,
    86dd7969 or fa02bbd3

Three other sessions are clean but far too short to be impressive.


THE PROOF QUESTION — ask ChatGPT exactly this:

  "We used Embla for the carousel and then ripped it out. What exactly went
   wrong with it, and why was dropping it the right call instead of fixing it?"


WHAT A CORRECT ANSWER CONTAINS

If the handover worked, ChatGPT will say some combination of:

  - the carousel advanced its index but did not actually page
  - flex-col on the embla viewport broke its layout contract
  - it settled at -433px instead of -1280px
  - it measured the slides before layout and fonts had settled, and cached
    the wrong snap positions
  - canScrollNext() returned false because it measured a 0-width container
    and trimmed all its snap points
  - dropping it was right because drag was disabled, so none of embla's
    actual value (drag physics, momentum, snap) was being used. all that was
    left was a measurement dependency that breaks when the container starts
    collapsed

The -433px and -1280px numbers are the moment. Nobody guesses those. If they
appear on screen, the demo is proven and you can stop talking.


BACKUP QUESTION, if the first one lands flat

  "Why did we build an eval harness instead of just checking the output
   by hand once?"

Correct answer: because a one-off manual check is a vibe check. As a
versioned prompt file with real-week fixtures and automated assertions, the
quality gate becomes `npm run eval`, a command rather than an opinion.
