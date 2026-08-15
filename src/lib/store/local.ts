import type { Day, Goal, Profile, Reflection } from '@/types/domain';
import type { SidqStore, StoreSnapshot } from './types';

/*
 * localStorage-backed store. This is what an anonymous visitor uses, and it is a
 * complete product rather than a teaser, the full loop works before they ever see
 * a signup form.
 */

const KEY = 'sidq.v1';

interface Shape {
  profile: Profile | null;
  goals: Goal[];
  days: Record<string, Day>;
  reflections: Reflection[];
}

const EMPTY: Shape = { profile: null, goals: [], days: {}, reflections: [] };

function read(): Shape {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<Shape>;
    return {
      profile: parsed.profile ?? null,
      goals: parsed.goals ?? [],
      days: parsed.days ?? {},
      reflections: parsed.reflections ?? [],
    };
  } catch {
    // Corrupt or unavailable storage must not brick the app. Start clean.
    return { ...EMPTY };
  }
}

function write(shape: Shape): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(shape));
  } catch {
    // Private browsing and quota errors are survivable. State stays in memory for
    // this session. Silently losing the write is better than losing the session.
  }
}

export class LocalStore implements SidqStore {
  readonly kind = 'local' as const;

  async getProfile() {
    return read().profile;
  }

  async saveProfile(profile: Profile) {
    write({ ...read(), profile });
  }

  async getGoals() {
    return read().goals;
  }

  async saveGoals(goals: Goal[]) {
    write({ ...read(), goals });
  }

  async getDay(date: string) {
    return read().days[date] ?? null;
  }

  async saveDay(day: Day) {
    const shape = read();
    write({ ...shape, days: { ...shape.days, [day.date]: day } });
  }

  async getRecentDays(limit: number) {
    return Object.values(read().days)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
  }

  async saveReflection(reflection: Reflection) {
    const shape = read();
    const others = shape.reflections.filter((r) => r.dayId !== reflection.dayId);
    write({ ...shape, reflections: [reflection, ...others] });
  }

  async getReflections(limit: number) {
    return read()
      .reflections.slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async exportAll(): Promise<StoreSnapshot> {
    const shape = read();
    return {
      profile: shape.profile,
      goals: shape.goals,
      days: Object.values(shape.days),
      reflections: shape.reflections,
    };
  }

  async importAll(snapshot: StoreSnapshot) {
    write({
      profile: snapshot.profile,
      goals: snapshot.goals,
      days: Object.fromEntries(snapshot.days.map((d) => [d.date, d])),
      reflections: snapshot.reflections,
    });
  }

  async clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing to do */
    }
  }
}
