import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { OnboardingBridge } from '@/lib/onboarding/bridge';

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
  ]),
  indexStats: vi.fn(async () => [16, 5414] as [number, number]),
  expandPill: vi.fn(async () => {}),
  hidePill: vi.fn(async () => {}),
  openHome: vi.fn(async () => {}),
};

vi.mock('@/lib/onboarding/bridge', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  desktopBridge: () => bridge,
}));

// Nothing under test here makes a sound, and jsdom has no audio.
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
    expect(screen.getByText('16 conversations')).toBeInTheDocument();
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

    expect(screen.getByPlaceholderText(/pick up where you stopped/i)).toBeInTheDocument();
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

    expect(screen.queryByPlaceholderText(/pick up where you stopped/i)).not.toBeInTheDocument();
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
