import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent, within } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import type { desktopBridge } from "@/lib/onboarding/bridge";
import { Conversations } from "./Conversations";
import { Connections } from "./Connections";
import { Shortcuts } from "./Shortcuts";
import { Settings } from "./Settings";

/*
 * The panels the sidebar grew on 27 Sep.
 *
 * Each is held to the window's one rule: it shows something real, read from
 * this Mac, and does what its buttons say. These are written from what each
 * panel promises the person looking at it, not from its code.
 */

type Bridge = NonNullable<ReturnType<typeof desktopBridge>>;

function session(id: string, source: string, title: string, hoursAgo: number) {
  return {
    sessionId: id,
    source,
    title,
    project: "/x/shop",
    projectName: "shop",
    lastPrompt: "carry on",
    branch: "main",
    endedAt: Date.now() - hoursAgo * 3_600_000,
    turns: 20,
    activeMinutes: 30,
  };
}

let bridge: Partial<Bridge>;

beforeEach(() => {
  bridge = {
    recentWork: vi.fn(async () => [
      session("a", "chatgpt", "Why checkout loses payments", 1),
      session("b", "claude-code", "Stripe webhook retries", 2),
      session("c", "chatgpt", "Pricing page copy", 3),
    ]),
    assistantList: vi.fn(async () => [{ id: "claude", label: "Claude" }]),
    handoverText: vi.fn(async () => ({ text: "the handover", limited: false, used: 1, cap: null })),
    saveTranscript: vi.fn(async () => ({ path: "/Users/x/Downloads/a.md", limited: false, used: 1, cap: null, words: 10 })),
    handOverInto: vi.fn(async () => {}),
    mcpClients: vi.fn(async () => [
      ["claude-code", "Claude Code", true],
      ["cursor", "Cursor", false],
    ] as [string, string, boolean][]),
    connectMcp: vi.fn(async () => "/Users/x/.cursor/mcp.json"),
    mcpConfigBlock: vi.fn(async () => '{\n  "mcpServers": {}\n}'),
    pickerShortcut: vi.fn(async () => "⌘⇧K"),
    tapKeys: vi.fn(async () => ["right ⌘", "left ⌃"] as [string, string]),
    openAtLogin: vi.fn(async () => false),
    setOpenAtLogin: vi.fn(async (on: boolean) => on),
    counting: vi.fn(async () => false),
    setCounting: vi.fn(async () => {}),
    countedEvents: vi.fn(async () => [] as [string, string][]),
  };
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
});

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

const b = () => bridge as Bridge;

describe("conversations", () => {
  test("lists what was read, newest first, and filters to one assistant", async () => {
    render(<Conversations bridge={b()} />);
    await settle();

    const titles = () => screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(titles()[0]).toMatch(/Why checkout loses payments/);
    expect(titles()).toHaveLength(3);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Claude Code" }));
    });
    expect(titles()).toHaveLength(1);
    expect(titles()[0]).toMatch(/Stripe webhook retries/);
  });

  test("copy puts the compiled handover on the clipboard and says so", async () => {
    render(<Conversations bridge={b()} />);
    await settle();
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Copy" })[0]);
    });
    await settle();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("the handover");
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
  });

  test("a week that is used up says so instead of copying nothing", async () => {
    bridge.handoverText = vi.fn(async () => ({ text: null, limited: true, used: 5, cap: 5 }));
    render(<Conversations bridge={b()} />);
    await settle();
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Copy" })[0]);
    });
    await settle();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Weekly limit reached");
  });

  test("says it is the recent list, not everything", async () => {
    render(<Conversations bridge={b()} />);
    await settle();
    expect(screen.getByText(/Search reaches everything older/)).toBeInTheDocument();
  });
});

describe("connections", () => {
  test("a tool that already has Sidq says so, one that does not offers to connect", async () => {
    render(<Connections bridge={b()} />);
    await settle();
    expect(screen.getByText("1 OF 2 CONNECTED")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect Cursor" })).toBeInTheDocument();
  });

  test("connecting says to restart, because a working connection looks like a broken one", async () => {
    render(<Connections bridge={b()} />);
    await settle();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect Cursor" }));
    });
    await settle();
    expect(bridge.connectMcp).toHaveBeenCalledWith("cursor");
    expect(screen.getByText("Restart Cursor and it has Sidq.")).toBeInTheDocument();
  });

  test("a refused write does not claim success", async () => {
    bridge.connectMcp = vi.fn(async () => null);
    render(<Connections bridge={b()} />);
    await settle();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect Cursor" }));
    });
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent(/Could not add Sidq to Cursor/);
    expect(screen.queryByText(/Restart Cursor/)).not.toBeInTheDocument();
  });
});

describe("shortcuts", () => {
  test("names the keys that are actually bound", async () => {
    bridge.tapKeys = vi.fn(async () => ["fn", "right ⌥"] as [string, string]);
    render(<Shortcuts bridge={b()} />);
    await settle();
    expect(screen.getByText("⌘⇧K")).toBeInTheDocument();
    expect(screen.getByText("fn ×2")).toBeInTheDocument();
    expect(screen.getByText("right ⌥ ×2")).toBeInTheDocument();
  });

  test("with no shortcut free, it says why and where else to open it", async () => {
    bridge.pickerShortcut = vi.fn(async () => null);
    render(<Shortcuts bridge={b()} />);
    await settle();
    expect(screen.getByText(/Another app owns every shortcut Sidq tried/)).toBeInTheDocument();
  });
});

describe("settings", () => {
  test("open at login reads the real state and shows what it ended up as", async () => {
    render(<Settings bridge={b()} theme="light" onTheme={() => {}} />);
    await settle();
    expect(screen.getByText(/^Off\. Sidq only runs when you open it/)).toBeInTheDocument();
    const row = screen.getByText("Open at login").closest("div")!.parentElement!;
    await act(async () => {
      fireEvent.click(within(row).getByRole("button", { name: "Turn it on" }));
    });
    await settle();
    expect(bridge.setOpenAtLogin).toHaveBeenCalledWith(true);
    expect(screen.getByText(/^On\. Sidq starts with your Mac/)).toBeInTheDocument();
  });

  test("appearance offers both and marks the one in use", async () => {
    const onTheme = vi.fn();
    render(<Settings bridge={b()} theme="dark" onTheme={onTheme} />);
    await settle();
    expect(screen.getByRole("button", { name: "dark" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "light" }));
    expect(onTheme).toHaveBeenCalledWith("light");
  });
});

/*
 * The same guard Home.test.tsx holds Home.tsx to, over the panels that moved
 * out of it: a hard-coded colour here is invisible in one theme or the other.
 */
describe("every panel follows the theme", () => {
  test("no colour in the window's panel files is hard-coded", () => {
    for (const file of readdirSync("src/routes/home").filter((f) => f.endsWith(".tsx") && !f.includes(".test."))) {
      const source = readFileSync(`src/routes/home/${file}`, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(source, file).not.toMatch(/#[0-9A-Fa-f]{6}/);
      expect(source, file).not.toMatch(/\b(bg|text|border|from|via|to)-(white|black)\b/);
      expect(source, file).not.toMatch(/ring-black|ring-white/);
    }
  });
});
