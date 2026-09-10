import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import type {
  OnboardingBridge,
  InviteSummary,
  PlanStatus,
  ProfileFact,
  TeamSettings,
} from "@/lib/onboarding/bridge";
import { NO_TEAM } from "@/lib/onboarding/bridge";

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
  /*
   * Counting, which the Overview panel reads on mount.
   *
   * Off, because that is the default and the default is the whole basis of the
   * claim the privacy page makes. A mock that returns true here would let a
   * regression flipping the default sail through every test in this file.
   */
  counting: vi.fn(async () => false),
  setCounting: vi.fn(async () => {}),
  countedEvents: vi.fn(async () => [
    ["opened", "Sidq was opened."],
    ["handed_over", "A conversation was handed over."],
  ] as [string, string][]),
  /*
   * The team code, which the panel reads on mount.
   *
   * `null` by default, because that is a team set up the old way by pointing
   * at a folder — those still work and simply have no code to show. A mock
   * returning a code here would hide the branch most existing teams are in.
   */
  teamCode: vi.fn(async () => null),
  teamSeats: vi.fn(async () => [] as { code: string; taken: boolean }[]),
  redeemTeamSeat: vi.fn(async () => null as string | null),
  startTeam: vi.fn(async () => "k7fm3q"),
  joinTeam: vi.fn(async () => ({ joined: true, understood: true })),
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
  /*
   * No team folder by default, which is every account that has not set one up.
   * The Overview asks too, so this has to exist on the base bridge rather than
   * only inside the team tests.
   */
  teamSettings: vi.fn(async () => NO_TEAM),
  tapKeys: vi.fn(async () => ["right ⌘", "left ⌃"] as [string, string]),
  teamFolderOptions: vi.fn(async () => [] as [string, string][]),
  teamNearby: vi.fn(async () => []),
  revealTeamFolder: vi.fn(async () => true),
  teamHandovers: vi.fn(async () => []),
  readTeamHandover: vi.fn(async () => null),
  shareHandover: vi.fn(async () => false),
  setTeamFolder: vi.fn(async () => true),
  setTeamName: vi.fn(async () => true),
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
  // The team tests swap these out; put the no-folder answers back each time.
  bridge.teamSettings = vi.fn(async () => NO_TEAM);
  bridge.teamHandovers = vi.fn(async () => []);
  bridge.teamFolderOptions = vi.fn(async () => []);
  bridge.teamNearby = vi.fn(async () => []);
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
        name: /^Nils, nothing here has left this Mac\.$/,
      }),
    ).toBeInTheDocument();
    localStorage.removeItem("sidq.name");
  });

  test("no name still reads as a sentence, not a dangling comma", async () => {
    localStorage.removeItem("sidq.name");
    render(<Home />);
    await settle();

    expect(
      screen.getByRole("heading", {
        name: /^Nothing here has left this Mac\.$/,
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

describe("the grab gesture", () => {
  /*
   * It is taught on one screen during setup, which every existing user has
   * already been through — so for all of them the feature does not exist. The
   * tray menu was the only other place it appeared, and nobody opens a tray
   * menu to discover something.
   */
  test("the window says how to grab, for anybody who onboarded before it existed", async () => {
    await open("Overview");

    expect(
      screen.getByText(/grab the conversation you were/i),
    ).toBeInTheDocument();
    expect(screen.getByText("right ⌘")).toBeInTheDocument();
  });

  /*
   * Which modifier does what is a setting. Copy that names one by hand starts
   * teaching the wrong key the moment somebody changes it, and this window and
   * Rust are the two places that would then disagree.
   */
  test("and names whichever keys are actually bound", async () => {
    bridge.tapKeys = vi.fn(async () => ["fn", "right ⌥"] as [string, string]);
    await open("Overview");

    expect(screen.getByText("fn")).toBeInTheDocument();
    expect(screen.getByText("right ⌥")).toBeInTheDocument();
    expect(screen.queryByText("right ⌘")).not.toBeInTheDocument();
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
    bridge.teamNearby = vi.fn(async () => []);
    /*
     * Reset per test, because these are assigned onto one shared bridge object.
     * A code left behind by an earlier test renders a banner in a later one,
     * which is a failure that looks like the feature and is not.
     */
    bridge.teamCode = vi.fn(async () => null);
    bridge.teamSeats = vi.fn(async () => []);
    bridge.redeemTeamSeat = vi.fn(async () => null);
    bridge.joinTeam = vi.fn(async () => ({ joined: true, understood: true }));
  }

  /*
   * The plan gate is Rust's answer. `team_rules` refuses to publish or read
   * regardless of what this window draws, so the panel renders what it was
   * told rather than deciding for itself.
   */
  /*
   * ── Joining by code ─────────────────────────────────────────────────────
   *
   * Discovery only works once somebody else's file has already synced onto
   * this Mac, which leaves the two cases that actually happen first: being the
   * person who starts the team, and being on a drive the other person is not
   * on. Both used to end at "pick a folder and tell them which one".
   */
  test("a code is offered even when nothing is discoverable", async () => {
    withTeam({ allowed: true, folder: null });
    await open("Your team");

    expect(
      await screen.findByRole("textbox", { name: /team code/i }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /^join$/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /start a team/i })).toBeVisible();
  });

  test("a mistyped code and an unsynced drive do not get the same advice", async () => {
    /*
     * The reason join_team answers with `understood` as well as `joined`. One
     * of these is the person's to fix and the other is not, and telling
     * somebody to check a code that is already correct sends them looking in
     * exactly the wrong place.
     */
    withTeam({ allowed: true, folder: null });
    bridge.joinTeam = vi.fn(async () => ({ joined: false, understood: false }));
    await open("Your team");

    const field = await screen.findByRole("textbox", { name: /team code/i });
    fireEvent.change(field, { target: { value: "aeiou1" } });
    fireEvent.click(screen.getByRole("button", { name: /^join$/i }));

    const mistyped = await screen.findByRole("alert");
    expect(mistyped.textContent).toMatch(/check it/i);
    expect(mistyped.textContent).not.toMatch(/drive/i);
  });

  test("a code that is fine but has not synced says so, and does not blame the code", async () => {
    withTeam({ allowed: true, folder: null });
    bridge.joinTeam = vi.fn(async () => ({ joined: false, understood: true }));
    await open("Your team");

    const field = await screen.findByRole("textbox", { name: /team code/i });
    fireEvent.change(field, { target: { value: "k7fm3q" } });
    fireEvent.click(screen.getByRole("button", { name: /^join$/i }));

    const waiting = await screen.findByRole("alert");
    expect(waiting.textContent).toMatch(/has not reached this Mac/i);
    expect(waiting.textContent).toMatch(/that code is fine/i);
  });

  test("a team that already has a code shows it, so it can be passed on", async () => {
    withTeam({ allowed: true, folder: "/Users/x/iCloud/sidq-team-k7fm3q" });
    bridge.teamCode = vi.fn(async () => "k7fm3q");
    await open("Your team");

    expect(await screen.findByText("k7fm3q")).toBeVisible();
  });

  test("an account with no seats is not shown an empty list of them", async () => {
    /*
     * A heading over nothing reads as a broken feature. Not having bought
     * seats is not a failure, so the buyer's half is simply absent and only
     * the half that matters to everybody else stays.
     */
    withTeam({ allowed: true, folder: null });
    await open("Your team");

    expect(await screen.findByText(/given a seat\?/i)).toBeVisible();
    expect(screen.queryByText(/your seats/i)).toBeNull();
  });

  test("a buyer sees each code and which are spoken for", async () => {
    withTeam({ allowed: true, folder: null });
    bridge.teamSeats = vi.fn(async () => [
      { code: "aaa111", taken: false },
      { code: "bbb222", taken: true },
    ]);
    await open("Your team");

    expect(await screen.findByText("aaa111")).toBeVisible();
    expect(screen.getByText("bbb222")).toBeVisible();
    // A code somebody has used cannot be handed to a second person.
    expect(screen.getByText(/taken/i)).toBeVisible();
  });

  test("a refused seat says why, in the words the server used", async () => {
    withTeam({ allowed: true, folder: null });
    bridge.redeemTeamSeat = vi.fn(async () => "Somebody has already used that code.");
    await open("Your team");

    const field = await screen.findByRole("textbox", { name: /seat code/i });
    fireEvent.change(field, { target: { value: "bbb222" } });
    fireEvent.click(screen.getByRole("button", { name: /use it/i }));

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /already used that code/i,
    );
  });

  test("a plan without Duo is told what Duo would do, not shown the setup", async () => {
    withTeam({ allowed: false });
    await open("Your team");

    expect(
      screen.getByText(/standing instructions on your/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("iCloud Drive")).not.toBeInTheDocument();
  });

  /*
   * The filename is built from the name, and Rust's fallback is the same string
   * for everybody. Two co-founders who pointed at one folder without setting a
   * name would both publish `me.sidq-context.md` and overwrite each other — the
   * worst shape of bug here, because the folder still looks like it is working
   * and simply holds one of them.
   */
  test("a folder cannot be chosen before there is a name to publish under", async () => {
    localStorage.removeItem("sidq.name");
    withTeam({ allowed: true, name: "" });
    await open("Your team");

    expect(screen.getByRole("button", { name: "iCloud Drive" })).toBeDisabled();
  });

  test("and the account's name is offered so nobody has to invent one", async () => {
    localStorage.setItem("sidq.name", "Nils");
    withTeam({ allowed: true, name: "" });
    await open("Your team");

    expect(screen.getByRole("button", { name: "iCloud Drive" })).toBeEnabled();
    localStorage.removeItem("sidq.name");
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
    withTeam({
      allowed: true,
      folder: "/Users/x/iCloud/Sidq Team",
      sharing: 4,
    });
    await open("Your team");

    expect(screen.getAllByText("nils.sidq-context.md").length).toBeGreaterThan(
      0,
    );
  });

  /*
   * Sharing a whole conversation is a different size of decision from
   * publishing a rule file, so it only ever happens because somebody pressed
   * this on that conversation. The button is not drawn at all without a folder
   * to share into, so it never advertises a plan on a row about finished work.
   */
  test("no folder means no share button on a handover", async () => {
    await open("Overview");

    expect(
      screen.queryByRole("button", { name: /Share with team/ }),
    ).not.toBeInTheDocument();
  });

  test("a shared conversation can be copied back by whoever needs it", async () => {
    withTeam({
      allowed: true,
      folder: "/Users/x/iCloud/Sidq Team",
      sharing: 4,
      members: [["Sam", 3]],
    });
    bridge.teamHandovers = vi.fn(async () => [
      {
        who: "Sam",
        title: "Refund policy wording",
        when: 1,
        path: "/f/h/sam--x.md",
        mine: false,
      },
    ]);

    await open("Your team");

    expect(screen.getByText("Refund policy wording")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  /*
   * Nobody else yet is the normal first state. What to do next is the only part
   * that is not obvious, and it is one action rather than a briefing now: share
   * the folder, and the other Sidq finds it by itself.
   */
  test("an empty folder gives one action, not instructions", async () => {
    withTeam({
      allowed: true,
      folder: "/Users/x/iCloud/Sidq Team",
      sharing: 4,
    });
    await open("Your team");

    expect(screen.getByText(/finds it on its own/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Show it in Finder/i }),
    ).toBeInTheDocument();
  });

  /*
   * The whole point of the discovery pass. Setting this up used to be
   * symmetrical — both people picking the same folder from a list, having
   * agreed on it somewhere else — with a failure mode that produces no error:
   * point at different folders and it never works while both windows say
   * everything is fine. The second person is not asked anything now.
   */
  test("a team somebody already set up is offered as one button", async () => {
    withTeam({ allowed: true, name: "Nils" });
    bridge.teamNearby = vi.fn(async () => [
      {
        folder: "/Users/x/Dropbox/Sidq Team",
        inside: "Dropbox",
        members: ["Sam"],
      },
    ]);

    await open("Your team");

    expect(screen.getByText("Sam")).toBeInTheDocument();
    expect(screen.getByText("in Dropbox")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sam.*Dropbox.*Join/s }),
    ).toBeEnabled();
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
    // The paths moved to a shared component when the overlay needed them too.
    // Reading Home.tsx here would now pass without checking anything, which is
    // the worst state a guard can be in.
    const source = readFileSync("src/components/SidqMark.tsx", "utf8");

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

describe("dark mode", () => {
  /*
   * The main window only. The pill is a transparent card over other people's
   * applications and has its own treatment; the website is a marketing page
   * with one deliberate look. Scoping the palette to this attribute is what
   * keeps a theme switch out of both.
   */
  test("the theme lives on this window, not the document", async () => {
    await open("Overview");

    expect(document.documentElement).not.toHaveAttribute("data-app-theme");
    expect(document.querySelector("[data-app-theme]")).toBeInTheDocument();
  });

  test("the toggle offers the theme you are not in", async () => {
    localStorage.setItem("sidq.theme", "light");
    await open("Overview");

    expect(
      screen.getByRole("button", { name: "Switch to dark" }),
    ).toBeInTheDocument();
  });

  test("and switching sticks, so sunset does not undo a decision", async () => {
    localStorage.setItem("sidq.theme", "light");
    await open("Overview");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Switch to dark" }));
    });

    expect(document.querySelector("[data-app-theme]")).toHaveAttribute(
      "data-app-theme",
      "dark",
    );
    expect(localStorage.getItem("sidq.theme")).toBe("dark");
    expect(
      screen.getByRole("button", { name: "Switch to light" }),
    ).toBeInTheDocument();
  });

  /*
   * Two dozen hex values were written inline through this file. Any that
   * survive are invisible in one theme or the other, which is the whole failure
   * mode this replaces: white panels on navy, black hairlines on navy, white
   * label on a button that went pale.
   */
  test("no colour in this window is hard-coded any more", async () => {
    const { readFileSync } = await import("node:fs");
    const raw = readFileSync("src/routes/Home.tsx", "utf8");

    /*
     * Comments are stripped first, because this guard is about what the window
     * paints and a comment paints nothing.
     *
     * The distinction started mattering when the contrast work needed to record
     * what it had measured — "#aeb7ce on #f1eff7 is 1.76:1" is exactly the kind
     * of thing that must survive in the file, and a guard that forbids writing
     * a colour down cannot be satisfied without deleting the evidence for why
     * the code is the way it is.
     *
     * Every other assertion below runs against the stripped source too, so a
     * real `bg-white` in the markup still fails.
     */
    const source = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    expect(source).not.toMatch(/#[0-9A-Fa-f]{6}/);
    expect(source).not.toMatch(/\b(bg|text|border)-(white|black)\b/);

    /*
     * Gradient stops and rings, which the first sweep missed because none of
     * them is spelled `bg-white`. They are how the main card ended up fading
     * from navy to paper, the plan card ended up a bright block with light text
     * on it, and a full-strength white hairline ended up across the top of the
     * window sitting over the greeting.
     */
    expect(source).not.toMatch(/\b(from|via|to)-(white|black)\b/);
    expect(source).not.toMatch(/ring-black|ring-white/);
    expect(source).not.toMatch(/rgba\(255, ?255, ?255/);
  });
});
