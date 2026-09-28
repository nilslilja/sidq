import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/*
 * What the intro promises, from the request rather than the code: it plays on
 * its own, is over within six seconds, and any key, click or the Skip button
 * ends it at once. Ending it is the one call that opens setup, so it must
 * happen exactly once whichever way it ends.
 */

const bridge = {
  startIntro: vi.fn(async () => {}),
  finishIntro: vi.fn(async (_skipped: boolean) => {}),
};

vi.mock("@/lib/onboarding/bridge", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  desktopBridge: () => bridge,
}));

const { Intro } = await import("./Intro");

describe("the first-launch intro", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    bridge.startIntro.mockClear();
    bridge.finishIntro.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("starts its sound as soon as it is on screen", () => {
    render(<Intro />);
    expect(bridge.startIntro).toHaveBeenCalledTimes(1);
  });

  test("says what Sidq does", () => {
    render(<Intro />);
    expect(screen.getByText("One memory for every AI you use.")).toBeTruthy();
  });

  test("ends on its own within six seconds, without cutting the music", () => {
    render(<Intro />);
    act(() => {
      vi.advanceTimersByTime(5_999);
    });
    expect(bridge.finishIntro).toHaveBeenCalledTimes(1);
    expect(bridge.finishIntro).toHaveBeenCalledWith(false);
  });

  test("Esc skips it at once", () => {
    render(<Intro />);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    fireEvent.keyDown(window, { key: "Escape" });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(bridge.finishIntro).toHaveBeenCalledWith(true);
  });

  test("the Skip button skips it", () => {
    render(<Intro />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Skip" }));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(bridge.finishIntro).toHaveBeenCalledWith(true);
  });

  test("a click anywhere skips it", () => {
    render(<Intro />);
    fireEvent.pointerDown(screen.getByRole("dialog"));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(bridge.finishIntro).toHaveBeenCalledWith(true);
  });

  test("setup is opened once, however many ways it is ended", () => {
    render(<Intro />);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerDown(screen.getByRole("dialog"));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(bridge.finishIntro).toHaveBeenCalledTimes(1);
  });
});
