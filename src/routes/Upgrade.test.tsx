import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Upgrade } from "./Upgrade";

/*
 * The one page where a dead press costs money.
 *
 * This page told signed-out visitors to sign in, correctly, in a paragraph at
 * the bottom of a 2,763px page — 1,750px below the Subscribe button they had
 * just pressed on a 900px screen. Everything worked and the whole thing read as
 * a broken payment button.
 */

const token = vi.fn<() => Promise<string | undefined>>();
const checkout = vi.fn();

vi.mock("@/lib/supabase", () => ({
  getAccessToken: () => token(),
  getSupabase: () => null,
}));

vi.mock("@/lib/billing", () => ({
  startCheckout: (...args: unknown[]) => checkout(...args),
}));

const show = () =>
  render(
    <MemoryRouter>
      <Upgrade />
    </MemoryRouter>,
  );

beforeEach(() => {
  token.mockReset();
  checkout.mockReset();
});

describe("subscribing while signed out", () => {
  test("the button says what it will do instead of failing when pressed", async () => {
    token.mockResolvedValue(undefined);
    show();

    const buttons = await screen.findAllByRole("button", {
      name: /sign in to subscribe/i,
    });
    expect(buttons.length).toBeGreaterThan(0);

    // And no button still offers to take money it cannot take.
    expect(screen.queryByRole("button", { name: /^Subscribe$/ })).toBeNull();
  });

  test("the reason sits with the button, not at the foot of the page", async () => {
    /*
     * The actual regression. Asserting the sentence exists somewhere is what
     * the old page would have passed: it did exist, two screens further down.
     * What matters is that it is inside the same card as the control.
     */
    token.mockResolvedValue(undefined);
    show();

    const button = (
      await screen.findAllByRole("button", { name: /sign in to subscribe/i })
    )[0];
    const card = button.closest("section");

    expect(card).not.toBeNull();
    expect(card!.textContent).toMatch(/has to land on an account/i);
  });

  test("checkout is never attempted without a session", async () => {
    token.mockResolvedValue(undefined);
    show();

    const button = (
      await screen.findAllByRole("button", { name: /sign in to subscribe/i })
    )[0];
    fireEvent.click(button);

    await waitFor(() => expect(checkout).not.toHaveBeenCalled());
  });
});

describe("subscribing while signed in", () => {
  test("the button offers the plan and starts checkout", async () => {
    token.mockResolvedValue("a-real-token");
    checkout.mockResolvedValue(undefined);
    show();

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /sign in to subscribe/i }),
      ).toBeNull(),
    );

    const button = screen.getAllByRole("button", { name: /subscribe/i })[0];
    expect(button.textContent).not.toMatch(/sign in/i);

    fireEvent.click(button);
    await waitFor(() => expect(checkout).toHaveBeenCalled());
  });

  test("a checkout that fails says so inside the card that was pressed", async () => {
    token.mockResolvedValue("a-real-token");
    checkout.mockRejectedValue(new Error("Could not start checkout (500)."));
    show();

    /*
     * Wait for the session read to land before touching anything. The card
     * re-renders when it does, and a node captured before that is detached by
     * the time it is clicked — which looks exactly like the bug this file is
     * about, from the inside.
     */
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /sign in to subscribe/i }),
      ).toBeNull(),
    );

    const button = screen.getAllByRole("button", { name: /subscribe/i })[0];
    const card = button.closest("section");
    fireEvent.click(button);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/could not start checkout/i);
    expect(alert.closest("section")).toBe(card);
  });
});

describe("the Team tier", () => {
  /*
   * Team has been on the pricing page since before it was implemented, with a
   * mailto: behind it — so the tier most likely to convert is the one that
   * cannot take money. Everything behind it works now; what is missing is a
   * price, and a price is a decision rather than a value with a default.
   *
   * These two tests pin both halves of that so the tier cannot silently become
   * a checkout at a placeholder number, which is the failure that costs real
   * money rather than a sale.
   */
  test("stays a conversation while no price is configured", async () => {
    token.mockResolvedValue("a-real-token");
    const { PLANS } = await import("@/lib/plans");
    const team = PLANS.find((p) => p.id === "team")!;

    // VITE_TEAM_PRICE is unset in the test environment, which is the shipped
    // default. If this flips, somebody can buy at a number nobody chose.
    expect(team.ctaHref).toMatch(/^mailto:/);
    expect(team.price).toBe("Let's talk");
    expect(team.cadence).toBeNull();
  });

  test("its card never offers checkout while it is a conversation", async () => {
    token.mockResolvedValue("a-real-token");
    checkout.mockResolvedValue(undefined);
    show();

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /sign in to subscribe/i }),
      ).toBeNull(),
    );

    // The Team card's control is the mailto, so pressing anything on this page
    // must never start a team checkout.
    for (const button of screen.getAllByRole("button", { name: /subscribe/i })) {
      fireEvent.click(button);
    }
    await waitFor(() => expect(checkout).toHaveBeenCalled());
    for (const call of checkout.mock.calls) {
      expect(call[0]).not.toBe("team");
    }
  });
});
