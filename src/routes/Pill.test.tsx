import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import type {
  OnboardingBridge,
  FoundConversation,
} from "@/lib/onboarding/bridge";

/*
 * The pill across its two states.
 *
 * These resize the window, which is exactly what Rust does and the only signal
 * the component listens to. An earlier version of this file mocked a state
 * event instead — and would have passed throughout the bug it was written for,
 * because a mocked event always arrives.
 *
 * ── The bug, twice ───────────────────────────────────────────────────────────
 * Rust announced the resize with `emit_to(label, …)`, which no JS `listen()`
 * ever receives. Switching to the global `emit` did not fix it either: the emit
 * sat at the end of a chain of `?` where one earlier failure skipped it. Both
 * failures were silent, and both looked the same on screen — a 560x380 window
 * still drawing the collapsed bar, "16 conversations" with no list under it.
 *
 * Neither is possible now, because nothing is announced. The component measures
 * its own window, and these tests move that window.
 */

/** Resize the window the way Rust does, and let the listener run. */
async function resizeTo(width: number) {
  await act(async () => {
    window.innerWidth = width;
    window.dispatchEvent(new Event("resize"));
  });
  await settle();
}

const bridge: Partial<OnboardingBridge> = {
  recentWork: vi.fn(async () => [
    {
      sessionId: "abc",
      project: "/Users/x/Sidq",
      projectName: "Sidq",
      title: "Pricing page copy",
      lastPrompt: "carry on with the tiers",
      branch: "main",
      endedAt: Date.now(),
      turns: 40,
      activeMinutes: 90,
      source: "claude-code",
    },
    {
      sessionId: "def",
      project: "/Users/x/Sidq",
      projectName: "Sidq",
      title: "Notch placement on the pill",
      lastPrompt: "where does it go on a notched mac",
      branch: "main",
      endedAt: Date.now() - 3_600_000,
      turns: 22,
      activeMinutes: 40,
      source: "chatgpt",
    },
  ]),
  /*
   * One project, which is what the picker's first row is.
   *
   * The pill asks for the whole list and takes the busiest, so the mock returns
   * a second one to prove it does not just render everything it is given.
   */
  projects: vi.fn(async () => [
    {
      path: "/Users/x/Sidq",
      name: "Sidq",
      conversations: 9,
      turns: 400,
      minutes: 800,
      started: Date.now() - 86_400_000 * 14,
      touched: Date.now(),
    },
    {
      path: "/Users/x/Other",
      name: "Other",
      conversations: 2,
      turns: 20,
      minutes: 30,
      started: Date.now() - 86_400_000,
      touched: Date.now() - 86_400_000,
    },
  ]),
  memoryText: vi.fn(async () => "# What I am working on\n\nSidq"),
  /*
   * Present so the project row can be proved not to reach it. An undefined
   * method passes `not.toHaveBeenCalled()` for the wrong reason.
   */
  saveTranscript: vi.fn(async () => ({
    path: "/tmp/x.md",
    words: 10,
    used: 1,
    cap: 5,
    limited: false,
    wall: null,
  })),
  /*
   * The five places a handover can go, as `assistants.rs` lists them. The order
   * is load-bearing for the rail tests: the digit keys address cells by
   * position, and Claude is second so that a wall on `claude.ai` can be proved
   * to move the starting selection off it.
   */
  assistantList: vi.fn(async () => [
    { id: "chatgpt", label: "ChatGPT" },
    { id: "claude.ai", label: "Claude" },
    { id: "gemini", label: "Gemini" },
    { id: "grok", label: "Grok" },
    { id: "deepseek", label: "DeepSeek" },
  ]),
  /*
   * The last step. Captured, because "it opened the assistant with the
   * conversation in it" is the entire feature and the only way to see it from
   * here is the arguments it was called with.
   */
  handOverInto: vi.fn(async () => {}),
  /*
   * False, so the tests run against the CSS the website also ships. Whether
   * macOS is drawing the surface changes nothing this file asserts, and
   * pretending it is would hide the classes every other test reads.
   */
  nativeGlass: vi.fn(async () => false),
  /*
   * The handover compiled for one destination, and the real browser.
   *
   * The rail used to inject straight into Sidq's own webview. It does not any
   * more: that webview may never have been signed in, and Google refuses OAuth
   * inside an embedded one at all, so the conversation could be typed into a
   * logged-out page while the panel said it worked.
   */
  handoverTextFor: vi.fn(async () => "# Carry on\n\nthe whole conversation"),
  openAssistantInBrowser: vi.fn(async () => {}),
  indexStats: vi.fn(async () => [16, 5414] as [number, number]),
  expandPill: vi.fn(async () => {}),
  hidePill: vi.fn(async () => {}),
  openHome: vi.fn(async () => {}),
  movePill: vi.fn(async () => {}),
  /*
   * Captured, because which conversation the picker is aimed at is the whole
   * contract with the grab gesture: Rust takes the row reported here rather
   * than the newest conversation, so a wrong or stale value hands somebody a
   * different conversation from the one they are looking at.
   */
  aimAt: vi.fn(async () => {}),
  onChanged: vi.fn(async () => () => {}),
  /*
   * Captured rather than ignored, so the test below can fire a find the way
   * Rust does instead of reaching into the component.
   */
  onFound: vi.fn(async (cb: (f: FoundConversation) => void) => {
    announceFound = cb;
    return () => {
      announceFound = undefined;
    };
  }),
};

/** Set by the mocked `onFound` once the pill has subscribed. */
let announceFound: ((found: FoundConversation) => void) | undefined;

vi.mock("@/lib/onboarding/bridge", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  desktopBridge: () => bridge,
}));

// Nothing under test here makes a sound, and jsdom has no audio.
import { playCue } from "@/lib/companion/sound";
vi.mock("@/lib/companion/sound", () => ({ playCue: vi.fn() }));

const { Pill } = await import("./Pill");

/** The two sizes Rust actually uses, from pill_window.rs. */
const COLLAPSED_WIDTH = 228;
const EXPANDED_WIDTH = 560;

/** Let the listener register and the loaders settle. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("the pill, across the two states", () => {
  beforeEach(() => {
    // Every test starts at the collapsed width, the way a launch does.
    window.innerWidth = COLLAPSED_WIDTH;
    vi.clearAllMocks();
  });

  test("starts as the bar, with the real count on it", async () => {
    render(<Pill />);
    await settle();

    expect(
      screen.getByRole("button", { name: /pick up a conversation/i }),
    ).toBeInTheDocument();
    // The count alone. The bar lives inside the menu bar now and "16
    // conversations" does not fit in 152 points without covering something.
    expect(screen.getByText("16")).toBeInTheDocument();
  });

  test("tells Rust which conversation the picker is aimed at, and stops when it shuts", async () => {
    /*
     * The contract behind the grab gesture. Double-tapping the modifier with
     * the picker open must take the row being looked at, and Rust can only know
     * which that is because this is reported.
     *
     * The null on collapse matters as much as the id: left set, the gesture
     * would keep pointing at whatever was last hovered long after the window
     * shut, and its whole purpose is working with nothing open.
     */
    render(<Pill />);
    await settle();

    await resizeTo(EXPANDED_WIDTH);
    /*
     * Null on open, because the row that opens selected is the project, and the
     * project is not a conversation. Rust falls back to the newest conversation
     * on a null, which is what this used to report anyway — so the gesture
     * lands on the same conversation it always did.
     */
    expect(bridge.aimAt).toHaveBeenLastCalledWith(null);

    // One row down is the first conversation, and now it aims.
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "ArrowDown" });
    await settle();
    expect(bridge.aimAt).toHaveBeenLastCalledWith("abc");

    await resizeTo(COLLAPSED_WIDTH);
    expect(bridge.aimAt).toHaveBeenLastCalledWith(null);
  });

  test("the first row is what you are working on, and Enter carries it", async () => {
    /*
     * The repositioning, asserted. Open, press Enter, and what is on the
     * clipboard is the memory of the project rather than a conversation
     * somebody had to recognise from a title.
     */
    const written = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText: written } });

    render(<Pill />);
    await settle();
    await resizeTo(EXPANDED_WIDTH);

    expect(screen.getByText("Sidq")).toBeTruthy();
    // The busiest project, not every project it was handed.
    expect(screen.queryByText("Other")).toBeNull();

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await settle();

    expect(bridge.memoryText).toHaveBeenCalledWith("/Users/x/Sidq");
    expect(written).toHaveBeenCalledWith("# What I am working on\n\nSidq");
    // Never the transcript path: the memory is not a conversation handover.
    expect(bridge.saveTranscript).not.toHaveBeenCalled();
  });

  test("typing hands the top row back to the conversations", async () => {
    /*
     * A query is somebody hunting one conversation. The project sitting above
     * their best match is a row that does not match what they typed, and Enter
     * on it would copy something they did not search for.
     */
    render(<Pill />);
    await settle();
    await resizeTo(EXPANDED_WIDTH);

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "notch" },
    });
    await settle();

    expect(screen.queryByText("Sidq")).toBeNull();
    expect(screen.getByText("Notch placement on the pill")).toBeTruthy();
  });

  test("renders the picker once the window is the picker's size", async () => {
    /*
     * The exact failure, now reproducible without the app. Grow the window and
     * the bar must be gone; leave the bar on screen at 560 wide and this is
     * what a person saw for an afternoon.
     */
    render(<Pill />);
    await settle();

    await resizeTo(EXPANDED_WIDTH);

    expect(screen.getByLabelText(/filter conversations/i)).toBeInTheDocument();
    expect(screen.getByText("Pricing page copy")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /pick up a conversation/i }),
    ).not.toBeInTheDocument();
  });

  test("goes back to the bar when it collapses", async () => {
    render(<Pill />);
    await settle();

    await resizeTo(EXPANDED_WIDTH);
    await resizeTo(COLLAPSED_WIDTH);

    expect(
      screen.queryByLabelText(/filter conversations/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /pick up a conversation/i }),
    ).toBeInTheDocument();
  });

  test("loads the conversations on opening, not once at startup", async () => {
    // The window outlives every use of it now, so a list fetched at launch
    // would still be yesterday's by the afternoon.
    render(<Pill />);
    await settle();
    expect(bridge.recentWork).not.toHaveBeenCalled();

    await resizeTo(EXPANDED_WIDTH);
    expect(bridge.recentWork).toHaveBeenCalled();
  });

  test("clicking the bar asks Rust to expand it", async () => {
    // The bar cannot resize itself; the window belongs to Rust.
    const { getByRole } = render(<Pill />);
    await settle();

    await act(async () => {
      getByRole("button", { name: /pick up a conversation/i }).click();
    });

    expect(bridge.expandPill).toHaveBeenCalled();
  });
});

describe("the source filter", () => {
  test("offers only the AIs in the list, and narrows to one", async () => {
    /*
     * The picker showed fifty rows from every AI on the machine ordered only by
     * when they ended, so finding this morning's ChatGPT thread meant reading
     * past everything else.
     */
    render(<Pill />);
    await resizeTo(EXPANDED_WIDTH);

    expect(screen.getByText("Pricing page copy")).toBeInTheDocument();
    expect(screen.getByText("Notch placement on the pill")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /all ais/i }));
    });

    // Gemini is supported and unused, so it is not offered.
    expect(
      screen.queryByRole("button", { name: /gemini/i }),
    ).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /chatgpt/i }));
    });
    await settle();

    expect(screen.getByText("Notch placement on the pill")).toBeInTheDocument();
    expect(screen.queryByText("Pricing page copy")).not.toBeInTheDocument();
  });

  test("escape closes the menu without closing the picker", async () => {
    /*
     * Backing out of a dropdown must not throw away the query typed to get
     * there. The menu takes Escape first; the second one dismisses.
     */
    render(<Pill />);
    await resizeTo(EXPANDED_WIDTH);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /all ais/i }));
    });
    expect(
      screen.getByRole("button", { name: /chatgpt/i }),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText(/filter conversations/i), {
        key: "Escape",
      });
    });

    expect(
      screen.queryByRole("button", { name: /chatgpt/i }),
    ).not.toBeInTheDocument();
    expect(bridge.hidePill).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/filter conversations/i)).toBeInTheDocument();
  });
});

describe("a conversation arriving", () => {
  beforeEach(() => {
    // The width reset lives inside the other describe, so this block has to ask
    // for it too — without it these run at whatever width the last test left
    // behind, which is the expanded picker and not the bar under test.
    window.innerWidth = COLLAPSED_WIDTH;
    vi.clearAllMocks();
  });

  /*
   * ── Why this is announced at all ─────────────────────────────────────────
   * The browser reader can only see an assistant while that assistant's window
   * is in front, which means at the instant Sidq finds a conversation the
   * person is by definition looking at something else. Before this, the only
   * way to learn whether opening ChatGPT had worked was to switch to Sidq and
   * check — so the product was doing its main job invisibly and reading as
   * broken.
   */
  test("rings once, on the window that is always alive", async () => {
    render(<Pill />);
    await settle();

    expect(announceFound).toBeDefined();

    await act(async () => {
      announceFound?.({
        source: "chatgpt",
        title: "Raw Milk in Carrefour",
        firstTime: true,
      });
    });

    expect(playCue).toHaveBeenCalledWith("found");
  });

  test("the bar says which assistant it came from, then goes back to the count", async () => {
    /*
     * The bar is the only surface guaranteed to be on screen at the moment a
     * conversation is found. Reading a browser assistant requires that browser
     * to be in front, so the main window is behind something and the
     * notification may be a banner that has already gone.
     *
     * It must also give the count back. A bar still reading "Saved" a minute
     * later is showing something that is no longer news and is hiding the one
     * number it exists for.
     */
    vi.useFakeTimers();
    try {
      render(<Pill />);
      await settle();

      await act(async () => {
        announceFound?.({
          source: "chatgpt",
          title: "Raw Milk in Carrefour",
          firstTime: true,
        });
      });
      expect(screen.getByText("Picked up · ChatGPT")).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.queryByText("Picked up · ChatGPT")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test("an assistant nobody has a name for does not print its slug", async () => {
    render(<Pill />);
    await settle();

    await act(async () => {
      announceFound?.({
        source: "something-new",
        title: "A conversation",
        firstTime: true,
      });
    });

    expect(screen.getByText("Picked up · an AI")).toBeInTheDocument();
  });

  test("it subscribes even while the picker is open", async () => {
    /*
     * The count effect beside this one returns early unless the bar is
     * collapsed, which is right for a number nothing is showing and wrong here:
     * a find lands while another app is in front, and the picker may well be
     * sitting open behind it. Folding the two together would have silently
     * dropped exactly the case this feature exists for.
     */
    render(<Pill />);
    await settle();

    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true, shiftKey: true });
    });
    await settle();

    expect(announceFound).toBeDefined();
  });
});

describe("the bar never goes blank", () => {
  beforeEach(() => {
    window.innerWidth = COLLAPSED_WIDTH;
    vi.clearAllMocks();
  });

  test("a bridge read that throws outright still leaves a pill on screen", async () => {
    /*
     * The failure this pins, which happened twice while the rail was being
     * built. A rejected promise is the obvious case and `.catch` covers it; a
     * bridge method that is simply absent throws *synchronously*, before any
     * promise exists, which threw out of the effect and rendered nothing at
     * all.
     *
     * The pill is the one surface that is always on screen. A blank one is the
     * worst outcome available, and worse than either thing these two reads
     * decide.
     */
    (bridge.nativeGlass as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => {
        throw new TypeError("bridge.nativeGlass is not a function");
      },
    );
    (bridge.assistantList as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => {
        throw new TypeError("bridge.assistantList is not a function");
      },
    );

    render(<Pill />);
    await settle();

    expect(
      screen.getByRole("button", { name: /pick up a conversation/i }),
    ).toBeInTheDocument();
  });

  test("and the picker still opens, with the list it came for", async () => {
    (bridge.nativeGlass as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => {
        throw new TypeError("nope");
      },
    );

    render(<Pill />);
    await settle();
    await resizeTo(EXPANDED_WIDTH);

    expect(screen.getByText("Pricing page copy")).toBeInTheDocument();
  });
});

describe("the escape hatch", () => {
  beforeEach(() => {
    window.innerWidth = COLLAPSED_WIDTH;
    vi.clearAllMocks();
  });

  /** Open the picker, land on the first conversation, and save it. */
  async function save() {
    render(<Pill />);
    await settle();
    await resizeTo(EXPANDED_WIDTH);

    const box = screen.getByRole("textbox");
    // Row zero is the project; one down is the first conversation.
    fireEvent.keyDown(box, { key: "ArrowDown" });
    await settle();
    fireEvent.keyDown(box, { key: "Enter" });
    await settle();
    return box;
  }

  test("the panel offers to carry it on, rather than ending at a file", async () => {
    /*
     * The dead end this exists to remove. The save used to finish at "Saved to
     * Downloads · attach it to any AI", which leaves switching application,
     * finding the composer and pasting to be done by hand — the four steps the
     * keystroke exists to delete.
     */
    await save();

    expect(screen.getByText(/Saved to Downloads/)).toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", { name: /carry this conversation/i }),
    ).toBeInTheDocument();
    for (const name of ["ChatGPT", "Claude", "Gemini", "Grok", "DeepSeek"]) {
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    }
  });

  test("Enter copies the handover and opens the assistant in the real browser", async () => {
    const written = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText: written } });

    const box = await save();

    fireEvent.keyDown(box, { key: "Enter" });
    await settle();

    // Compiled for the destination it is going to, not generically: what
    // ChatGPT is told about a file is not what Claude is told.
    expect(bridge.handoverTextFor).toHaveBeenCalledWith({
      sessionId: "abc",
      source: "claude-code",
      resumePoint: "carry on with the tiers",
      when: expect.any(String),
      project: "Sidq",
      assistant: "chatgpt",
    });
    expect(written).toHaveBeenCalledWith(
      "# Carry on\n\nthe whole conversation",
    );

    /*
     * The person's own browser, where they are actually signed in. Sidq's
     * webview may never have been, and typing a conversation into a logged-out
     * page while reporting success is the failure this replaced.
     */
    expect(bridge.openAssistantInBrowser).toHaveBeenCalledWith("chatgpt");
    expect(bridge.hidePill).toHaveBeenCalled();
  });

  test("it does not open anything when there is nothing to paste", async () => {
    // An assistant opened with an empty clipboard is worse than an error: the
    // person arrives somewhere expecting a conversation and pastes nothing.
    (bridge.handoverTextFor as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      null,
    );

    const box = await save();
    fireEvent.keyDown(box, { key: "Enter" });
    await settle();

    expect(bridge.openAssistantInBrowser).not.toHaveBeenCalled();
  });

  test("it carries the conversation it just saved, not whatever row is under the cursor", async () => {
    /*
     * The bug this shape avoids. The rail is drawn over a list the sweep keeps
     * re-ranking, so reading `visible[pickedRow]` at the moment somebody picks
     * can hand over a different conversation from the one the panel says it
     * saved. The arguments are captured at save time instead.
     */
    const box = await save();

    // The list moves under the panel, the way a sweep moves it.
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    await settle();

    fireEvent.keyDown(box, { key: "Enter" });
    await settle();

    expect(bridge.handoverTextFor).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "abc" }),
    );
  });

  test("the arrows walk the rail and a digit jumps along it", async () => {
    const box = await save();

    fireEvent.keyDown(box, { key: "ArrowRight" });
    await settle();
    expect(screen.getByRole("radio", { name: "Claude" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    fireEvent.keyDown(box, { key: "4" });
    await settle();
    expect(screen.getByRole("radio", { name: "Grok" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    fireEvent.keyDown(box, { key: "Enter" });
    await settle();
    expect(bridge.openAssistantInBrowser).toHaveBeenCalledWith("grok");
  });

  test("a leftward arrow at the start wraps rather than doing nothing", async () => {
    // Five cells in a row is a ring. Stopping dead at either end is a keypress
    // that appears not to have registered.
    const box = await save();

    fireEvent.keyDown(box, { key: "ArrowLeft" });
    await settle();

    expect(screen.getByRole("radio", { name: "DeepSeek" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("a conversation that simply ended says nothing about anybody being cut off", async () => {
    /*
     * The line has to be earned. `wall` is null for almost every handover, and
     * claiming an assistant stopped when it did not is the one way this screen
     * can lie.
     */
    await save();

    expect(screen.getByText(/Take it somewhere else/)).toBeInTheDocument();
    expect(screen.queryByText(/cut you off/)).toBeNull();
  });

  test("a conversation that hit the wall names what stopped it and refuses that cell", async () => {
    (bridge.saveTranscript as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      path: "/tmp/x.md",
      words: 10,
      used: 1,
      cap: 5,
      limited: false,
      wall: "claude.ai",
    });

    const box = await save();

    expect(screen.getByText(/cut you off/)).toBeInTheDocument();

    /*
     * Still drawn, and refusing. Removing it would leave the rail silently one
     * cell short of the name somebody is looking for at that exact moment.
     */
    const refused = screen.getByRole("radio", { name: "Claude" });
    expect(refused).toBeDisabled();

    // And the selection never starts on it, or the first Enter would do nothing.
    expect(refused).toHaveAttribute("aria-checked", "false");
    fireEvent.keyDown(box, { key: "Enter" });
    await settle();
    expect(bridge.openAssistantInBrowser).toHaveBeenCalledWith("chatgpt");
  });

  test("the refusing cell cannot be reached by a digit either", async () => {
    (bridge.saveTranscript as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      path: "/tmp/x.md",
      words: 10,
      used: 1,
      cap: 5,
      limited: false,
      wall: "claude.ai",
    });

    const box = await save();

    fireEvent.keyDown(box, { key: "2" });
    await settle();

    expect(screen.getByRole("radio", { name: "Claude" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("radio", { name: "ChatGPT" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("the panel waits for a decision instead of closing itself", async () => {
    /*
     * A success card with a countdown is fine. A picker with one takes the
     * decision away mid-thought. It cannot squat either: a click outside
     * collapses the window, which is Rust's job, and Escape closes it.
     */
    vi.useFakeTimers();
    try {
      await save();

      /*
       * Wait for the rail before touching the clock, and that is the whole
       * point rather than tidiness.
       *
       * `saveFile` only sets the self-closing timer when there are no
       * assistants to offer. If `assistantList` has not resolved by the time
       * the save finishes, the panel is briefly a plain success card, the timer
       * is armed, and advancing twenty seconds fires it. That made this test
       * fail roughly one run in twenty, for a reason that had nothing to do
       * with what it is checking.
       */
      expect(
        screen.getByRole("radiogroup", { name: /carry this conversation/i }),
      ).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(20_000);
      });
      expect(bridge.hidePill).not.toHaveBeenCalled();
      expect(
        screen.getByRole("radiogroup", { name: /carry this conversation/i }),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test("without a rail it says what it always said, and still closes itself", async () => {
    // A failed read of the assistant table is not a failed save. The file is in
    // Downloads either way and the panel has to say so.
    (bridge.assistantList as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("no"),
    );

    await save();

    expect(screen.getByText(/Saved to Downloads/)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByText(/Attach it to any AI/)).toBeInTheDocument();
  });
});

describe("moving the window", () => {
  beforeEach(() => {
    window.innerWidth = COLLAPSED_WIDTH;
    vi.clearAllMocks();
  });

  /*
   * ⌘+arrow used to be handled on a div, which React only reaches by bubbling
   * from whatever has focus. Collapsed there is nothing focusable inside the
   * card, so the keydown went to document.body, never passed the div, and the
   * bar — the thing people actually want to move — could not be moved.
   *
   * These fire at `window` with nothing focused, which is the case that was
   * broken and the case the old handler could never have covered.
   */
  test("an arrow with the meta key moves it, with nothing focused", async () => {
    render(<Pill />);
    await settle();

    fireEvent.keyDown(window, { key: "ArrowLeft", metaKey: true });
    await settle();

    expect(bridge.movePill).toHaveBeenCalledWith(-1, 0);
  });

  test("each arrow sends its own direction", async () => {
    render(<Pill />);
    await settle();

    fireEvent.keyDown(window, { key: "ArrowRight", metaKey: true });
    fireEvent.keyDown(window, { key: "ArrowUp", metaKey: true });
    fireEvent.keyDown(window, { key: "ArrowDown", metaKey: true });
    await settle();

    expect((bridge.movePill as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      [1, 0],
      [0, -1],
      [0, 1],
    ]);
  });

  test("an arrow on its own never moves the window", async () => {
    // Plain arrows walk the list. If these moved it too, every selection
    // change would drag the window across the screen.
    render(<Pill />);
    await settle();

    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "ArrowUp" });
    await settle();

    expect(bridge.movePill).not.toHaveBeenCalled();
  });
});
