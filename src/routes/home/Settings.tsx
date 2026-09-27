import { useEffect, useState } from "react";
import type { desktopBridge } from "@/lib/onboarding/bridge";
import { RELEASE_VERSION } from "@/lib/releases";
import { cn } from "@/lib/cn";
import { AutoRow, PanelHead, SectionHead, Toggle } from "./ui";

/*
 * The few things about Sidq itself that are a choice.
 *
 * Appearance, whether it opens at login, and what it counts. Each was somewhere
 * else first: the theme as an unlabelled icon in the sidebar (still there), the
 * login item only in the tray menu, and counting at the bottom of the overview,
 * under the work it had nothing to do with. None of them is an automation, so
 * none of them belongs in the list of things Sidq does for you.
 */

type Bridge = ReturnType<typeof desktopBridge>;
export type Theme = "light" | "dark";

export function Settings({
  bridge,
  theme,
  onTheme,
}: {
  bridge: Bridge;
  theme: Theme;
  onTheme: (next: Theme) => void;
}) {
  const [atLogin, setAtLogin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!bridge) return;
    void bridge.openAtLogin().then(setAtLogin, () => setAtLogin(null));
  }, [bridge]);

  return (
    <>
      <PanelHead title="Settings" lead={`Sidq ${RELEASE_VERSION}. Everything here stays on this Mac.`} />

      <section aria-labelledby="general" className="mt-10">
        <SectionHead id="general" title="General" />
        <ul className="mt-4 divide-y divide-[var(--w-line)] border-y border-[var(--w-line)]">
          <AutoRow title="Appearance" body="This window only. The dot and the picker follow the website's paper either way.">
            <div role="group" aria-label="Appearance" className="flex rounded-[9px] bg-[var(--w-raised)] p-0.5">
              {(["light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => onTheme(t)}
                  aria-pressed={theme === t}
                  className={cn(
                    "h-7 cursor-pointer rounded-[7px] px-3 text-[0.8125rem] capitalize transition-[background-color,color,box-shadow] duration-150",
                    theme === t
                      ? "bg-[var(--w-surface)] text-[var(--w-text)] shadow-[0_0_0_1px_var(--w-line)]"
                      : "text-[var(--w-text-3)] hover:text-[var(--w-text)]",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </AutoRow>
          {atLogin !== null && (
            <AutoRow
              title="Open at login"
              body={
                atLogin
                  ? "On. Sidq starts with your Mac, so the dot is there before you open an AI."
                  : "Off. Sidq only runs when you open it, and reads nothing while it is closed."
              }
            >
              <Toggle
                on={atLogin}
                onChange={(next) => {
                  void bridge?.setOpenAtLogin(next).then(setAtLogin);
                }}
              />
            </AutoRow>
          )}
        </ul>
      </section>

      <Counting bridge={bridge} />
    </>
  );
}

/**
 * What Sidq counts, and the switch that stops it.
 *
 * ── Why the list is printed rather than summarised ───────────────────────────
 *
 * Every app with a privacy toggle says "usage data" and expects to be believed.
 * This product's entire argument is that you do not have to believe it, so the
 * events are named, in full, in the window, and the list comes from Rust rather
 * than being typed here — a hand-written copy would start lying the moment an
 * event was added, and it would lie in the one place somebody went to check.
 *
 * The section is absent until the first read returns, rather than rendering an
 * off switch that might be wrong. Showing "off" to somebody who turned it on is
 * a privacy control giving the wrong answer, which is worse than none.
 */
function Counting({ bridge }: { bridge: Bridge }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [events, setEvents] = useState<[string, string][]>([]);
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    void bridge.counting().then(setOn);
    void bridge.countedEvents().then(setEvents);
  }, [bridge]);

  if (on === null) return null;

  return (
    <section aria-labelledby="privacy" className="mt-12">
      <SectionHead id="privacy" title="Privacy" />
      <ul className="mt-4 border-y border-[var(--w-line)]">
        <AutoRow
          title="Counting how you use Sidq"
          body={
            on
              ? "On. Numbers only, with no text of any kind in them: never a conversation, a title, a prompt or a filename. Turning it off also deletes anything not yet sent."
              : "Off. Nothing about how you use Sidq leaves this Mac."
          }
        >
          <Toggle
            on={on}
            onChange={(next) => {
              setOn(next);
              void bridge?.setCounting(next);
            }}
          />
        </AutoRow>
      </ul>

      {events.length > 0 && (
        <>
          <button
            onClick={() => setShowing((was) => !was)}
            className="mt-3 cursor-pointer text-[0.8125rem] text-[var(--w-text-3)] underline underline-offset-4 hover:text-[var(--w-text)]"
          >
            {showing
              ? "Hide the list"
              : `Everything it can count (${events.length})`}
          </button>
          {showing && (
            <ul className="mt-3 space-y-2">
              {events.map(([name, what]) => (
                <li
                  key={name}
                  className="flex flex-wrap items-baseline gap-x-3"
                >
                  <span className="font-mono text-[0.75rem] text-[var(--w-text-4)]">
                    {name}
                  </span>
                  <span className="min-w-0 flex-1 text-[0.8125rem] leading-relaxed text-[var(--w-text-3)]">
                    {what}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
