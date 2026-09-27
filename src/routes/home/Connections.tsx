import { useEffect, useState } from "react";
import type { desktopBridge } from "@/lib/onboarding/bridge";
import { cn } from "@/lib/cn";
import { PanelHead, SectionHead } from "./ui";

/*
 * The AI tools that can ask Sidq themselves.
 *
 * Everything else in the window is somebody carrying a conversation across by
 * hand. This is the other direction: a tool connected over MCP asks Sidq what
 * it needs before it answers, and nobody presses anything. It was a section at
 * the bottom of setup and a button in a panel; it is the part of Sidq closest
 * to working on its own, so it gets a page that says which tools have it.
 *
 * Only tools actually installed on this Mac are listed (`mcp_clients` checks),
 * and "Connected" is read from each tool's own config file, not remembered
 * from a button press.
 */

type Bridge = ReturnType<typeof desktopBridge>;

export function Connections({ bridge }: { bridge: Bridge }) {
  const [clients, setClients] = useState<[string, string, boolean][] | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [restart, setRestart] = useState<string[]>([]);
  const [refused, setRefused] = useState<string | null>(null);
  const [block, setBlock] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    void bridge.mcpClients().then(setClients, () => setClients([]));
    void bridge.mcpConfigBlock().then(setBlock, () => setBlock(null));
  }, [bridge]);

  const connect = (id: string, label: string) => {
    setWorking(id);
    setRefused(null);
    void bridge
      ?.connectMcp(id)
      .then((where) => {
        if (!where) {
          setRefused(label);
          return;
        }
        setRestart((was) => [...was, label]);
        setClients((was) => (was ?? []).map((c) => (c[0] === id ? [c[0], c[1], true] : c)));
      })
      .finally(() => setWorking(null));
  };

  const connected = (clients ?? []).filter((c) => c[2]).length;

  return (
    <>
      <PanelHead
        eyebrow={clients && clients.length > 0 ? `${connected} of ${clients.length} connected` : undefined}
        title="Connections"
        lead="AI tools that ask Sidq directly, over MCP, before they answer. Nothing to press, and nothing leaves this Mac: they read the same index the picker does."
      />

      <section aria-labelledby="tools" className="mt-10">
        <SectionHead id="tools" title="On this Mac" />
        {clients !== null && clients.length === 0 && (
          <p className="mt-4 border-y border-[var(--w-line)] py-5 text-[0.875rem] leading-relaxed text-[var(--w-text-3)]">
            None of the tools Sidq can connect to are installed: Claude Code, Claude Desktop or
            Cursor. Any other MCP client can use the block below.
          </p>
        )}
        {clients && clients.length > 0 && (
          <ul className="mt-4 divide-y divide-[var(--w-line)] border-y border-[var(--w-line)]">
            {clients.map(([id, label, on]) => (
              <li key={id} className="flex items-center gap-4 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-medium text-[var(--w-text)]">{label}</span>
                  <span className="block text-[0.8125rem] text-[var(--w-text-3)]">
                    {restart.includes(label)
                      ? `Restart ${label} and it has Sidq.`
                      : on
                        ? "Asks Sidq for context on its own."
                        : "Not connected yet."}
                  </span>
                </span>
                {on ? (
                  <span className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-[var(--w-accent)]">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--w-accent)]" />
                    Connected
                  </span>
                ) : (
                  <button
                    onClick={() => connect(id, label)}
                    disabled={working === id}
                    className={cn(
                      "h-8 cursor-pointer rounded-[9px] bg-[var(--w-invert)] px-3 text-[0.8125rem] font-medium text-[var(--w-on-invert)]",
                      "transition-[opacity,scale] duration-150 hover:opacity-85 active:scale-[0.97] disabled:opacity-50",
                    )}
                  >
                    {working === id ? "Connecting…" : `Connect ${label}`}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {refused && (
          <p role="alert" className="mt-3 text-[0.8125rem] text-[var(--w-danger)]">
            Could not add Sidq to {refused}. Its config file is not valid JSON, so it was left
            untouched. Fix the file, or paste the block below into it yourself.
          </p>
        )}
      </section>

      {block && (
        <section aria-labelledby="any" className="mt-12">
          <SectionHead id="any" title="Any other MCP client" />
          <p className="mt-3 max-w-[60ch] text-[0.8125rem] leading-relaxed text-[var(--w-text-3)]">
            Merge this into the client&rsquo;s MCP config, next to any servers already there.
          </p>
          <div className="relative mt-3">
            <pre className="overflow-x-auto rounded-[10px] bg-[var(--w-raised)] px-4 py-3 font-mono text-[0.75rem] leading-relaxed text-[var(--w-text-2)]">
              {block}
            </pre>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(block).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                });
              }}
              className="absolute right-2 top-2 h-7 cursor-pointer rounded-[7px] bg-[var(--w-surface)] px-2.5 text-[0.75rem] text-[var(--w-text-3)] ring-1 ring-inset ring-[var(--w-line)] transition-colors duration-150 hover:text-[var(--w-text)]"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
