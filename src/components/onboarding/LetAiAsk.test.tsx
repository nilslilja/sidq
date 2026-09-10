import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { LetAiAsk } from "./LetAiAsk";
import type { OnboardingBridge } from "@/lib/onboarding/bridge";

/*
 * The one path where the assistant fetches on its own. It lived behind a button
 * in a settings panel, which inverted the product: everything else needs a
 * person to move something, and the thing that does not was the hardest to find.
 */

const bridgeWith = (
  clients: [string, string, boolean][],
  connect = vi.fn(async () => "/path/to/config.json" as string | null),
) =>
  ({
    mcpClients: vi.fn(async () => clients),
    connectMcp: connect,
  }) as unknown as OnboardingBridge;

describe("letting an assistant ask Sidq", () => {
  test("renders nothing when no supported client is installed", async () => {
    const { container } = render(<LetAiAsk bridge={bridgeWith([])} />);

    /*
     * Absent, not disabled. Offering to configure software somebody does not
     * have is a button that appears to work and does nothing — and here it
     * would be the first thing they ever watched Sidq fail at.
     */
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  test("offers each installed client by name", async () => {
    render(
      <LetAiAsk
        bridge={bridgeWith([
          ["claude-code", "Claude Code", false],
          ["cursor", "Cursor", false],
        ])}
      />,
    );

    expect(
      await screen.findByRole("button", { name: /connect claude code/i }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /connect cursor/i })).toBeVisible();
  });

  test("says to restart, because a working connection looks like a broken one", async () => {
    /*
     * Every MCP client reads its config once at launch. Without this line a
     * successful connect is indistinguishable from a failed one until the app
     * is restarted, and the person concludes it did not work.
     */
    render(
      <LetAiAsk bridge={bridgeWith([["claude-code", "Claude Code", false]])} />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /connect claude code/i }),
    );

    expect(await screen.findByText(/restart/i)).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /claude code connected/i }),
      ).toBeDisabled(),
    );
  });

  test("a refused connection does not claim success", async () => {
    const refuses = vi.fn(async () => null);
    render(
      <LetAiAsk
        bridge={bridgeWith([["cursor", "Cursor", false]], refuses)}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /connect cursor/i }));

    await waitFor(() => expect(refuses).toHaveBeenCalled());
    expect(screen.queryByText(/restart/i)).toBeNull();
    expect(screen.getByRole("button", { name: /connect cursor/i })).toBeEnabled();
  });
});
