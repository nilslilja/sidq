import { LocalStore } from '@/lib/store/local';
import { SupabaseStore } from '@/lib/store/supabase';
import { getSupabase } from '@/lib/supabase';
import { localDateKey } from '@/lib/date';
import { deriveCalibration, EMPTY_CALIBRATION, type Calibration } from '@/lib/calibration';
import type { Day } from '@/types/domain';

/*
 * The overlay's read path.
 *
 * The card renders outside SidqProvider on purpose: it is a separate window
 * loading the same bundle, and pulling in the whole app shell to draw a 60px
 * rectangle would be absurd. But it still needs today's plan, so this is the
 * smallest possible reader, using the same store selection the provider uses.
 *
 * Mostly read. The one write is ticking a task off or changing which one is
 * being tracked, which the card now has to support: an overlay that cannot
 * answer "what is my plan" without opening the web app is a status light.
 *
 * That write is last-wins across the two windows. Acceptable here and only here,
 * because it is one person on one machine toggling a status field, and the loss
 * case is a tick that has to be repeated rather than data that disappears.
 * Anything richer than a status change belongs in the web app.
 */

export interface OverlayData {
  today: Day | null;
  recentDays: Day[];
  calibration: Calibration;
}

export const EMPTY_OVERLAY_DATA: OverlayData = {
  today: null,
  recentDays: [],
  calibration: EMPTY_CALIBRATION,
};

export async function loadOverlayData(): Promise<OverlayData> {
  const store = await pickStore();

  try {
    const [today, recentDays] = await Promise.all([
      store.getDay(localDateKey()),
      store.getRecentDays(30),
    ]);

    return {
      today,
      recentDays,
      calibration: recentDays.length > 0 ? deriveCalibration(recentDays) : EMPTY_CALIBRATION,
    };
  } catch {
    // The card must never fail to render because a fetch failed. It degrades to
    // a timer, which is still the thing it is mostly there to be.
    return EMPTY_OVERLAY_DATA;
  }
}

/**
 * Persist a change made from the card.
 *
 * Takes the whole day rather than a patch, so the caller cannot construct a
 * partial write that drops fields it did not know about.
 */
export async function saveOverlayDay(day: Day): Promise<void> {
  const store = await pickStore();
  await store.saveDay(day);
}

async function pickStore() {
  const supabase = getSupabase();
  if (!supabase) return new LocalStore();

  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  return userId ? new SupabaseStore(supabase, userId) : new LocalStore();
}
