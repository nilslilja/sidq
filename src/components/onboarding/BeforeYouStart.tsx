/*
 * The screen before setup starts.
 *
 * A user put it plainly in a DM: Sidq found his Claude history without being
 * asked, and that felt "sus". He was right to feel that. An app that reads
 * every conversation you have ever had with an AI is asking for more trust than
 * almost anything else on the machine, and it currently earns that trust by
 * being fast, which is exactly backwards — the speed is what unnerves people.
 *
 * So this comes first, before sign-in, before anything is read.
 *
 * ── Why it is specific rather than reassuring ────────────────────────────────
 *
 * The instinct is to write "your privacy matters to us" and a padlock. That is
 * what every company that has sold your data also wrote. What actually settled
 * the DM was naming the folder: Claude Code writes to ~/.claude/projects, Sidq
 * reads that folder, that is the whole mechanism. Specificity is the argument.
 * Vagueness reads as hiding something.
 *
 * The line held here is between the data flow, which is stated exactly, and how
 * the handover is built and ranked, which is not. Where your conversations go
 * is the person's business. How the compiler decides what matters is ours.
 *
 * ── Why it admits what does leave ────────────────────────────────────────────
 *
 * The third panel says Sidq talks to the network for sign-in and billing. It
 * would be easy to leave that out and claim nothing ever leaves the machine,
 * and somebody would open Activity Monitor within a week and find a connection.
 * At that point every other claim on this page is worthless.
 *
 * Admitting the boring traffic is what makes the important claim credible, and
 * it is the difference between a promise and a description.
 */

import { useEffect, useState } from "react";

export function BeforeYouStart({ onContinue }: { onContinue: () => void }) {
  /*
   * Nothing animates until the screen has settled.
   *
   * The diagram is the argument, and an argument that is already half over when
   * you start reading is one you have to replay to follow. A beat of stillness
   * first means the motion begins when somebody is looking at it.
   */
  const [live, setLive] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setLive(true), 420);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="max-w-[34rem]">
      <p className="text-[0.75rem] uppercase tracking-[0.14em] text-white/55">
        Before you start
      </p>

      <h1 className="mt-3 font-display text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.05] tracking-[-0.035em] text-white">
        Read this bit properly
      </h1>

      <p className="mt-4 max-w-[46ch] text-[1rem] leading-relaxed text-white/70">
        Sidq is about to read every conversation you have had with an AI. That
        is a lot to ask, so here is exactly what happens to them, in plain
        terms.
      </p>

      <StaysHere live={live} />

      <ul className="mt-8 space-y-5">
        <Fact n="1" title="They are already on your Mac">
          Your assistants write conversations to your own disk. Sidq reads the
          files that are already sitting there. It is not intercepting anything
          and it is not watching you type.
        </Fact>

        <Fact n="2" title="A handover is a file, not an upload">
          When you carry a conversation across, Sidq writes a file into your
          Downloads folder and stops. Nothing in that path sends it anywhere.
          Unplug your wifi and it still works.
        </Fact>

        <Fact n="3" title="Sidq does use the network, for two things">
          Signing in, and billing if you ever pay. That is the honest list. Your
          conversations are not part of either, and never travel with them.
        </Fact>
      </ul>

      {/*
       * The offer to check.
       *
       * Trust that invites verification is worth more than trust that asks for
       * belief, and this is the one claim on the page anybody can settle for
       * themselves in thirty seconds.
       */}
      <div className="mt-8 rounded-[14px] border border-white/[0.09] bg-white/[0.03] p-4">
        <p className="text-[0.9375rem] font-medium text-white">
          Do not take my word for it
        </p>
        <p className="mt-1.5 max-w-[46ch] text-[0.875rem] leading-relaxed text-white/55">
          Open Activity Monitor, go to the Network tab, and watch Sidq while you
          make a handover. Nothing goes out. That is the whole test and it takes
          about thirty seconds.
        </p>
      </div>

      <div className="mt-9">
        <button
          onClick={onContinue}
          className={[
            "rounded-full px-5 py-2.5 text-[0.9375rem] font-medium",
            "bg-gradient-to-b from-[#C9BBFF] to-[#A794FF] text-[#141319]",
            "shadow-[0_1px_0_0_rgba(255,255,255,0.4)_inset,0_6px_18px_-6px_rgba(184,166,255,0.7)]",
            "cursor-pointer transition-[box-shadow,transform] duration-150",
            "hover:shadow-[0_1px_0_0_rgba(255,255,255,0.5)_inset,0_10px_26px_-6px_rgba(184,166,255,0.9)]",
          ].join(" ")}
        >
          Got it, set it up
        </button>
      </div>
    </div>
  );
}

/*
 * The diagram, and it makes one point: things come in, a file goes out, and the
 * boundary is never crossed.
 *
 * Built from four dots and a rounded rectangle rather than an illustration,
 * because it has to be understood at a glance by somebody who is deciding
 * whether to be suspicious. Anything with more parts than the sentence it
 * illustrates is decoration.
 *
 * The fifth dot is the one doing the work: it heads for the boundary, reaches
 * it, and stops. That is the claim, drawn.
 */
function StaysHere({ live }: { live: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="relative mt-8 h-[132px] overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#0D0D13]"
    >
      {/* The machine. Everything inside this line is yours. */}
      <div className="absolute inset-x-6 inset-y-5 rounded-[11px] border border-dashed border-lilac/30" />
      <span className="absolute left-1/2 top-[9px] -translate-x-1/2 bg-[#0D0D13] px-2 text-[0.625rem] uppercase tracking-[0.14em] text-lilac">
        your Mac
      </span>

      {/* Conversations arriving from the assistants already on the disk. */}
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={[
            "absolute left-[13%] size-1.5 rounded-full bg-white/70",
            live ? "trust-in" : "opacity-0",
          ].join(" ")}
          style={{ top: `${38 + i * 22}px`, animationDelay: `${i * 0.5}s` }}
        />
      ))}

      {/* Sidq. */}
      <span className="absolute left-1/2 top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-lilac/40 bg-lilac/12 text-[0.6875rem] font-medium text-[#D8CCFF]">
        Sidq
      </span>

      {/* The handover, landing in Downloads and going no further. */}
      <span
        className={[
          "absolute right-[13%] top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-lilac",
          live ? "trust-out" : "opacity-0",
        ].join(" ")}
      />
      <span className="absolute right-[7%] top-1/2 -translate-y-1/2 text-[0.625rem] text-white/60">
        file
      </span>

      {/*
       * And the one that tries to leave. It reaches the boundary and stops
       * dead — no fade, no bounce, because a soft ending reads as "usually
       * does not" rather than "cannot".
       */}
      <span
        className={[
          "absolute bottom-[14px] left-1/2 size-1.5 rounded-full bg-[#FF9A8F]",
          live ? "trust-blocked" : "opacity-0",
        ].join(" ")}
      />
    </div>
  );
}

function Fact({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3.5">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-white/[0.12] bg-white/[0.05] text-[0.75rem] tabular-nums text-white/60">
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-[0.9375rem] font-medium leading-tight text-white">
          {title}
        </p>
        <p className="mt-1 max-w-[46ch] text-[0.875rem] leading-relaxed text-white/55">
          {children}
        </p>
      </div>
    </li>
  );
}
