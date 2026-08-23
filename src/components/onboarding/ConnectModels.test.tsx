import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { OnboardingBridge } from '@/lib/onboarding/bridge';

/*
 * The permission step.
 *
 * ── What this is protecting ──────────────────────────────────────────────────
 * Every AI that lives in a browser — ChatGPT, Gemini, Claude.ai, Perplexity,
 * Grok — writes nothing readable to this Mac. One macOS permission is the only
 * thing that makes Sidq read any of them, so it is the difference between the
 * product working across everything somebody uses and working only with their
 * editor.
 *
 * It used to sit under a Continue button that looked exactly like every other
 * Continue button in setup. One unremarkable click and the most-used half of
 * the product was silently off, with nothing on the screen saying so.
 *
 * It is deliberately not blocked. A managed Mac can refuse the permission
 * outright, and stranding somebody on a screen they cannot complete is worse
 * than letting them past informed.
 */

let granted = false;

const bridge: Partial<OnboardingBridge> = {
  accessibilityGranted: vi.fn(async () => granted),
  requestAccessibility: vi.fn(async () => {}),
  openAccessibilitySettings: vi.fn(async () => {}),
};

vi.mock('@/lib/onboarding/bridge', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  desktopBridge: () => bridge,
}));

const { ConnectModels } = await import('./ConnectModels');

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  granted = false;
  vi.clearAllMocks();
});

describe('before the permission is granted', () => {
  test('the ask is the primary action, not Continue', async () => {
    render(<ConnectModels found={12} onContinue={() => {}} />);
    await settle();

    expect(screen.getByRole('button', { name: /turn it on/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Continue/ })).not.toBeInTheDocument();
  });

  test('the way past says what it costs, by name', async () => {
    /*
     * "Skip" on its own is a button somebody presses without reading. Naming
     * the AIs that stop working is the whole point of the sentence.
     */
    render(<ConnectModels found={12} onContinue={() => {}} />);
    await settle();

    const skip = screen.getByRole('button', { name: /skip for now/i });
    expect(skip.textContent).toMatch(/ChatGPT/);
    expect(skip.textContent).toMatch(/will not be read/);
  });

  test('the button asks macOS rather than explaining where the switch is', async () => {
    // The system prompt is the whole reason this is in the app instead of a
    // support page: it is one click from here, in the moment.
    render(<ConnectModels found={12} onContinue={() => {}} />);
    await settle();

    await act(async () => {
      screen.getByRole('button', { name: /turn it on/i }).click();
    });

    expect(bridge.requestAccessibility).toHaveBeenCalled();
  });

  test('it still lets somebody through, because it has to', async () => {
    const onContinue = vi.fn();
    render(<ConnectModels found={12} onContinue={onContinue} />);
    await settle();

    await act(async () => {
      screen.getByRole('button', { name: /skip for now/i }).click();
    });

    expect(onContinue).toHaveBeenCalled();
  });
});

describe('once it is granted', () => {
  test('Continue becomes the primary action and the ask is gone', async () => {
    granted = true;
    render(<ConnectModels found={12} onContinue={() => {}} />);
    await settle();

    expect(screen.getByRole('button', { name: /^Continue/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /turn it on/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /skip for now/i })).not.toBeInTheDocument();
  });

  test('it says what is now being read', async () => {
    granted = true;
    render(<ConnectModels found={12} onContinue={() => {}} />);
    await settle();

    expect(screen.getByText(/Reading your AIs/)).toBeInTheDocument();
  });
});
