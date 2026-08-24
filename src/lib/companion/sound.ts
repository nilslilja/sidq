/*
 * The three sounds Sidq makes.
 *
 * Synthesised rather than shipped as files. Three short tones would be perhaps
 * 60kB of audio for a 4.5MB app, they would need decoding before the first one
 * could play, and a sample cannot be tuned once it is committed. Six oscillators
 * of maths cost nothing and start instantly.
 *
 * ── What "premium" means here, concretely ─────────────────────────────────────
 * Quiet, short, and never sharp. The peak gain is 0.06, which is around the
 * level of a keyboard in a quiet room: it should register as texture rather than
 * as a notification. Every tone ramps up over a few milliseconds because an
 * oscillator started at full amplitude produces a click, and a click is the
 * single thing that makes a sound feel cheap. Every tone decays exponentially,
 * because that is how a struck object actually behaves and the ear knows it.
 *
 * The intervals are consonant on purpose. `done` is a perfect fifth, which
 * resolves and reads as finished. `summon` and `dismiss` are one note each,
 * moving up and down respectively, so the pair feels like one gesture and its
 * reverse without anybody being able to say why.
 */

export type Cue = 'summon' | 'dismiss' | 'done' | 'found';

/** Peak gain. Deliberately low: this is meant to be felt, not heard. */
const PEAK = 0.06;

/** Ramp-in. Long enough to kill the click, short enough to stay percussive. */
const ATTACK_SECONDS = 0.008;

interface Partial {
  /** Hertz. */
  freq: number;
  /** Seconds until effectively silent. */
  decay: number;
  /** Fraction of PEAK. Upper partials sit lower or the tone turns shrill. */
  level: number;
  /** Seconds to wait before this partial starts, for a slight roll. */
  delay?: number;
}

/*
 * A5 and E6 for `done`: a perfect fifth, the most consonant interval there is
 * after the octave. The upper note enters 12ms late and half as loud, which is
 * what a real bell does and what stops two simultaneous sines sounding
 * synthetic.
 */
const CUES: Record<Cue, Partial[]> = {
  summon: [{ freq: 587.33, decay: 0.18, level: 0.7 }],
  dismiss: [{ freq: 440.0, decay: 0.14, level: 0.55 }],
  done: [
    { freq: 880.0, decay: 0.45, level: 1 },
    { freq: 1318.51, decay: 0.38, level: 0.5, delay: 0.012 },
  ],
  /*
   * A conversation just arrived in the index.
   *
   * Two notes, rising a perfect fourth, the second clearly after the first
   * rather than alongside it — the interval a doorbell uses, because that is
   * exactly the job: something turned up, come and look when you like.
   *
   * The one cue here nobody asked for. `summon`, `dismiss` and `done` all
   * follow a keypress; this one can land while somebody is mid-sentence in
   * another app. So it sits lower than the rest and decays faster, and the
   * notification beside it is what carries the actual information.
   */
  found: [
    { freq: 659.25, decay: 0.16, level: 0.5 },
    { freq: 880.0, decay: 0.26, level: 0.42, delay: 0.09 },
  ],
};

const STORAGE_KEY = 'sidq.sound';

type ContextFactory = () => AudioContext | null;

function defaultFactory(): AudioContext | null {
  const Ctor =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

/*
 * One context for the process, built on first use.
 *
 * Browsers refuse to start an AudioContext outside a user gesture, and every
 * cue here follows a keypress, so creating it lazily means it is always born
 * into a gesture and never lands in the suspended state.
 */
let context: AudioContext | null = null;
let factory: ContextFactory = defaultFactory;

/** Test seam. Replaces the context factory and drops any context already made. */
export function __setContextFactory(next: ContextFactory): void {
  factory = next;
  context = null;
}

export function isSoundEnabled(): boolean {
  try {
    // Absent means on. Sound is part of how the product feels, so it ships
    // enabled and is something you turn off, not something you discover.
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    /* private mode. The preference is not worth failing anything over. */
  }
}

/**
 * Play a cue.
 *
 * Never throws and never blocks. Audio is a decoration on top of an action that
 * has already happened, so every failure path here is silence rather than an
 * error: no Web Audio, a refused context, a suspended device, all of it just
 * means the person does not hear the tone.
 */
export function playCue(cue: Cue): void {
  if (!isSoundEnabled()) return;

  try {
    context ??= factory();
    if (!context) return;

    /*
     * Nudge it awake before using it.
     *
     * Every cue used to follow a keypress, so the context was always born
     * inside a gesture and never suspended. `found` broke that: a conversation
     * being read is not something the person did, and a context created on that
     * path starts suspended and plays nothing at all.
     *
     * Fire and forget. If the platform refuses without a gesture, the result is
     * the same silence every other failure here produces.
     */
    if (context.state === 'suspended') void context.resume().catch(() => undefined);

    const now = context.currentTime;

    for (const partial of CUES[cue]) {
      const start = now + (partial.delay ?? 0);

      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = partial.freq;

      const gain = context.createGain();
      const peak = PEAK * partial.level;

      /*
       * Ramp up, then decay towards zero exponentially.
       *
       * exponentialRampToValueAtTime cannot reach 0, so the tail lands on a
       * value far below hearing and the node is stopped there. Ramping to a
       * true zero throws, and setting gain directly clicks.
       */
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + ATTACK_SECONDS);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + partial.decay);

      osc.connect(gain).connect(context.destination);
      osc.start(start);
      osc.stop(start + partial.decay + 0.02);
    }
  } catch {
    /* Audio is never load-bearing. Silence is an acceptable outcome. */
  }
}
