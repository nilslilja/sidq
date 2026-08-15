import type { Day, Task } from '@/types/domain';

/*
 * Carryover, the "out of sight, out of mind" fix.
 *
 * An unfinished task that stays on yesterday's board has effectively been deleted
 * for this user. Every unfinished task becomes a real row on tomorrow, carrying its
 * lineage so the planner can see how long it has been dodged.
 */

export interface CarriedTask {
  title: string;
  why: string;
  estMinutes: number;
  fromDayId: string;
  carryCount: number;
}

export function carriedFrom(day: Day): CarriedTask[] {
  return day.tasks
    .filter((t) => t.status === 'pending' || t.status === 'active')
    .map((t) => ({
      title: t.title,
      why: t.why,
      estMinutes: t.estMinutes,
      fromDayId: day.id,
      carryCount: t.carryCount + 1,
    }));
}

/** Immutable: returns a new day with unfinished work marked rolled. */
export function closeDay(day: Day): Day {
  return {
    ...day,
    status: 'closed',
    tasks: day.tasks.map((t) =>
      t.status === 'pending' || t.status === 'active' ? { ...t, status: 'rolled' as const } : t,
    ),
  };
}

/** Lets the planner match a generated title back to the task it descended from. */
export function carriedIndex(carried: CarriedTask[]): Map<string, { fromDayId: string; carryCount: number }> {
  return new Map(carried.map((c) => [c.title.toLowerCase(), { fromDayId: c.fromDayId, carryCount: c.carryCount }]));
}

export function toggleTask(day: Day, taskId: string): Day {
  return {
    ...day,
    tasks: day.tasks.map((t) => {
      if (t.id !== taskId) return t;
      const done = t.status === 'completed';
      return {
        ...t,
        status: done ? ('pending' as const) : ('completed' as const),
        completedAt: done ? null : new Date().toISOString(),
      };
    }),
  };
}

export function setTaskStatus(day: Day, taskId: string, status: Task['status']): Day {
  return {
    ...day,
    tasks: day.tasks.map((t) =>
      t.id === taskId
        ? { ...t, status, completedAt: status === 'completed' ? new Date().toISOString() : t.completedAt }
        : t,
    ),
  };
}

/** Only one task is ever active, so starting focus clears any previous one. */
export function startFocus(day: Day, taskId: string): Day {
  return {
    ...day,
    tasks: day.tasks.map((t) => {
      if (t.id === taskId) return { ...t, status: 'active' as const };
      if (t.status === 'active') return { ...t, status: 'pending' as const };
      return t;
    }),
  };
}
