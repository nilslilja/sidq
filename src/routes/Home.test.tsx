import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { OnboardingBridge, InviteSummary, PlanStatus } from '@/lib/onboarding/bridge';

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
  plan: 'free',
  handoversUsed: 3,
  handoversCap: 5,
  historyDays: 7,
};

const INVITE: InviteSummary = {
  code: 'K4PQ7RM',
  invited: 2,
  bonus: 10,
  redeemed: false,
  problem: '',
  each: 5,
  most: 25,
  thisWeek: 2,
  perWeek: 3,
  expires: new Date(Date.now() + 3 * 86_400_000).toISOString(),
};

let invite: InviteSummary = INVITE;
let redeem: (code: string) => Promise<number> = async () => 15;

const bridge: Partial<OnboardingBridge> = {
  recentWork: vi.fn(async () => [
    {
      sessionId: 'abc',
      project: '/Users/x/Sidq',
      projectName: 'Sidq',
      title: 'Pricing page copy',
      lastPrompt: 'carry on',
      branch: 'main',
      endedAt: Date.now(),
      turns: 40,
      activeMinutes: 90,
      source: 'claude-code',
    },
  ]),
  indexStats: vi.fn(async () => [16, 5414] as [number, number]),
  planStatus: vi.fn(async () => PLAN),
  recentHandovers: vi.fn(async () => []),
  memoryProfile: vi.fn(async () => [[], ''] as [never[], string]),
  staleSources: vi.fn(async () => []),
  accessibilityGranted: vi.fn(async () => true),
  assistantList: vi.fn(async () => []),
  searchConversations: vi.fn(async () => [[], 0] as [never[], number]),
  openUpgrade: vi.fn(async () => {}),
  openSignIn: vi.fn(async () => {}),
  onSignedIn: vi.fn(async () => () => {}),
  onChanged: vi.fn(async () => () => {}),
  inviteSummary: vi.fn(async () => invite),
  redeemInvite: vi.fn((code: string) => redeem(code)),
};

vi.mock('@/lib/onboarding/bridge', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  desktopBridge: () => bridge,
}));

// Refreshing the Supabase session is the first thing the window does and there
// is no browser here to hold one.
vi.mock('@/lib/supabase', () => ({ shareSessionWithDesktop: vi.fn(async () => {}) }));

const { Home } = await import('./Home');

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
    fireEvent.click(screen.getByRole('button', { name: tab }));
  });
  await settle();
}

beforeEach(() => {
  invite = { ...INVITE };
  redeem = async () => 15;
  vi.clearAllMocks();
});

describe('the sidebar', () => {
  test('every row it offers leads to a panel that renders', async () => {
    render(<Home />);
    await settle();

    for (const tab of ['Overview', 'Search', 'Sources', 'How you work', 'Plan', 'Invite a friend']) {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: tab }));
      });
      await settle();
      // Each panel titles itself. A tab that renders nothing fails here.
      expect(screen.getAllByRole('heading').length).toBeGreaterThan(0);
    }
  });

  test('it does not still offer the essay', async () => {
    /*
     * The window used to open on an argument about what assistants hide from
     * you, at the size of a headline. That belongs on the site, in front of
     * somebody deciding whether to install this — not in front of somebody who
     * already did, every time they open their own account screen.
     */
    render(<Home />);
    await settle();

    expect(screen.queryByRole('button', { name: /didn.t tell you/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument();
  });
});

describe('staying current', () => {
  test('the allowance follows a handover without reopening the window', async () => {
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
    (bridge.planStatus as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      ...PLAN,
      handoversUsed: handed,
    }));

    let announce = () => {};
    (bridge.onChanged as ReturnType<typeof vi.fn>).mockImplementation(async (cb: () => void) => {
      announce = cb;
      return () => {};
    });

    await open('Plan');
    expect(screen.getByText('0 of 5 used')).toBeInTheDocument();

    // A handover happens somewhere else entirely — the pill — and Rust says so.
    handed = 1;
    await act(async () => {
      announce();
    });
    await settle();

    expect(screen.getByText('1 of 5 used')).toBeInTheDocument();
  });

  test('and follows it on focus too, whatever the event plumbing did', async () => {
    /*
     * Tauri events in this app have silently failed to arrive twice. Coming
     * back to the window is the one thing a person always does after handing a
     * conversation over, so it is the path that must not depend on plumbing.
     */
    let handed = 0;
    (bridge.planStatus as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      ...PLAN,
      handoversUsed: handed,
    }));
    (bridge.onChanged as ReturnType<typeof vi.fn>).mockImplementation(async () => () => {});

    await open('Plan');
    expect(screen.getByText('0 of 5 used')).toBeInTheDocument();

    handed = 3;
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await settle();

    expect(screen.getByText('3 of 5 used')).toBeInTheDocument();
  });
});

describe('what setup asked for', () => {
  /*
   * Setup collected two answers and used neither — both were written to
   * localStorage and read by no code in the app. A question whose answer
   * changes nothing should not be asked, so these pin the uses.
   */
  test('the name is in the greeting', async () => {
    localStorage.setItem('sidq.name', 'Nils');
    render(<Home />);
    await settle();

    expect(screen.getByRole('heading', { name: /Good (morning|afternoon|evening), Nils/ }))
      .toBeInTheDocument();
    localStorage.removeItem('sidq.name');
  });

  test('no name is a greeting, not a dangling comma', async () => {
    localStorage.removeItem('sidq.name');
    render(<Home />);
    await settle();

    expect(screen.getByRole('heading', { name: /^Good (morning|afternoon|evening)$/ }))
      .toBeInTheDocument();
  });

  test('the AIs you said you use come first in Sources', async () => {
    localStorage.setItem('sidq.intents', JSON.stringify(['gemini', 'chatgpt']));
    await open('Sources');

    const rows = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(rows[0]).toMatch(/ChatGPT|Gemini/);
    expect(rows[1]).toMatch(/ChatGPT|Gemini/);
    localStorage.removeItem('sidq.intents');
  });

  test('and the fixed order stands when nothing was picked', async () => {
    localStorage.removeItem('sidq.intents');
    await open('Sources');

    const rows = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(rows[0]).toMatch(/Claude Code/);
  });
});

describe('the mark', () => {
  test('is the app icon, not a redrawing of it', async () => {
    /*
     * The sidebar inlines the icon's paths so it can crop to the artwork: the
     * whole 512 square shrunk to 22 points is a smudge, because the drawing
     * lives in a wide, short band across the middle of it.
     *
     * Inlining means two copies, and the failure mode of two copies is that the
     * window quietly stops matching the Dock icon — which nobody spots by
     * looking, because you never see them side by side.
     */
    const { readFileSync } = await import('node:fs');
    const icon = readFileSync('public/icons/icon.svg', 'utf8');
    const source = readFileSync('src/routes/Home.tsx', 'utf8');

    const strokes = [...icon.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
    expect(strokes).toHaveLength(2);

    for (const d of strokes) {
      expect(source).toContain(d);
    }
  });
});

describe('the plan panel', () => {
  test('states the limits it is actually enforcing', async () => {
    // Both figures come from plan_status, which is Rust reporting the same
    // numbers it applies. Neither is written down anywhere in the frontend.
    await open('Plan');

    expect(screen.getByText('3 of 5 used')).toBeInTheDocument();
    expect(screen.getByText('7 days')).toBeInTheDocument();
  });

  test('a free account is offered the plans, and the invite route to more', async () => {
    await open('Plan');

    fireEvent.click(screen.getByRole('button', { name: /see the plans/i }));
    expect(bridge.openUpgrade).toHaveBeenCalled();
    expect(screen.getByText(/every friend who joins with your code/i)).toBeInTheDocument();
  });

  test('a paid account is not shown a button that cannot do anything', async () => {
    /*
     * There is no billing portal behind Sidq. "Manage subscription" would open
     * the pricing page, which cannot cancel anything, so the panel says where
     * the real link is instead.
     */
    (bridge.planStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      plan: 'pro',
      handoversUsed: 41,
      handoversCap: null,
      historyDays: null,
    });

    await open('Plan');

    expect(screen.getByText('Unlimited')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /see the plans/i })).not.toBeInTheDocument();
    expect(screen.getByText(/receipt in your email/i)).toBeInTheDocument();
  });
});

describe('the invite panel', () => {
  test('shows the code and what it has earned', async () => {
    await open('Invite a friend');

    expect(screen.getByText('K4PQ7RM')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/^\+10/)).toBeInTheDocument();
  });

  test('states the offer with the numbers the server sent', async () => {
    /*
     * Not with numbers typed into the component. The database decides what an
     * invite pays out and `entitlement.rs` is what grants it; a promise
     * maintained separately from the payout is a promise that drifts.
     */
    invite = { ...INVITE, each: 7, perWeek: 5 };
    await open('Invite a friend');

    expect(
      screen.getByText(/adds 7 handovers a week to your account and 7 to theirs/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/up to 5 friends a week/i)).toBeInTheDocument();
  });

  test('says when the bonus lapses, because it does now', async () => {
    /*
     * It used to say "permanently". An invite is worth five handovers a week
     * for seven days now, so the panel has to say when the number it is
     * showing stops being true — otherwise it drops one morning with no
     * explanation and reads as the product losing track.
     */
    await open('Invite a friend');
    expect(screen.getByText(/\+10, for 3 more days/)).toBeInTheDocument();
  });

  test('a full week says so rather than just showing a number', async () => {
    invite = { ...INVITE, thisWeek: 3, perWeek: 3 };
    await open('Invite a friend');

    expect(screen.getByText(/3 of 3 . full until one lapses/)).toBeInTheDocument();
  });

  test('the offer states the weekly limit from the server', async () => {
    invite = { ...INVITE, each: 5, perWeek: 3 };
    await open('Invite a friend');

    expect(screen.getByText(/for the next seven days/i)).toBeInTheDocument();
    expect(screen.getByText(/up to 3 friends a week/i)).toBeInTheDocument();
  });

  test('an account with no invites says so rather than showing zeroes', async () => {
    invite = { ...INVITE, invited: 0, bonus: 0, thisWeek: 0, expires: '' };
    await open('Invite a friend');

    expect(screen.getByText('Nobody yet')).toBeInTheDocument();
    expect(screen.getByText('None right now')).toBeInTheDocument();
  });

  test('not being signed in offers the sign-in, not just a retry', async () => {
    /*
     * This said "Sign in to get your invite code" above a Try again button,
     * which asks the same question and gets the same answer. Sign-in lived
     * entirely in setup, so anyone who skipped it had no way to make an account
     * from inside the app — the panel named the problem and then dead-ended.
     */
    invite = { ...INVITE, code: '', problem: 'Sign in to get your invite code.' };
    await open('Invite a friend');

    expect(screen.getByText('Sign in to get your invite code.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(bridge.openSignIn).toHaveBeenCalled();
  });

  test('a server that is merely down is not treated as a missing account', async () => {
    // Offering "Sign in" to somebody already signed in, whose network dropped,
    // sends them off to fix the wrong thing.
    invite = { ...INVITE, code: '', problem: 'Could not reach the server. Try again in a moment.' };
    await open('Invite a friend');

    expect(screen.queryByRole('button', { name: /^sign in$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  test("a refused code shows the database's own sentence", async () => {
    redeem = async () => {
      throw new Error('That is your own code.');
    };
    await open('Invite a friend');

    fireEvent.change(screen.getByPlaceholderText(/their code/i), {
      target: { value: 'k4pq7rm' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /use it/i }));
    });
    await settle();

    expect(screen.getByText('That is your own code.')).toBeInTheDocument();
  });

  test('a code is sent up in the case the server stores it', async () => {
    // The column is upper case and the lookup upper-cases too, but typing a
    // code in lower case should not depend on that agreeing forever.
    const seen: string[] = [];
    redeem = async (code) => {
      seen.push(code);
      return 15;
    };
    await open('Invite a friend');

    fireEvent.change(screen.getByPlaceholderText(/their code/i), {
      target: { value: ' k4pq7rm ' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /use it/i }));
    });
    await settle();

    expect(seen).toEqual(['K4PQ7RM']);
  });

  test('an account that already used one is not offered the box again', async () => {
    // It can only happen once: the invitee is the primary key of `referrals`.
    // Offering the field again would be offering an action that always fails.
    invite = { ...INVITE, redeemed: true };
    await open('Invite a friend');

    expect(screen.queryByPlaceholderText(/their code/i)).not.toBeInTheDocument();
  });
});
