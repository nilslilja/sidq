import { useEffect, useState } from "react";
import type { HandoverRecord, PlanStatus, desktopBridge } from "@/lib/onboarding/bridge";
import { sourceLabel } from "@/lib/companion/sources";
import { projectLabel } from "@/lib/companion/work-history";
import { FEATURES } from "@/lib/features";
import { cn } from "@/lib/cn";
import { Keys, PanelHead, SourceGlyph, whenHandedOver } from "./ui";

/*
 * Every handover, with a way to send each one on again.
 *
 * It was a section halfway down the overview, which meant the thing somebody
 * came back for (the conversation they carried yesterday, to send it somewhere
 * else today) was below the figures and the automations every time. A tab of
 * its own puts the list first and leaves the overview to say what happened.
 */

type Bridge = ReturnType<typeof desktopBridge>;

export function Handovers({ bridge, plan }: { bridge: Bridge; plan: PlanStatus | null }) {
  const [rows, setRows] = useState<HandoverRecord[] | null>(null);
  /*
   * Whether there is a team folder to share into at all.
   *
   * Asked once here rather than per row, and used only to decide whether the
   * button is worth drawing. Rust refuses the call regardless of what this
   * says, so a wrong answer costs a button that does nothing rather than a
   * conversation somewhere it should not be.
   */
  const [sharesWithTeam, setSharesWithTeam] = useState(false);
  /*
   * The assistants a handover can be sent straight into.
   *
   * Fetched once rather than per row: it is the same six every time, it never
   * changes while the window is open, and a request per row on a list of fifty
   * would be fifty requests to answer one question.
   */
  const [assistants, setAssistants] = useState<{ id: string; label: string }[]>(
    [],
  );
  const [shared, setShared] = useState<string | null>(null);
  // The key the picker really got, which is not always ⌘⇧K.
  const [picker, setPicker] = useState<string | null>(null);

  useEffect(() => {
    if (!bridge) return;
    void bridge.recentHandovers().then(setRows);
    void bridge.pickerShortcut().then(setPicker, () => setPicker(null));
    void bridge.assistantList().then(setAssistants, () => setAssistants([]));
    void bridge
      .teamSettings()
      .then((t) => setSharesWithTeam(t.allowed && t.folder !== null), () => {});
  }, [bridge]);

  return (
    <>
      <PanelHead
        eyebrow={plan ? `${plan.handoversUsed.toLocaleString()} in the last 7 days` : undefined}
        title="Handovers"
        lead="Every conversation you have carried to another AI. Each one is also a Markdown file in your Downloads folder, so none of them is lost to a misclick."
      />
      <div className="mt-8">
      {rows !== null && rows.length === 0 && (
        <div className="mt-4 border-y border-[var(--w-line)] py-5">
          <p className="max-w-[56ch] text-[0.875rem] leading-relaxed text-[var(--w-text-3)]">
            Nothing handed over yet. {picker ? <>Press <Keys>{picker}</Keys></> : "Click the dot at the top of the screen"}, pick a
            conversation, press Enter. Each one is also written to your
            Downloads folder as a Markdown file, so nothing is lost to a
            misclick the way a clipboard is.
          </p>
        </div>
      )}

      {rows !== null && rows.length > 0 && (
        <ul className="mt-4 divide-y divide-[var(--w-line)] border-y border-[var(--w-line)]">
          {rows.map((row) => (
            <li
              key={`${row.sessionId}-${row.madeAt}`}
              className="group flex items-center gap-3 py-3"
            >
              <SourceGlyph source={row.source} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.875rem] text-[var(--w-text)]">
                  {row.title || "Untitled conversation"}
                </span>
                <span className="block truncate text-[0.75rem] text-[var(--w-text-3)]">
                  {sourceLabel(row.source)}
                  {projectLabel(row.project) && ` · ${projectLabel(row.project)}`}
                </span>
              </span>
              <span className="shrink-0 text-[0.75rem] tabular-nums text-[var(--w-text-3)]">
                {whenHandedOver(row.madeAt)}
              </span>
              {/*
               * Send it straight into an assistant's box.
               *
               * The promise was one keystroke and it stopped at the
               * clipboard: switch application, find the composer, click it,
               * paste. Sidq already opens these assistants in its own
               * window, so it puts the conversation where it was going.
               *
               * It does not press send. That message costs the person a
               * turn on their own plan, and they may want a line in front
               * of it.
               */}
              {assistants.length > 0 && (
                <select
                  aria-label={`Send ${row.title || "this conversation"} into an assistant`}
                  value=""
                  onChange={(e) => {
                    const assistant = e.target.value;
                    if (!assistant) return;
                    e.target.value = "";
                    void bridge?.handOverInto({
                      sessionId: row.sessionId,
                      source: row.source,
                      resumePoint: "",
                      when: whenHandedOver(row.madeAt),
                      project: row.project,
                      assistant,
                    });
                  }}
                  className={cn(
                    "shrink-0 cursor-pointer rounded-[8px] bg-transparent px-2 py-1",
                    "text-[0.75rem] text-[var(--w-text-3)] ring-1 ring-inset ring-transparent",
                    "transition-colors duration-150 hover:text-[var(--w-text)] hover:ring-[var(--w-line)]",
                  )}
                >
                  <option value="">Send to…</option>
                  {assistants.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              )}
              {/*
               * Sharing is dark. It is the only feature where a
               * conversation leaves this Mac, and the pitch is now that
               * none of them do. One exception in a settings panel is the
               * exception somebody screenshots. See `FEATURES`.
               */}
              {FEATURES.sharing && sharesWithTeam && (
                <button
                  onClick={() => {
                    void bridge
                      ?.shareHandover({
                        sessionId: row.sessionId,
                        title: row.title || "Untitled conversation",
                        source: row.source,
                        resumePoint: "",
                        when: whenHandedOver(row.madeAt),
                        project: row.project,
                      })
                      .then((ok) => ok && setShared(row.sessionId));
                  }}
                  className={cn(
                    "shrink-0 rounded-[8px] px-2 py-1 text-[0.75rem] font-medium",
                    "cursor-pointer text-[var(--w-text-3)] transition-colors duration-150",
                    "hover:bg-[var(--w-invert)] hover:text-[var(--w-on-invert)]",
                  )}
                >
                  {shared === row.sessionId ? "Shared" : "Share with team"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      </div>
    </>
  );
}
