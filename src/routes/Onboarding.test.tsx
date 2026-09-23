import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
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
 * A Proxy rather than a hand-listed object because Onboarding renders seven
 * steps' worth of child components and this test is about one call among them.
 * Listing the rest by hand would mean this file breaks every time a step gains
 * a button, which is how a test ends up deleted rather than fixed. The calls
 * that need a real shape are named; everything else answers undefined.
 */
const named: Partial<OnboardingBridge> = {
  recentWork: vi.fn(async () => []),
  recentHandovers: vi.fn(async () => []),
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
