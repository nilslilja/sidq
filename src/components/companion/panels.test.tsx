import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RescueDay } from './RescueDay';
import { DayReplay } from './DayReplay';
import { BodyDouble } from './BodyDouble';
import type { RescuePlan } from '@/lib/companion/day-rescue';
import type { DayReplay as Replay } from '@/lib/companion/session-replay';
import type { BodyDouble as BodyDoubleState } from '@/lib/companion/use-body-double';
import type { Task } from '@/types/domain';

/*
 * These panels only ever appear on a bad afternoon or at the end of a long day,
 * which is exactly when a crash is least likely to be noticed in development and
 * most likely to lose the user. Rendering each one is the point.
 */

const task = (id: string, title: string, estMinutes: number): Task => ({
  id,
  dayId: 'd',
  title,
  why: '',
  priorityRank: 1,
  estMinutes,
  status: 'pending',
  carriedFromDayId: null,
  carryCount: 0,
  completedAt: null,
});

describe('RescueDay', () => {
  const plan: RescuePlan = {
    keep: [task('a', 'Send the invoice', 15)],
    drop: [task('b', 'Rewrite the onboarding', 90)],
    minutesLeft: 72,
    message: 'Rebuilt around the 1h 12m you actually have.',
    worthRescuing: true,
  };

  test('shows what is left, what moved, and how long each takes', () => {
    render(<RescueDay plan={plan} onAccept={() => {}} onDismiss={() => {}} />);

    expect(screen.getByText('Send the invoice')).toBeInTheDocument();
    expect(screen.getByText('15m')).toBeInTheDocument();
    expect(screen.getByText(/Rewrite the onboarding/)).toBeInTheDocument();
  });

  test('offers a way out that is not starting the work', async () => {
    const onDismiss = vi.fn();
    render(<RescueDay plan={plan} onAccept={() => {}} onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole('button', { name: /not now/i }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  test('hides the start button when there is nothing worth starting', () => {
    render(
      <RescueDay
        plan={{ ...plan, keep: [], worthRescuing: false, message: 'Moves to tomorrow.' }}
        onAccept={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: /start the first one/i })).toBeNull();
  });
});

describe('DayReplay', () => {
  const replay: Replay = {
    totalSeconds: 9000,
    apps: [
      { app: 'Code', seconds: 7200, share: 0.8 },
      { app: 'Slack', seconds: 1800, share: 0.2 },
    ],
    switches: 12,
    longestStretchSeconds: 3600,
    longestStretchApp: 'Code',
    headline: '1h unbroken in Code.',
  };

  test('reports hours without scoring them', () => {
    render(<DayReplay replay={replay} onClose={() => {}} />);

    expect(screen.getByText('Code')).toBeInTheDocument();
    expect(screen.getByText('2h')).toBeInTheDocument();
    expect(screen.getByText('1h unbroken in Code.')).toBeInTheDocument();
  });

  test('states plainly that nothing left the machine', () => {
    render(<DayReplay replay={replay} onClose={() => {}} />);

    expect(screen.getByText(/Nothing left it/)).toBeInTheDocument();
  });

  test('survives a day with a single app, where the top bar is the only bar', () => {
    render(
      <DayReplay
        replay={{ ...replay, apps: [replay.apps[0]] }}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('Code')).toBeInTheDocument();
  });
});

describe('BodyDouble', () => {
  const base: BodyDoubleState = {
    available: true,
    code: null,
    name: '',
    setName: () => {},
    room: { peers: [], overflow: 0, working: 0, headline: '', alive: false },
    error: null,
    join: () => true,
    create: () => 'BC23FG',
    leave: () => {},
  };

  test('says the feature is unavailable rather than showing an empty room', () => {
    render(<BodyDouble state={{ ...base, available: false }} onClose={() => {}} />);

    expect(screen.getByText(/needs an account/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/room code/i)).toBeNull();
  });

  test('rejects a malformed code without joining', async () => {
    const join = vi.fn(() => false);
    render(<BodyDouble state={{ ...base, join }} onClose={() => {}} />);

    await userEvent.type(screen.getByPlaceholderText(/room code/i), 'nope');
    await userEvent.click(screen.getByRole('button', { name: /^join$/i }));

    expect(join).toHaveBeenCalledWith('nope');
  });

  test('shows peers with their running clocks, and nothing else about them', () => {
    render(
      <BodyDouble
        state={{
          ...base,
          code: 'BC23FG',
          name: 'Nils',
          room: {
            peers: [{ id: 'p1', name: 'Sara', state: 'working', minutes: 40, task: null }],
            overflow: 0,
            working: 1,
            headline: 'Sara is 40 min in.',
            alive: true,
          },
        }}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('Sara')).toBeInTheDocument();
    expect(screen.getByText('40m')).toBeInTheDocument();
  });

  test('asks for a name only until one is set', () => {
    const { rerender } = render(
      <BodyDouble state={{ ...base, code: 'BC23FG' }} onClose={() => {}} />,
    );
    expect(screen.getByPlaceholderText(/your first name/i)).toBeInTheDocument();

    rerender(<BodyDouble state={{ ...base, code: 'BC23FG', name: 'Nils' }} onClose={() => {}} />);
    expect(screen.queryByPlaceholderText(/your first name/i)).toBeNull();
  });
});
