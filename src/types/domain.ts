export type TaskStatus = 'pending' | 'active' | 'completed' | 'rolled';
export type DayStatus = 'generating' | 'ready' | 'closed';
/**
 * What the database stores.
 *
 * 'paid' is the legacy value every existing subscriber sits on. It is kept
 * rather than renamed, and mapped onto Pro by planFromTier, because a rename
 * here would silently downgrade real customers.
 */
export type PlanTier = 'free' | 'paid' | 'pro' | 'duo';
export type WorkRhythm = 'morning' | 'afternoon' | 'night' | 'chaos';

export const WORK_RHYTHM_LABELS: Record<WorkRhythm, string> = {
  morning: 'Mornings',
  afternoon: 'Afternoons',
  night: 'Late at night',
  chaos: "It's chaos",
};

export interface Task {
  id: string;
  dayId: string;
  title: string;
  why: string;
  priorityRank: number;
  estMinutes: number;
  status: TaskStatus;
  carriedFromDayId: string | null;
  carryCount: number;
  completedAt: string | null;
}

export interface Day {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD in the user's local timezone
  generatedAt: string | null;
  status: DayStatus;
  topPriority: string;
  note: string;
  tasks: Task[];
}

export interface Goal {
  id: string;
  userId: string;
  text: string;
  active: boolean;
}

export interface Reflection {
  id: string;
  dayId: string;
  note: string;
  plannedCount: number;
  completedCount: number;
  createdAt: string;
}

export interface Profile {
  id: string;
  email: string | null;
  workRhythm: WorkRhythm | null;
  derailers: string | null;
  streakCount: number;
  streakLastActive: string | null;
  /** Forgiveness budget. Refills over time; spent instead of breaking a streak. */
  graceRemaining: number;
  planTier: PlanTier;
  ritualHour: number;
  timezone: string;
}

/** What intake collects. Three questions, nothing more. */
export interface IntakeAnswers {
  goals: string;
  workRhythm: WorkRhythm | null;
  derailers: string;
}

export function completedCount(day: Day): number {
  return day.tasks.filter((t) => t.status === 'completed').length;
}

export function plannedCount(day: Day): number {
  return day.tasks.filter((t) => t.status !== 'rolled').length;
}

/** 0..1. Drives the momentum ring. Guards against an empty day dividing by zero. */
export function dayProgress(day: Day): number {
  const planned = plannedCount(day);
  if (planned === 0) return 0;
  return completedCount(day) / planned;
}

export function remainingMinutes(day: Day): number {
  return day.tasks
    .filter((t) => t.status === 'pending' || t.status === 'active')
    .reduce((sum, t) => sum + t.estMinutes, 0);
}
