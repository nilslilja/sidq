import { cn } from "@/lib/cn";

/**
 * What the five days were, and what happens when they are gone.
 *
 * ── Why this is not a modal that blocks the window ──────────────────────────
 * Because of what actually changes on day six, which is less than it sounds.
 * Sidq's paywall is deliberate and documented in `entitlement.rs`: nothing that
 * Sidq *is* gets crippled. Search still reaches back forever and every source
 * stays readable, because a history window makes the product look broken
 * rather than limited.
 *
 * What does change is real and weekly: five handovers instead of as many as
 * you like, and the thread stops. Enough to keep using it, not enough to run
 * a week on.
 *
 * Still not a modal over the window. Blocking somebody's screen to announce a
 * downgrade is how an app gets deleted; this says the true thing in the place
 * they are already looking at their plan, with the upgrade one click away.
 *
 * The countdown matters more than the expiry, and it is the half that was
 * missing entirely: a trial nobody is told about is not a trial, it is a
 * feature that silently stops working.
 */
export function TrialNotice({
  daysLeft,
  totalDays,
  paid,
  onUpgrade,
}: {
  /** `null` once it is over, or when this account pays and never needed one. */
  daysLeft: number | null;
  totalDays: number;
  /** A paying account has no trial to talk about. */
  paid: boolean;
  onUpgrade: () => void;
}) {
  // Nothing to say to somebody who already pays.
  if (paid) return null;

  const running = daysLeft !== null;

  return (
    <section
      className={cn(
        "rounded-[18px] border p-5",
        running
          ? "border-[var(--w-line)] bg-[var(--w-raise)]"
          : "border-[#B8A6FF]/40 bg-[#B8A6FF]/[0.07]",
      )}
    >
      <p className="text-[0.9375rem] font-medium text-[var(--w-text-1)]">
        {running
          ? daysLeft === 1
            ? "Last day of your trial"
            : `${daysLeft} days of your trial left`
          : `Your ${totalDays} days are up`}
      </p>

      {/*
       * Said plainly, both halves, because the half that does not change is the
       * larger one and hiding it would make this a threat rather than a notice.
       */}
      <p className="mt-2 max-w-[56ch] text-[0.8125rem] leading-relaxed text-[var(--w-text-3)]">
        {running ? (
          <>
            You are on Pro until then. After that it is five handovers a week
            instead of as many as you like, and Sidq stops carrying
            conversations across models on its own. The index, the search and
            every assistant it reads all stay exactly as they are.
          </>
        ) : (
          <>
            You are on five handovers a week now, and Sidq has stopped carrying
            conversations across models on its own. Nothing is locked and
            nothing was taken: the whole index is still there, search still
            reaches back to the beginning, and every assistant it read yesterday
            it still reads today.
          </>
        )}
      </p>

      <button
        onClick={onUpgrade}
        className={cn(
          "mt-4 cursor-pointer rounded-full px-4 py-2 text-[0.8125rem] font-medium",
          "bg-gradient-to-b from-[#C9BBFF] to-[#A794FF] text-[#141319]",
          "shadow-[0_1px_0_0_rgba(255,255,255,0.4)_inset,0_6px_18px_-6px_rgba(184,166,255,0.7)]",
          "transition-[box-shadow,transform] duration-150",
          "hover:shadow-[0_1px_0_0_rgba(255,255,255,0.5)_inset,0_10px_26px_-6px_rgba(184,166,255,0.85)]",
        )}
      >
        {running ? "Keep it after the trial" : "Turn it back on"}
      </button>
    </section>
  );
}
