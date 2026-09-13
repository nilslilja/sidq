import { cn } from "@/lib/cn";

/**
 * What the five days were, and what happens when they are gone.
 *
 * ── Why this is not a modal that blocks the window ──────────────────────────
 * Because of what actually changes on day six, which is less than it sounds.
 * Sidq's paywall is deliberate and documented in `entitlement.rs`: nothing that
 * Sidq *is* gets metered. Handovers are unlimited on the free plan, search
 * reaches back forever, every source stays readable. The single thing a paid
 * plan buys is `may_thread` — Sidq carrying a conversation across models on its
 * own, which an assistant reads over MCP without anybody pressing anything.
 *
 * So a modal announcing that you have been cut off would be announcing
 * something most people cannot feel. Blocking the window to say it is how an
 * app gets deleted. This says the true thing, in the place somebody is already
 * looking at their plan, and the upgrade is one click from it.
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
            You are on Pro until then. After that Sidq stops carrying
            conversations across models on its own, which is the part you cannot
            do by hand. Everything else stays: handovers, the whole index,
            search back to the beginning, every assistant it reads.
          </>
        ) : (
          <>
            Sidq has stopped carrying conversations across models on its own.
            Nothing else changed, and nothing is locked: handovers are still
            unlimited, search still reaches back to the beginning, and every
            assistant it read yesterday it still reads today.
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
