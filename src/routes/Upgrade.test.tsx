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
