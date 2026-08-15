import type { ActivitySample } from '@/lib/focus-engine';

/*
 * The attention log, kept across restarts.
 *
 * Without this the switch-cost number was a demo: it was computed from whatever
 * samples happened to be in memory since the app last launched, so quitting for
 * lunch reset the most valuable thing the product knows. A number that resets is
 * not a measurement, it is a novelty, and novelty is exactly the retention curve
 * this product is supposed to avoid.
 *
 * ── Why localStorage and not a database ───────────────────────────────────────
 * The samples never leave the machine, they are worthless to anyone else, and
 * they are append-only within a day. A table in Postgres would mean uploading a
 * continuous record of which applications someone had open, which is precisely
 * the thing the landing page promises never happens.
 *
 * ── What is stored ────────────────────────────────────────────────────────────
 * App name, window title, timestamp. Window titles can contain document names,
 * so the log is capped at a week and pruned on every write: a rolling window is
 * enough for every number derived from it, and keeping more would be collecting
 * for its own sake.
 */

const KEY = 'sidq.attention.samples';

/** A week is plenty. Switch cost stabilises within about three working days. */
const MAX_AGE_DAYS = 7;
/**
 * Hard ceiling regardless of age.
 *
 * At one sample per five seconds a machine left running continuously produces
 * ~17k a day. This bounds a pathological case rather than normal use.
 */
const MAX_SAMPLES = 40_000;

/** Written at most this often, so a five-second poll is not a five-second write. */
const WRITE_INTERVAL_MS = 60_000;

interface StoredSample {
  a: string;
  t: string;
  at: number;
}

export function loadSamples(now: number = Date.now()): ActivitySample[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as StoredSample[];
    if (!Array.isArray(parsed)) return [];

    const cutoff = now - MAX_AGE_DAYS * 86_400_000;
    return parsed
      .filter((s) => s && typeof s.at === 'number' && s.at >= cutoff)
      .map((s) => ({ app: String(s.a ?? ''), windowTitle: String(s.t ?? ''), at: s.at }));
  } catch {
    // Corrupt or unreadable. An empty history is recoverable; a crash on startup
    // over a cache of window titles is not.
    return [];
  }
}

/**
 * Persist, pruned.
 *
 * Short keys because this is the largest thing the app stores and `windowTitle`
 * repeated forty thousand times is most of the file.
 */
export function saveSamples(samples: ActivitySample[], now: number = Date.now()): void {
  try {
    const cutoff = now - MAX_AGE_DAYS * 86_400_000;
    const kept = samples.filter((s) => s.at >= cutoff).slice(-MAX_SAMPLES);

    const stored: StoredSample[] = kept.map((s) => ({
      a: s.app,
      t: s.windowTitle,
      at: s.at,
    }));

    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    /*
     * Quota exceeded, or private mode. Dropping the write is correct: the
     * in-memory log still works for today, and a failed save must never take
     * down the card that is showing someone their plan.
     */
  }
}

export function clearSamples(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do, and nothing worth reporting */
  }
}

/**
 * A throttled writer.
 *
 * Returns a function safe to call on every single sample; it writes at most once
 * a minute and once more on demand, which is what `flush` is for at shutdown.
 */
export function createSampleWriter(intervalMs: number = WRITE_INTERVAL_MS) {
  let lastWrite = 0;

  return {
    maybeWrite(samples: ActivitySample[], now: number = Date.now()) {
      if (now - lastWrite < intervalMs) return false;
      lastWrite = now;
      saveSamples(samples, now);
      return true;
    },
    flush(samples: ActivitySample[], now: number = Date.now()) {
      lastWrite = now;
      saveSamples(samples, now);
    },
  };
}
