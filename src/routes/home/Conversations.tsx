import { useEffect, useMemo, useState } from "react";
import type { desktopBridge } from "@/lib/onboarding/bridge";
import { projectLabel, titleOf, type WorkSession } from "@/lib/companion/work-history";
import { sourceLabel } from "@/lib/companion/sources";
import { cn } from "@/lib/cn";
import { PanelHead, SourceGlyph, whenLabel } from "./ui";

/*
 * Every conversation Sidq has read, newest first, and something to do with each.
 *
 * The overview shows six. This is the rest of the recent list, filterable by
 * assistant, with the three things the picker can do on every row: copy the
 * handover, save it as a file, or put it straight into another assistant. It is
 * the picker for somebody who is already in the window rather than somewhere
 * else, so it asks for no shortcut.
 *
 * Fifty rows, because that is what `recent_work` returns; search is the way to
 * everything older, and the panel says so rather than implying this is all.
 */

type Bridge = ReturnType<typeof desktopBridge>;

/** How long "Copied" and "Saved" stay before the row goes back to its actions. */
const SAID_FOR_MS = 1800;

type Said = { id: string; text: string };

export function Conversations({ bridge }: { bridge: Bridge }) {
  const [rows, setRows] = useState<WorkSession[] | null>(null);
  const [only, setOnly] = useState<string>("all");
  const [assistants, setAssistants] = useState<{ id: string; label: string }[]>([]);
  const [said, setSaid] = useState<Said | null>(null);

  useEffect(() => {
    if (!bridge) return;
    void bridge.recentWork(50).then((found) =>
      setRows(
        (found as WorkSession[])
          .filter((s) => typeof s.endedAt === "number")
          .sort((a, b) => b.endedAt - a.endedAt),
      ),
    );
    void bridge.assistantList().then(setAssistants, () => setAssistants([]));
  }, [bridge]);

  useEffect(() => {
    if (!said) return;
    const id = window.setTimeout(() => setSaid(null), SAID_FOR_MS);
    return () => window.clearTimeout(id);
  }, [said]);

  const sources = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows ?? []) {
      const key = r.source ?? "claude-code";
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [rows]);

  const shown = (rows ?? []).filter((r) => only === "all" || (r.source ?? "claude-code") === only);

  const carry = (s: WorkSession) => ({
    sessionId: s.sessionId ?? "",
    title: s.title,
    source: s.source ?? "claude-code",
    resumePoint: s.lastPrompt,
    when: whenLabel(s.endedAt),
    project: s.projectName,
  });

  const copy = async (s: WorkSession) => {
    const out = await bridge?.handoverText(carry(s));
    if (out?.limited) return setSaid({ id: s.sessionId ?? "", text: "Weekly limit reached" });
    if (!out?.text) return setSaid({ id: s.sessionId ?? "", text: "Could not read it" });
    await navigator.clipboard.writeText(out.text);
    setSaid({ id: s.sessionId ?? "", text: "Copied" });
  };

  const save = async (s: WorkSession) => {
    const out = await bridge?.saveTranscript(carry(s));
    if (out?.limited) return setSaid({ id: s.sessionId ?? "", text: "Weekly limit reached" });
    setSaid({ id: s.sessionId ?? "", text: out?.path ? "Saved to Downloads" : "Could not save it" });
  };

  return (
    <>
      <PanelHead
        eyebrow={rows && rows.length > 0 ? `${rows.length} most recent` : undefined}
        title="Conversations"
        lead="Every conversation Sidq has read, newest first, from every AI you use. Copy one, save it as a file, or send it straight into another assistant."
      />

      {sources.length > 1 && (
        <div className="mt-7 flex flex-wrap gap-1.5" role="group" aria-label="Show conversations from">
          {["all", ...sources].map((id) => (
            <button
              key={id}
              onClick={() => setOnly(id)}
              aria-pressed={only === id}
              className={cn(
                "flex h-8 cursor-pointer items-center gap-1.5 rounded-[8px] px-2.5 text-[0.8125rem]",
                "transition-[background-color,color,scale] duration-150 active:scale-[0.97]",
                only === id
                  ? "bg-[var(--w-invert)] text-[var(--w-on-invert)]"
                  : "bg-[var(--w-raised)] text-[var(--w-text-3)] hover:text-[var(--w-text)]",
              )}
            >
              {id === "all" ? "All" : sourceLabel(id, true)}
            </button>
          ))}
        </div>
      )}

      {rows !== null && rows.length === 0 && (
        <p className="mt-8 border-y border-[var(--w-line)] py-5 text-[0.875rem] leading-relaxed text-[var(--w-text-3)]">
          Nothing read yet. Open a conversation in any AI you use and it lands here.
        </p>
      )}

      {shown.length > 0 && (
        <ul className="mt-6 divide-y divide-[var(--w-line)] border-y border-[var(--w-line)]">
          {shown.map((s) => {
            const source = s.source ?? "claude-code";
            const project = projectLabel(s.projectName);
            const note = said && said.id === s.sessionId ? said.text : null;
            const canCarry = Boolean(s.sessionId);
            return (
              <li key={`${s.sessionId ?? s.title}-${s.endedAt}`} className="group flex items-center gap-3 py-3">
                <SourceGlyph source={source} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.875rem] text-[var(--w-text)]">{titleOf(s)}</span>
                  <span className="block truncate text-[0.75rem] text-[var(--w-text-3)]">
                    {sourceLabel(source)}
                    {project && ` · ${project}`}
                    {` · ${whenLabel(s.endedAt)}`}
                  </span>
                </span>

                {note ? (
                  <span role="status" className="shrink-0 text-[0.75rem] font-medium text-[var(--w-accent)]">
                    {note}
                  </span>
                ) : (
                  canCarry && (
                    <span className="flex shrink-0 items-center gap-1 opacity-60 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                      <RowAction onClick={() => void copy(s)}>Copy</RowAction>
                      <RowAction onClick={() => void save(s)}>Save</RowAction>
                      {assistants.length > 0 && (
                        <select
                          aria-label={`Send ${titleOf(s)} into an assistant`}
                          value=""
                          onChange={(e) => {
                            const assistant = e.target.value;
                            if (!assistant) return;
                            e.target.value = "";
                            void bridge?.handOverInto({ ...carry(s), assistant });
                            setSaid({ id: s.sessionId ?? "", text: "Sent, not submitted" });
                          }}
                          className="h-7 cursor-pointer rounded-[7px] bg-transparent px-1.5 text-[0.75rem] text-[var(--w-text-3)] ring-1 ring-inset ring-[var(--w-line)] transition-colors duration-150 hover:text-[var(--w-text)]"
                        >
                          <option value="">Send to…</option>
                          {assistants.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </span>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}

      {rows !== null && rows.length > 0 && (
        <p className="mt-4 text-[0.8125rem] text-[var(--w-text-3)]">
          The fifty most recent. Search reaches everything older.
        </p>
      )}
    </>
  );
}

function RowAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-7 cursor-pointer rounded-[7px] px-2 text-[0.75rem] text-[var(--w-text-3)]",
        "ring-1 ring-inset ring-[var(--w-line)] transition-[background-color,color,scale] duration-150",
        "hover:bg-[var(--w-raised)] hover:text-[var(--w-text)] active:scale-[0.96]",
      )}
    >
      {children}
    </button>
  );
}
