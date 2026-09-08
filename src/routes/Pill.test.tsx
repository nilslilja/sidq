import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { OnboardingBridge, FoundConversation } from '@/lib/onboarding/bridge';

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
    window.dispatchEvent(new Event('resize'));
  });
  await settle();
}

const bridge: Partial<OnboardingBridge> = {
  recentWork: vi.fn(async () => [
    {
      sessionId: 'abc',
      project: '/Users/x/Sidq',
      projectName: 'Sidq',
      title: 'Pricing page copy',
      lastPrompt: 'carry on with the tiers',
      branch: 'main',
      endedAt: Date.now(),
      turns: 40,
      activeMinutes: 90,
      source: 'claude-code',
    },
    {
      sessionId: 'def',
      project: '/Users/x/Sidq',
      projectName: 'Sidq',
      title: 'Notch placement on the pill',
      lastPrompt: 'where does it go on a notched mac',
      branch: 'main',
      endedAt: Date.now() - 3_600_000,
      turns: 22,
      activeMinutes: 40,
      source: 'chatgpt',
    },
  ]),
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

vi.mock('@/lib/onboarding/bridge', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  desktopBridge: () => bridge,
}));

// Nothing under test here makes a sound, and jsdom has no audio.
import { playCue } from '@/lib/companion/sound';
vi.mock('@/lib/companion/sound', () => ({ playCue: vi.fn() }));

const { Pill } = await import('./Pill');

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

describe('the pill, across the two states', () => {
  beforeEach(() => {
    // Every test starts at the collapsed width, the way a launch does.
    window.innerWidth = COLLAPSED_WIDTH;
    vi.clearAllMocks();
  });

  test('starts as the bar, with the real count on it', async () => {
    render(<Pill />);
    await settle();

    expect(screen.getByRole('button', { name: /pick up a conversation/i })).toBeInTheDocument();
    // The count alone. The bar lives inside the menu bar now and "16
    // conversations" does not fit in 152 points without covering something.
    expect(screen.getByText('16')).toBeInTheDocument();
  });

  test('tells Rust which conversation the picker is aimed at, and stops when it shuts', async () => {
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
    expect(bridge.aimAt).toHaveBeenCalledWith('abc');

    await resizeTo(COLLAPSED_WIDTH);
    expect(bridge.aimAt).toHaveBeenLastCalledWith(null);
  });

  test('renders the picker once the window is the picker\'s size', async () => {
    /*
     * The exact failure, now reproducible without the app. Grow the window and
     * the bar must be gone; leave the bar on screen at 560 wide and this is
     * what a person saw for an afternoon.
     */
    render(<Pill />);
    await settle();

    await resizeTo(EXPANDED_WIDTH);

    expect(screen.getByLabelText(/filter conversations/i)).toBeInTheDocument();
    expect(screen.getByText('Pricing page copy')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /pick up a conversation/i }),
    ).not.toBeInTheDocument();
  });

  test('goes back to the bar when it collapses', async () => {
    render(<Pill />);
    await settle();

    await resizeTo(EXPANDED_WIDTH);
    await resizeTo(COLLAPSED_WIDTH);

    expect(screen.queryByLabelText(/filter conversations/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pick up a conversation/i })).toBeInTheDocument();
  });

  test('loads the conversations on opening, not once at startup', async () => {
    // The window outlives every use of it now, so a list fetched at launch
    // would still be yesterday's by the afternoon.
    render(<Pill />);
    await settle();
    expect(bridge.recentWork).not.toHaveBeenCalled();

    await resizeTo(EXPANDED_WIDTH);
    expect(bridge.recentWork).toHaveBeenCalled();
  });

  test('clicking the bar asks Rust to expand it', async () => {
    // The bar cannot resize itself; the window belongs to Rust.
    const { getByRole } = render(<Pill />);
    await settle();

    await act(async () => {
      getByRole('button', { name: /pick up a conversation/i }).click();
    });

    expect(bridge.expandPill).toHaveBeenCalled();
  });
});

describe('the source filter', () => {
  test('offers only the AIs in the list, and narrows to one', async () => {
    /*
     * The picker showed fifty rows from every AI on the machine ordered only by
     * when they ended, so finding this morning's ChatGPT thread meant reading
     * past everything else.
     */
    render(<Pill />);
    await resizeTo(EXPANDED_WIDTH);

    expect(screen.getByText('Pricing page copy')).toBeInTheDocument();
    expect(screen.getByText('Notch placement on the pill')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /all ais/i }));
    });

    // Gemini is supported and unused, so it is not offered.
    expect(screen.queryByRole('button', { name: /gemini/i })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /chatgpt/i }));
    });
    await settle();

    expect(screen.getByText('Notch placement on the pill')).toBeInTheDocument();
    expect(screen.queryByText('Pricing page copy')).not.toBeInTheDocument();
  });

  test('escape closes the menu without closing the picker', async () => {
    /*
     * Backing out of a dropdown must not throw away the query typed to get
     * there. The menu takes Escape first; the second one dismisses.
     */
    render(<Pill />);
    await resizeTo(EXPANDED_WIDTH);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /all ais/i }));
    });
    expect(screen.getByRole('button', { name: /chatgpt/i })).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText(/filter conversations/i), {
        key: 'Escape',
      });
    });

    expect(screen.queryByRole('button', { name: /chatgpt/i })).not.toBeInTheDocument();
    expect(bridge.hidePill).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/filter conversations/i)).toBeInTheDocument();
  });
});

describe('a conversation arriving', () => {
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
  test('rings once, on the window that is always alive', async () => {
    render(<Pill />);
    await settle();

    expect(announceFound).toBeDefined();

    await act(async () => {
      announceFound?.({ source: 'chatgpt', title: 'Raw Milk in Carrefour', firstTime: true });
    });

    expect(playCue).toHaveBeenCalledWith('found');
  });

  test('the bar says which assistant it came from, then goes back to the count', async () => {
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
        announceFound?.({ source: 'chatgpt', title: 'Raw Milk in Carrefour', firstTime: true });
      });
      expect(screen.getByText('Saved · ChatGPT')).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.queryByText('Saved · ChatGPT')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test('an assistant nobody has a name for does not print its slug', async () => {
    render(<Pill />);
    await settle();

    await act(async () => {
      announceFound?.({ source: 'something-new', title: 'A conversation', firstTime: true });
    });

    expect(screen.getByText('Saved · an AI')).toBeInTheDocument();
  });

  test('it subscribes even while the picker is open', async () => {
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
      fireEvent.keyDown(window, { key: 'k', metaKey: true, shiftKey: true });
    });
    await settle();

    expect(announceFound).toBeDefined();
  });
});
