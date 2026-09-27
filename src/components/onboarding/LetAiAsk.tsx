import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { OnboardingBridge } from "@/lib/onboarding/bridge";

/*
 * Let the assistant ask Sidq, set up during setup rather than found later.
 *
 * ── Why this is here and not its own step ────────────────────────────────────
 *
 * It was reachable only from a button in the Overview panel captioned "Let an AI
 * ask for this itself", which is the single most valuable thing Sidq does and
 * was behind a press almost nobody performs. Everything else in the product
 * needs a person to decide to move something; this is the one path where the
 * assistant fetches on its own, so burying it inverted the product.
 *
 * A step of its own was the obvious fix and is the wrong one. `steps.test.ts`
 * pins two things deliberately: setup is at most seven screens, and exactly two
 * screens stand between opening the app and pressing the shortcut. An eighth
 * screen breaks both, and setup is where people give up — spending a screen of
 * that budget on configuration is how you lose the people you were configuring
 * for.
 *
 * So it rides on "Connect your AIs", which is already the step about what talks
 * to what, and costs no screen at all.
 *
 * ── Why it is absent rather than disabled when nothing is installed ──────────
 *
 * `mcpClients` only returns clients actually on the machine. Offering to
 * configure software somebody does not have is a button that appears to work
 * and does nothing, and on this screen it would also be the first thing they
 * ever saw Sidq fail at.
 */

interface Props {
  bridge: OnboardingBridge | null;
}

export function LetAiAsk({ bridge }: Props) {
  /** `null` while unknown. Empty means none installed, which renders nothing. */
  const [clients, setClients] = useState<[string, string, boolean][] | null>(
    null,
  );
  const [connected, setConnected] = useState<string[]>([]);
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    void bridge.mcpClients().then((found) => {
      if (!cancelled) setClients(found);
    });
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  if (!clients || clients.length === 0) return null;

  const connect = (id: string, label: string) => {
    setWorking(id);
    void bridge
      ?.connectMcp(id)
      .then((where) => {
        if (where) setConnected((was) => [...was, label]);
      })
      .finally(() => setWorking(null));
  };

  return (
    <section className="mt-8 border-t border-ink/10 pt-6">
      <h3 className="text-[0.9375rem] font-medium text-ink">Let them ask Sidq back</h3>
      <p className="mt-1.5 max-w-[46ch] text-[0.875rem] leading-relaxed text-ink/60">
        Everything else here is you carrying something across. This is the other
        direction: the assistant asks Sidq what it needs, before it answers, with
        nothing for you to press.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {clients.map(([id, label]) => {
          const done = connected.includes(label);
          return (
            <button
              key={id}
              disabled={done || working === id}
              onClick={() => connect(id, label)}
              className={cn(
                "rounded-[10px] px-3 py-1.5 text-[0.8125rem] font-medium",
                "cursor-pointer transition-colors duration-150",
                done
                  ? "bg-transparent text-ink/45 ring-1 ring-inset ring-ink/15"
                  : "bg-ink text-paper hover:bg-ink/85 active:scale-[0.98]",
                working === id && "opacity-60",
              )}
            >
              {done ? `${label} connected` : `Connect ${label}`}
            </button>
          );
        })}
      </div>

      {/*
        * The restart line is the whole reason this says anything after the
        * click. Every MCP client reads its config once at launch, so a
        * connection that worked looks exactly like one that failed until the
        * app is restarted — and somebody who does not know that concludes it
        * did not work, on the screen where they are deciding whether Sidq does.
        */}
      {connected.length > 0 && (
        <p className="mt-3 max-w-[46ch] text-[0.875rem] leading-relaxed text-ink/55">
          Restart {connected.length === 1 ? connected[0] : "them"} and it will
          have Sidq. Nothing is sent anywhere: it reads the same index on this
          Mac that the picker does.
        </p>
      )}

      <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink/40">
        You can change this later under What you&rsquo;re on.
      </p>
    </section>
  );
}
