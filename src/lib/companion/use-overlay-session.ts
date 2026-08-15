import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActivitySample } from '@/lib/focus-engine';
import { localDateKey } from '@/lib/date';
import { loadOverlayData, EMPTY_OVERLAY_DATA, type OverlayData } from './overlay-data';
import { summariseDay, type DayReplay } from './session-replay';
import { rescueDay, type RescuePlan } from './day-rescue';
import { deriveAttention, EMPTY_ATTENTION, type AttentionProfile } from './attention';
import { loadSamples, createSampleWriter } from './sample-store';

/*
 * Everything the card knows about the day, in one place.
 *
 * Kept out of Overlay.tsx so that file stays a view. This owns the sample log,
 * the plan, and the one piece of genuine judgement here: when it is worth
 * interrupting to offer a rebuild.
 */

/** Rescue is a mid-afternoon idea. Before this it is just nagging. */
const RESCUE_FROM_HOUR = 14;
/** A day is worth summarising once there is roughly ten minutes of it. */
const MIN_REPLAY_SAMPLES = 120;
/*
 * Bounded so a machine left running cannot grow the array forever.
 *
 * Must not be lower than the store's own cap, or recording stops partway through
 * the retention window and persisting a week becomes pointless. At one sample
 * per five seconds this is roughly two and a half days of continuous use, and
 * the store prunes by age on top.
 */
const MAX_SAMPLES = 40_000;
const REFRESH_MS = 5 * 60_000;

export interface OverlaySession {
  data: OverlayData;
  record: (sample: ActivitySample) => void;
  /** Null until there is enough of a day to describe. */
  replay: DayReplay | null;
  /** What Sidq has measured about how this person's attention actually behaves. */
  attention: AttentionProfile;
  /** Null when the plan still fits the time left, or once dismissed today. */
  rescue: RescuePlan | null;
  dismissRescue: () => void;
  refresh: () => void;
}

export function useOverlaySession(pollSeconds: number): OverlaySession {
  const [data, setData] = useState<OverlayData>(EMPTY_OVERLAY_DATA);
  /*
   * Seeded from disk, so the attention numbers survive a restart.
   *
   * Previously this started empty on every launch, which meant quitting for
   * lunch reset the switch-cost measurement. A number that resets is a novelty,
   * not an instrument, and novelty is the exact retention curve this product
   * exists to avoid.
   */
  const [samples, setSamples] = useState<ActivitySample[]>(() => loadSamples());
  const [rescueDismissed, setRescueDismissed] = useState(false);
  const dayKey = useRef(localDateKey());
  const writer = useRef(createSampleWriter());
  // Read by the unload handler, which must not be re-bound on every sample.
  const samplesRef = useRef<ActivitySample[]>([]);

  samplesRef.current = samples;

  const refresh = useCallback(() => {
    void loadOverlayData().then(setData);
  }, []);

  useEffect(() => {
    refresh();
    // The plan is edited in the web app, which this window cannot observe, so it
    // is re-read on a slow beat. Cheap, and it keeps the card from showing a task
    // that was ticked off ten minutes ago in the other window.
    const id = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const record = useCallback((sample: ActivitySample) => {
    // Midnight rollover only resets what is scoped to a day. The sample log
    // itself keeps running: a week of history is the point of it.
    const today = localDateKey();
    if (today !== dayKey.current) {
      dayKey.current = today;
      setRescueDismissed(false);
    }

    setSamples((prev) => {
      const next = prev.length >= MAX_SAMPLES ? prev : [...prev, sample];
      // Throttled to once a minute inside the writer, so a five-second poll does
      // not become a five-second serialise of forty thousand rows.
      writer.current.maybeWrite(next);
      return next;
    });
  }, []);

  // Write the tail of the session on the way out, so the last minute before a
  // quit is not lost every single time.
  useEffect(() => {
    const flush = () => writer.current.flush(samplesRef.current);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, []);

  /*
   * Today's samples only, for the replay.
   *
   * The log now spans a week, and "where the day went" that silently included
   * Tuesday would be worse than no summary at all.
   */
  const todaySamples = useMemo(
    () => samples.filter((s) => localDateKey(new Date(s.at)) === dayKey.current),
    [samples],
  );

  const replay = useMemo(
    () => (todaySamples.length >= MIN_REPLAY_SAMPLES ? summariseDay(todaySamples, pollSeconds) : null),
    [todaySamples, pollSeconds],
  );

  /*
   * The attention profile, across the whole retained window.
   *
   * This is the reason the log is persisted at all. Switch cost needs several
   * interruptions to be a median rather than an anecdote, and start latency
   * needs several mornings; neither exists inside one session.
   */
  const attention = useMemo(
    () => (samples.length > 0 ? deriveAttention(samples, pollSeconds) : EMPTY_ATTENTION),
    [samples, pollSeconds],
  );

  /*
   * Offer a rebuild only when the plan genuinely no longer fits.
   *
   * `drop.length > 0` is the whole test, and it is deliberately strict: if
   * everything still fits in the hours left there is nothing to rescue, and
   * appearing anyway would turn the one honest intervention in the product into
   * another notification to dismiss.
   */
  const rescue = useMemo(() => {
    if (rescueDismissed || !data.today) return null;
    if (new Date().getHours() < RESCUE_FROM_HOUR) return null;

    const plan = rescueDay({ day: data.today, calibration: data.calibration });
    if (!plan.worthRescuing || plan.drop.length === 0) return null;
    return plan;
  }, [data, rescueDismissed]);

  return {
    data,
    record,
    replay,
    attention,
    rescue,
    dismissRescue: () => setRescueDismissed(true),
    refresh,
  };
}
