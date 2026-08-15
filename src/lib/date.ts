/*
 * A "day" in Sidq is the user's local day, not a UTC day.
 *
 * `new Date().toISOString().slice(0, 10)` is the obvious version and it is wrong:
 * for anyone west of UTC it rolls the day over during their evening, which is
 * exactly when the shutdown ritual runs. Everything here goes through the local
 * calendar fields instead.
 */

export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, delta: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + delta);
  return localDateKey(d);
}

/** Whole calendar days between two keys. Immune to DST because it rebuilds at noon. */
export function daysBetween(from: string, to: string): number {
  const a = parseDateKey(from);
  const b = parseDateKey(to);
  a.setHours(12, 0, 0, 0);
  b.setHours(12, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function weekdayName(key: string): string {
  return parseDateKey(key).toLocaleDateString(undefined, { weekday: 'long' });
}

export function shortDate(key: string): string {
  return parseDateKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function initial(key: string): string {
  return parseDateKey(key).toLocaleDateString(undefined, { weekday: 'narrow' });
}

export function timezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "Good morning" / "Good afternoon" / "Good evening" against the local clock. */
export function greeting(d: Date = new Date()): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
