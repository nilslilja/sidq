import type { Day, Goal, Profile, Reflection } from '@/types/domain';

/**
 * One interface, two implementations. The UI never learns whether it is talking to
 * localStorage or Postgres, which is what makes try-before-signup possible: the
 * anonymous user gets the identical product, and signing up is a data migration
 * rather than a different app.
 */
export interface SidqStore {
  readonly kind: 'local' | 'supabase';

  getProfile(): Promise<Profile | null>;
  saveProfile(profile: Profile): Promise<void>;

  getGoals(): Promise<Goal[]>;
  saveGoals(goals: Goal[]): Promise<void>;

  getDay(date: string): Promise<Day | null>;
  saveDay(day: Day): Promise<void>;
  /** Newest first, for the momentum view and carryover lookback. */
  getRecentDays(limit: number): Promise<Day[]>;

  saveReflection(reflection: Reflection): Promise<void>;
  getReflections(limit: number): Promise<Reflection[]>;

  /** Everything, for migrating an anonymous session into an account. */
  exportAll(): Promise<StoreSnapshot>;
  importAll(snapshot: StoreSnapshot): Promise<void>;
  clear(): Promise<void>;
}

export interface StoreSnapshot {
  profile: Profile | null;
  goals: Goal[];
  days: Day[];
  reflections: Reflection[];
}
