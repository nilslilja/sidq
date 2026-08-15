import { describe, test, expect, beforeEach, vi } from 'vitest';
import { playCue, isSoundEnabled, setSoundEnabled, __setContextFactory } from './sound';

/*
 * A recording stand-in for Web Audio.
 *
 * Tests here are about behaviour that can actually break silently: that a muted
 * app makes no nodes at all, that a missing or hostile audio implementation
 * cannot take an action down with it, and that no gain is ever ramped to a true
 * zero, which throws in real browsers but not in a naive fake.
 */
function fakeContext() {
  const oscillators: { freq: number; started: number; stopped: number }[] = [];
  const ramps: { value: number; at: number }[] = [];

  const ctx = {
    currentTime: 10,
    destination: { name: 'destination' },
    createOscillator() {
      const osc = {
        type: '',
        frequency: { value: 0 },
        start(t: number) {
          entry.started = t;
        },
        stop(t: number) {
          entry.stopped = t;
        },
        connect: (next: unknown) => next,
      };
      const entry = { freq: 0, started: -1, stopped: -1 };
      oscillators.push(entry);
      Object.defineProperty(osc.frequency, 'value', {
        get: () => entry.freq,
        set: (v: number) => {
          entry.freq = v;
        },
      });
      return osc;
    },
    createGain() {
      return {
        gain: {
          setValueAtTime: (v: number, at: number) => ramps.push({ value: v, at }),
          exponentialRampToValueAtTime: (v: number, at: number) => ramps.push({ value: v, at }),
        },
        connect: (next: unknown) => next,
      };
    },
  };

  return { ctx, oscillators, ramps };
}

beforeEach(() => {
  localStorage.clear();
});

describe('sound', () => {
  test('is on by default, because it is part of how the product feels', () => {
    expect(isSoundEnabled()).toBe(true);
  });

  test('stays off once turned off, across reads', () => {
    setSoundEnabled(false);
    expect(isSoundEnabled()).toBe(false);

    setSoundEnabled(true);
    expect(isSoundEnabled()).toBe(true);
  });

  test('creates no audio nodes at all when muted', () => {
    const { ctx, oscillators } = fakeContext();
    __setContextFactory(() => ctx as unknown as AudioContext);
    setSoundEnabled(false);

    playCue('done');

    expect(oscillators).toHaveLength(0);
  });

  test('plays the done cue as a two-note chord', () => {
    const { ctx, oscillators } = fakeContext();
    __setContextFactory(() => ctx as unknown as AudioContext);

    playCue('done');

    expect(oscillators).toHaveLength(2);
    // A5 and E6. A perfect fifth is what makes it read as resolved.
    expect(Math.round(oscillators[0].freq)).toBe(880);
    expect(Math.round(oscillators[1].freq)).toBe(1319);
  });

  test('summon and dismiss are single notes moving in opposite directions', () => {
    const { ctx, oscillators } = fakeContext();
    __setContextFactory(() => ctx as unknown as AudioContext);

    playCue('summon');
    playCue('dismiss');

    expect(oscillators).toHaveLength(2);
    expect(oscillators[0].freq).toBeGreaterThan(oscillators[1].freq);
  });

  test('never ramps gain to zero, which throws in a real browser', () => {
    const { ctx, ramps } = fakeContext();
    __setContextFactory(() => ctx as unknown as AudioContext);

    playCue('done');

    expect(ramps.length).toBeGreaterThan(0);
    expect(ramps.every((r) => r.value > 0)).toBe(true);
  });

  test('ramps up before it decays, so there is no click', () => {
    const { ctx, ramps } = fakeContext();
    __setContextFactory(() => ctx as unknown as AudioContext);

    playCue('summon');

    const [initial, peak, tail] = ramps;
    expect(peak.value).toBeGreaterThan(initial.value);
    expect(tail.value).toBeLessThan(peak.value);
    expect(peak.at).toBeGreaterThan(initial.at);
  });

  test('stops every oscillator it starts', () => {
    const { ctx, oscillators } = fakeContext();
    __setContextFactory(() => ctx as unknown as AudioContext);

    playCue('done');

    expect(oscillators.every((o) => o.stopped > o.started)).toBe(true);
  });

  test('is silent rather than fatal when Web Audio is unavailable', () => {
    __setContextFactory(() => null);

    expect(() => playCue('done')).not.toThrow();
  });

  test('is silent rather than fatal when the audio engine throws', () => {
    __setContextFactory(() => {
      throw new Error('audio device is on fire');
    });

    // A cue always follows an action that already succeeded, so a broken audio
    // stack must never surface as a failure of that action.
    expect(() => playCue('summon')).not.toThrow();
  });

  test('keeps quiet at a level meant to be felt rather than heard', () => {
    const { ctx, ramps } = fakeContext();
    __setContextFactory(() => ctx as unknown as AudioContext);

    playCue('done');

    // Above this it stops being texture and becomes a notification.
    expect(Math.max(...ramps.map((r) => r.value))).toBeLessThanOrEqual(0.06);
  });

  test('survives a storage that refuses to be read', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode');
    });

    expect(isSoundEnabled()).toBe(true);
    expect(() => setSoundEnabled(false)).not.toThrow();

    spy.mockRestore();
  });
});
