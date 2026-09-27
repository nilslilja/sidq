import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { OnboardingBridge } from "@/lib/onboarding/bridge";

/*
 * Onboarding reads nothing before the screen that asks to read it.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * The count of "conversations already on this Mac" is shown on the `sources`
 * step — "Connect your AIs" — which is the screen where a person agrees to
 * Sidq reading their transcripts at all. The effect that fetched it was keyed
 * on `[bridge]` with no step check, so it ran on mount: the transcripts were
 * read while the sign-in screen was still up, and the number appeared a screen
 * later, behind consent it had already walked past.
 *
 * A user reported exactly that. It survived being reported because nothing
 * pinned it. The equivalent assertion for the pill has existed the whole time
 * in `Pill.test.tsx` ("loads the conversations on opening, not once at
 * startup"), and it is the reason the same mistake was never possible there.
 */

/*
 * Everything the window touches, stubbed.
 *
 * A Proxy rather than a hand-listed object because Onboarding renders four
 * steps' worth of child components and this test is about one call among them.
 * Listing the rest by hand would mean this file breaks every time a step gains
 * a button, which is how a test ends up deleted rather than fixed. The calls
 * that need a real shape are named; everything else answers undefined.
 */
/** The callbacks the window registers, so a test can play Rust's part. */
const heard: { signedIn?: (urls: string[]) => void; grabbed?: (title: string) => void } = {};
let handoverLog: unknown[] = [];

const named: Partial<OnboardingBridge> = {
  recentWork: vi.fn(async () => []),
  recentHandovers: vi.fn(async () => handoverLog as never[]),
  onSignedIn: vi.fn(async (cb: (urls: string[]) => void) => {
    heard.signedIn = cb;
    return () => {};
  }),
  onGrabbed: vi.fn(async (cb: (title: string) => void) => {
    heard.grabbed = cb;
    return () => {};
  }),
  tapKeys: vi.fn(async () => ["right ⌘", "left ⌃"] as [string, string]),
  indexStats: vi.fn(async () => [0, 0] as [number, number]),
  pickerShortcut: vi.fn(async () => "\u2318\u21e7K"),
  accessibilityGranted: vi.fn(async () => true),
  onShortcut: vi.fn(async () => () => {}),
};

const bridge = new Proxy(named, {
  get(target, key: string) {
    if (!(key in target)) {
      (target as Record<string, unknown>)[key] = vi.fn(async () => undefined);
    }
    return (target as Record<string, unknown>)[key];
  },
}) as OnboardingBridge;


vi.mock("@/lib/onboarding/bridge", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  desktopBridge: () => bridge,
}));

vi.mock("@/lib/supabase", () => ({
  shareSessionWithDesktop: vi.fn(async () => {}),
  adoptSession: vi.fn(async () => {}),
  rememberDisplayName: vi.fn(),
}));

const { default: Onboarding } = await import("./Onboarding");

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("onboarding consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("reads no transcripts while the sign-in step is up", async () => {
    render(
      <MemoryRouter>
        <Onboarding />
      </MemoryRouter>,
    );
    await settle();

    expect(bridge.recentWork).not.toHaveBeenCalled();
  });
});

/** Signed in and past the connect screen: standing on "try it". */
async function toTryIt() {
  render(
    <MemoryRouter>
      <Onboarding />
    </MemoryRouter>,
  );
  await settle();
  await act(async () => heard.signedIn?.(["sidq://auth"]));
  await settle();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  });
  await settle();
}

describe("trying it for real", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handoverLog = [];
    heard.grabbed = undefined;
  });

  test("signing in moves on by itself, with nothing to press", async () => {
    render(
      <MemoryRouter>
        <Onboarding />
      </MemoryRouter>,
    );
    await settle();
    await act(async () => heard.signedIn?.(["sidq://auth"]));
    await settle();
    expect(screen.getByRole("heading", { name: /found your AIs|Connect your AIs/ })).toBeInTheDocument();
  });

  test("a double tap is the answer, and the screen says so", async () => {
    await toTryIt();
    expect(screen.getByRole("heading", { name: "Double-tap right ⌘" })).toBeInTheDocument();

    await act(async () => heard.grabbed?.("Stripe webhook retries"));
    await settle();

    expect(screen.getByRole("heading", { name: "That’s it." })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/open a new chat in any AI/);
  });

  /*
   * Somebody reinstalling already has handovers in the log. "One exists" would
   * congratulate them before they had done anything.
   */
  test("handovers made before this screen do not count as the first one", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    handoverLog = [{ sessionId: "old" }];
    await toTryIt();
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    await settle();
    expect(screen.queryByRole("heading", { name: "That’s it." })).not.toBeInTheDocument();

    handoverLog = [{ sessionId: "old" }, { sessionId: "new" }];
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    await settle();
    expect(screen.getByRole("heading", { name: "That’s it." })).toBeInTheDocument();
    vi.useRealTimers();
  });

  test("counting is off unless somebody ticks it, all the way to the end", async () => {
    await toTryIt();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    });
    await settle();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start using Sidq" }));
    });
    await settle();
    expect(bridge.setCounting).toHaveBeenCalledWith(false);
    expect(bridge.finish).toHaveBeenCalled();
  });
});
