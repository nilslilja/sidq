import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import type {
  OnboardingBridge,
  InviteSummary,
  PlanStatus,
  ProfileFact,
  TeamSettings,
} from "@/lib/onboarding/bridge";

/*
 * The window behind the pill, tab by tab.
 *
 * ── Why every tab is opened here ─────────────────────────────────────────────
 * The rule for this screen is that no row in the sidebar leads anywhere dead.
 * That is not something typechecking can tell you: a panel that throws on its
 * first render, or renders an empty fragment because a field it expected is not
 * there, compiles perfectly and is blank on screen. So each one is clicked and
 * asked for something only it can show.
 *
 * ── Why the invite panel gets the most of it ─────────────────────────────────
 * It is the only one with a server behind it, so it is the only one with states
 * that are not about the data: not signed in, offline, a code that does not
 * exist, a code that is your own. Every one of those is a sentence written in
 * `0007_invites.sql` and carried through Rust unchanged, and every one of them
 * has to reach the person who typed the code rather than being flattened into
 * "something went wrong".
 */

const PLAN: PlanStatus = {
  plan: "free",
  handoversUsed: 3,
  handoversCap: 5,
  historyDays: 7,
};

const INVITE: InviteSummary = {
  code: "K4PQ7RM",
  invited: 2,
  bonus: 10,
  redeemed: false,
  problem: "",
  each: 5,
  most: 25,
  thisWeek: 2,
  perWeek: 3,
  expires: new Date(Date.now() + 3 * 86_400_000).toISOString(),
};

let invite: InviteSummary = INVITE;
let redeem: (code: string) => Promise<number> = async () => 15;

/** One work session, for tests that care only about which AI it came from. */
function session(sessionId: string, source: string) {
  return {
    sessionId,
    project: "/Users/x/Sidq",
    projectName: "Sidq",
    title: "Pricing page copy",
    lastPrompt: "carry on",
    branch: "main",
    endedAt: Date.now(),
    turns: 40,
    activeMinutes: 90,
    source,
  };
}

const bridge: Partial<OnboardingBridge> = {
  recentWork: vi.fn(async () => [
    {
      sessionId: "abc",
      project: "/Users/x/Sidq",
      projectName: "Sidq",
      title: "Pricing page copy",
      lastPrompt: "carry on",
      branch: "main",
      endedAt: Date.now(),
      turns: 40,
      activeMinutes: 90,
      source: "claude-code",
    },
  ]),
  indexStats: vi.fn(async () => [16, 5414] as [number, number]),
  planStatus: vi.fn(async () => PLAN),
  recentHandovers: vi.fn(async () => []),
  memoryProfile: vi.fn(async () => [[], ""] as [never[], string]),
  staleSources: vi.fn(async () => []),
  accessibilityGranted: vi.fn(async () => true),
  assistantList: vi.fn(async () => []),
  searchConversations: vi.fn(async () => [[], 0] as [never[], number]),
  openUpgrade: vi.fn(async () => {}),
  openSignIn: vi.fn(async () => {}),
  onSignedIn: vi.fn(async () => () => {}),
  onChanged: vi.fn(async () => () => {}),
  inviteSummary: vi.fn(async () => invite),
  redeemInvite: vi.fn((code: string) => redeem(code)),
};

vi.mock("@/lib/onboarding/bridge", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  desktopBridge: () => bridge,
}));

// Refreshing the Supabase session is the first thing the window does and there
// is no browser here to hold one.
vi.mock("@/lib/supabase", () => ({
  shareSessionWithDesktop: vi.fn(async () => {}),
}));

const { Home } = await import("./Home");

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function open(tab: string) {
  render(<Home />);
  await settle();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: tab }));
  });
  await settle();
}

beforeEach(() => {
  invite = { ...INVITE };
  redeem = async () => 15;
  vi.clearAllMocks();
  /*
   * `clearAllMocks` clears recorded calls. It does not undo an implementation
   * set with `mockResolvedValue`, so a test that swaps the plan for an
   * unlimited one leaves every test after it on an unlimited plan — passing or
   * failing for a reason that is nowhere in the test that failed. Restored
   * explicitly rather than relying on `restoreMocks`, which only rewinds spies.
   */
  (bridge.planStatus as ReturnType<typeof vi.fn>).mockResolvedValue(PLAN);
});

describe("the panel headings", () => {
  /*
   * ── The rule these protect ───────────────────────────────────────────────
   * Overview opens on today's date, and it reads as the app being awake rather
   * than as decoration for exactly one reason: the date is checkable. Somebody
   * can look at it and know they are not being shown a cached yesterday.
   *
   * So an eyebrow on any other panel has to be measured and live too. "YOUR
   * PLAN" above a heading reading "Plan" would be worse than the bare heading
   * it replaced, and it is the obvious thing to add when a screen looks empty.
   * These tests make that a build failure rather than a code review comment.
   */

  test("the plan eyebrow counts down, because that is the number people watch", async () => {
    // Three used against a cap of five. This is the figure that was reported
    // stale — "still said 5 over and over" — so it is stated at the top of the
    // panel that owns it rather than only in a row further down.
    await open("Plan");
    expect(screen.getByText("2 OF 5 LEFT THIS WEEK")).toBeInTheDocument();
  });

  test("an unlimited plan says what was used, since there is nothing to count down from", async () => {
    (bridge.planStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...PLAN,
      plan: "pro",
      handoversCap: null,
    });
    await open("Plan");
    expect(screen.getByText("3 HANDOVERS THIS WEEK")).toBeInTheDocument();
  });

  test("the invite eyebrow states the weekly limit before the code is handed out", async () => {
    /*
     * Three a week, per account, enforced in `0008_invites_expire.sql`. The
     * failure it prevents is somebody sending their code to five friends and
     * finding out about the limit from an error message two of them hit.
     */
    await open("Invite a friend");
    expect(screen.getByText("2 OF 3 USED THIS WEEK")).toBeInTheDocument();
  });

  test("a panel with no number to show has no eyebrow at all", async () => {
    /*
     * The harness returns no profile facts, which is the real state of a new
     * install. The temptation is a label — "FROM YOUR OWN MESSAGES" — and that
     * is the invented eyebrow this rule exists to stop.
     */
    await open("How you work");
    const head = screen.getByRole("heading", { name: "How you work" });
    expect(head.previousElementSibling).toBeNull();
  });

  test("every panel puts its heading in a header landmark", async () => {
    // A bare h1 floating in a fragment is what these panels were. The landmark
    // is what lets the heading, the eyebrow and the lead be treated as one
    // thing by a screen reader instead of three unrelated paragraphs.
    for (const tab of [
      "Search",
      "Sources",
      "How you work",
      "Plan",
      "Invite a friend",
    ]) {
      const { unmount } = render(<Home />);
      await settle();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: tab }));
      });
      await settle();
      expect(document.querySelector("header")).not.toBeNull();
      unmount();
    }
  });
});

describe("the sidebar", () => {
  test("every row it offers leads to a panel that renders", async () => {
    render(<Home />);
    await settle();

    for (const tab of [
      "Overview",
      "Search",
      "Sources",
      "How you work",
      "Plan",
      "Invite a friend",
    ]) {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: tab }));
      });
      await settle();
      // Each panel titles itself. A tab that renders nothing fails here.
      expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
    }
  });

  test("it does not still offer the essay", async () => {
    /*
     * The window used to open on an argument about what assistants hide from
     * you, at the size of a headline. That belongs on the site, in front of
     * somebody deciding whether to install this — not in front of somebody who
     * already did, every time they open their own account screen.
     */
    render(<Home />);
    await settle();

    expect(
      screen.queryByRole("button", { name: /didn.t tell you/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Overview" }),
    ).toBeInTheDocument();
  });
});

describe("staying current", () => {
  test("the allowance follows a handover without reopening the window", async () => {
    /*
     * The reported bug, and the reason it was worth a mechanism rather than a
     * patch: "the handovers didn't change when I used them, still said 5 over
     * and over".
     *
     * Nothing was miscounted. `record_handover` wrote every time. The window
     * asked for the plan on mount and never again, so it printed the number
     * from the moment it opened for as long as it stayed open.
     */
    let handed = 0;
    (bridge.planStatus as ReturnType<typeof vi.fn>).mockImplementation(
      async () => ({
        ...PLAN,
        handoversUsed: handed,
      }),
    );

    let announce = () => {};
    (bridge.onChanged as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: () => void) => {
        announce = cb;
        return () => {};
      },
    );

    await open("Plan");
    expect(screen.getByText("0 of 5 used")).toBeInTheDocument();

    // A handover happens somewhere else entirely — the pill — and Rust says so.
    handed = 1;
    await act(async () => {
      announce();
    });
    await settle();

    expect(screen.getByText("1 of 5 used")).toBeInTheDocument();
  });

  test("and follows it on focus too, whatever the event plumbing did", async () => {
    /*
     * Tauri events in this app have silently failed to arrive twice. Coming
     * back to the window is the one thing a person always does after handing a
     * conversation over, so it is the path that must not depend on plumbing.
     */
    let handed = 0;
    (bridge.planStatus as ReturnType<typeof vi.fn>).mockImplementation(
      async () => ({
        ...PLAN,
        handoversUsed: handed,
      }),
    );
    (bridge.onChanged as ReturnType<typeof vi.fn>).mockImplementation(
      async () => () => {},
    );

    await open("Plan");
    expect(screen.getByText("0 of 5 used")).toBeInTheDocument();

    handed = 3;
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await settle();

    expect(screen.getByText("3 of 5 used")).toBeInTheDocument();
  });
});

describe("what setup asked for", () => {
  /*
   * Setup collected two answers and used neither — both were written to
   * localStorage and read by no code in the app. A question whose answer
   * changes nothing should not be asked, so these pin the uses.
   */
  test("the name is in the greeting", async () => {
    localStorage.setItem("sidq.name", "Nils");
    render(<Home />);
    await settle();

    expect(
      screen.getByRole("heading", {
        name: /Good (morning|afternoon|evening), Nils/,
      }),
    ).toBeInTheDocument();
    localStorage.removeItem("sidq.name");
  });

  test("no name is a greeting, not a dangling comma", async () => {
    localStorage.removeItem("sidq.name");
    render(<Home />);
    await settle();

    expect(
      screen.getByRole("heading", {
        name: /^Good (morning|afternoon|evening)$/,
      }),
    ).toBeInTheDocument();
  });

  /*
   * Setup used to ask "which do you use most?" and order this panel from the
   * answer. It does not ask any more: by the time anybody opens this, Sidq has
   * read the index and knows, and what somebody actually opened beats what they
   * tapped on a setup screen.
   */
  test("the AIs you actually use come first in Sources", async () => {
    const work = bridge.recentWork;
    bridge.recentWork = vi.fn(async () => [
      ...Array.from({ length: 3 }, (_, i) => session(`g${i}`, "gemini")),
      ...Array.from({ length: 2 }, (_, i) => session(`c${i}`, "chatgpt")),
      session("cc", "claude-code"),
    ]) as typeof work;

    await open("Sources");
    const rows = screen
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");

    expect(rows[0]).toMatch(/Gemini/);
    expect(rows[1]).toMatch(/ChatGPT/);
    bridge.recentWork = work;
  });

  test("and the fixed order stands when nothing has been read yet", async () => {
    const work = bridge.recentWork;
    bridge.recentWork = vi.fn(async () => []) as typeof work;

    await open("Sources");
    const rows = screen
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");

    expect(rows[0]).toMatch(/Claude Code/);
    bridge.recentWork = work;
  });
});

describe("how you work", () => {
  /*
   * The panel now claims handovers carry these, and says how many.
   *
   * That number lives in Rust, in PROFILE_IN_HANDOVER, and the sentence lives
   * here. Nothing else connects them, so changing the constant would quietly
   * make the window lie about what the file contains. Read the constant.
   */
  test("the number it promises is the number Rust actually carries", async () => {
    const { readFileSync } = await import("node:fs");
    const rust = readFileSync("src-tauri/src/main.rs", "utf8");
    const carried = Number(
      /const PROFILE_IN_HANDOVER: usize = (\d+);/.exec(rust)?.[1],
    );

    expect(carried).toBeGreaterThan(0);

    const words = [
      "zero",
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "nine",
    ];
    const panel = readFileSync("src/routes/Home.tsx", "utf8");

    expect(panel).toContain(`up to ${words[carried] ?? carried}`);
  });

  test("and it says they ride along rather than needing pasting", async () => {
    const original = bridge.memoryProfile;
    bridge.memoryProfile = vi.fn(
      async () =>
        [
          [{ text: "always show me the diff first", conversations: 4 }],
          "always show me the diff first",
        ] as [ProfileFact[], string],
    );

    await open("How you work");

    expect(
      screen.getByText(/ride along with every\s+handover/),
    ).toBeInTheDocument();
    bridge.memoryProfile = original;
  });
});

describe("your team", () => {
  const NOT_PAYING: TeamSettings = {
    folder: null,
    name: "Nils",
    members: [] as [string, number][],
    sharing: 0,
    file: "nils.sidq-context.md",
    allowed: false,
  };

  function withTeam(next: Partial<TeamSettings>) {
    bridge.teamSettings = vi.fn(async () => ({ ...NOT_PAYING, ...next }));
    bridge.teamFolderOptions = vi.fn(async () => [
      ["iCloud Drive", "/Users/x/iCloud/Sidq Team"] as [string, string],
    ]);
  }

  /*
   * The plan gate is Rust's answer. `team_rules` refuses to publish or read
   * regardless of what this window draws, so the panel renders what it was
   * told rather than deciding for itself.
   */
  test("a plan without Duo is told what Duo would do, not shown the setup", async () => {
    withTeam({ allowed: false });
    await open("Your team");

    expect(screen.getByText(/standing instructions on your/i)).toBeInTheDocument();
    expect(screen.queryByText("iCloud Drive")).not.toBeInTheDocument();
  });

  test("Duo with no folder yet is offered the ones that actually sync", async () => {
    withTeam({ allowed: true });
    await open("Your team");

    expect(screen.getByText("iCloud Drive")).toBeInTheDocument();
  });

  /*
   * Naming the file in the window is the point of using a file at all: what
   * leaves this Mac is one thing, it has a name, and you can go and read it.
   */
  test("it names the one file that leaves the Mac", async () => {
    withTeam({ allowed: true, folder: "/Users/x/iCloud/Sidq Team", sharing: 4 });
    await open("Your team");

    expect(screen.getAllByText("nils.sidq-context.md").length).toBeGreaterThan(0);
  });

  test("an empty folder says what to do, not that something is missing", async () => {
    withTeam({ allowed: true, folder: "/Users/x/iCloud/Sidq Team", sharing: 4 });
    await open("Your team");

    expect(screen.getByText(/point their Sidq at it/i)).toBeInTheDocument();
  });

  test("and teammates are listed with what each of them contributes", async () => {
    withTeam({
      allowed: true,
      folder: "/Users/x/iCloud/Sidq Team",
      sharing: 4,
      members: [["Sam", 3]],
    });
    await open("Your team");

    expect(screen.getByText("Sam")).toBeInTheDocument();
    expect(screen.getByText("3 rules")).toBeInTheDocument();
  });
});

describe("the mark", () => {
  test("is the app icon, not a redrawing of it", async () => {
    /*
     * The sidebar inlines the icon's paths so it can crop to the artwork: the
     * whole 512 square shrunk to 22 points is a smudge, because the drawing
     * lives in a wide, short band across the middle of it.
     *
     * Inlining means two copies, and the failure mode of two copies is that the
     * window quietly stops matching the Dock icon — which nobody spots by
     * looking, because you never see them side by side.
     */
    const { readFileSync } = await import("node:fs");
    const icon = readFileSync("public/icons/icon.svg", "utf8");
    const source = readFileSync("src/routes/Home.tsx", "utf8");

    const strokes = [...icon.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
    expect(strokes).toHaveLength(2);

    for (const d of strokes) {
      expect(source).toContain(d);
    }
  });
});

describe("the plan panel", () => {
  test("states the limits it is actually enforcing", async () => {
    // Both figures come from plan_status, which is Rust reporting the same
    // numbers it applies. Neither is written down anywhere in the frontend.
    await open("Plan");

    expect(screen.getByText("3 of 5 used")).toBeInTheDocument();
    expect(screen.getByText("7 days")).toBeInTheDocument();
  });

  test("a free account is offered the plans, and the invite route to more", async () => {
    await open("Plan");

    fireEvent.click(screen.getByRole("button", { name: /see the plans/i }));
    expect(bridge.openUpgrade).toHaveBeenCalled();
    expect(
      screen.getByText(/every friend who joins with your code/i),
    ).toBeInTheDocument();
  });

  test("a paid account is not shown a button that cannot do anything", async () => {
    /*
     * There is no billing portal behind Sidq. "Manage subscription" would open
     * the pricing page, which cannot cancel anything, so the panel says where
     * the real link is instead.
     */
    (bridge.planStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      plan: "pro",
      handoversUsed: 41,
      handoversCap: null,
      historyDays: null,
    });

    await open("Plan");

    expect(screen.getByText("Unlimited")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /see the plans/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/receipt in your email/i)).toBeInTheDocument();
  });
});

describe("the invite panel", () => {
  test("shows the code and what it has earned", async () => {
    await open("Invite a friend");

    expect(screen.getByText("K4PQ7RM")).toBeInTheDocument();
    /*
     * Asked for by its row rather than by the bare string "2".
     *
     * A free account with three of five handovers used renders "2" in the
     * sidebar plan card as well, so `getByText('2')` matches two elements and
     * fails on ambiguity. It only ever passed because an earlier test left the
     * plan mocked as unlimited and that leaked forward — which is exactly the
     * kind of pass this suite should not be collecting.
     */
    const used = screen.getByText("People who used it").closest("div");
    expect(used?.textContent).toContain("2");
    expect(screen.getByText(/^\+10/)).toBeInTheDocument();
  });

  test("states the offer with the numbers the server sent", async () => {
    /*
     * Not with numbers typed into the component. The database decides what an
     * invite pays out and `entitlement.rs` is what grants it; a promise
     * maintained separately from the payout is a promise that drifts.
     */
    invite = { ...INVITE, each: 7, perWeek: 5 };
    await open("Invite a friend");

    expect(
      screen.getByText(
        /adds 7 handovers a week to your account and 7 to theirs/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/up to 5 friends a week/i)).toBeInTheDocument();
  });

  test("says when the bonus lapses, because it does now", async () => {
    /*
     * It used to say "permanently". An invite is worth five handovers a week
     * for seven days now, so the panel has to say when the number it is
     * showing stops being true — otherwise it drops one morning with no
     * explanation and reads as the product losing track.
     */
    await open("Invite a friend");
    expect(screen.getByText(/\+10, for 3 more days/)).toBeInTheDocument();
  });

  test("a full week says so rather than just showing a number", async () => {
    invite = { ...INVITE, thisWeek: 3, perWeek: 3 };
    await open("Invite a friend");

    expect(
      screen.getByText(/3 of 3 . full until one lapses/),
    ).toBeInTheDocument();
  });

  test("the offer states the weekly limit from the server", async () => {
    invite = { ...INVITE, each: 5, perWeek: 3 };
    await open("Invite a friend");

    expect(screen.getByText(/for the next seven days/i)).toBeInTheDocument();
    expect(screen.getByText(/up to 3 friends a week/i)).toBeInTheDocument();
  });

  test("an account with no invites says so rather than showing zeroes", async () => {
    invite = { ...INVITE, invited: 0, bonus: 0, thisWeek: 0, expires: "" };
    await open("Invite a friend");

    expect(screen.getByText("Nobody yet")).toBeInTheDocument();
    expect(screen.getByText("None right now")).toBeInTheDocument();
  });

  test("not being signed in offers the sign-in, not just a retry", async () => {
    /*
     * This said "Sign in to get your invite code" above a Try again button,
     * which asks the same question and gets the same answer. Sign-in lived
     * entirely in setup, so anyone who skipped it had no way to make an account
     * from inside the app — the panel named the problem and then dead-ended.
     */
    invite = {
      ...INVITE,
      code: "",
      problem: "Sign in to get your invite code.",
    };
    await open("Invite a friend");

    expect(
      screen.getByText("Sign in to get your invite code."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(bridge.openSignIn).toHaveBeenCalled();
  });

  test("a server that is merely down is not treated as a missing account", async () => {
    // Offering "Sign in" to somebody already signed in, whose network dropped,
    // sends them off to fix the wrong thing.
    invite = {
      ...INVITE,
      code: "",
      problem: "Could not reach the server. Try again in a moment.",
    };
    await open("Invite a friend");

    expect(
      screen.queryByRole("button", { name: /^sign in$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });

  test("a refused code shows the database's own sentence", async () => {
    redeem = async () => {
      throw new Error("That is your own code.");
    };
    await open("Invite a friend");

    fireEvent.change(screen.getByPlaceholderText(/their code/i), {
      target: { value: "k4pq7rm" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /use it/i }));
    });
    await settle();

    expect(screen.getByText("That is your own code.")).toBeInTheDocument();
  });

  test("a code is sent up in the case the server stores it", async () => {
    // The column is upper case and the lookup upper-cases too, but typing a
    // code in lower case should not depend on that agreeing forever.
    const seen: string[] = [];
    redeem = async (code) => {
      seen.push(code);
      return 15;
    };
    await open("Invite a friend");

    fireEvent.change(screen.getByPlaceholderText(/their code/i), {
      target: { value: " k4pq7rm " },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /use it/i }));
    });
    await settle();

    expect(seen).toEqual(["K4PQ7RM"]);
  });

  test("an account that already used one is not offered the box again", async () => {
    // It can only happen once: the invitee is the primary key of `referrals`.
    // Offering the field again would be offering an action that always fails.
    invite = { ...INVITE, redeemed: true };
    await open("Invite a friend");

    expect(
      screen.queryByPlaceholderText(/their code/i),
    ).not.toBeInTheDocument();
  });
});
