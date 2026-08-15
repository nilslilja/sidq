import { describe, test, expect } from 'vitest';
import { carriedFrom, closeDay, toggleTask, startFocus, carriedIndex } from './carryover';
import type { Day, Task, TaskStatus } from '@/types/domain';

function task(id: string, status: TaskStatus, carryCount = 0): Task {
  return {
    id,
    dayId: 'day-1',
    title: `Task ${id}`,
    why: 'because',
    priorityRank: 0,
    estMinutes: 25,
    status,
    carriedFromDayId: null,
    carryCount,
    completedAt: null,
  };
}

const day = (tasks: Task[]): Day => ({
  id: 'day-1',
  userId: 'u1',
  date: '2026-08-12',
  generatedAt: '2026-08-12T07:00:00Z',
  status: 'ready',
  topPriority: 'Task a',
  note: '',
  tasks,
});

describe('carriedFrom', () => {
  test('carries pending and active work, leaves completed behind', () => {
    const d = day([task('a', 'completed'), task('b', 'pending'), task('c', 'active')]);

    const carried = carriedFrom(d);

    expect(carried.map((c) => c.title)).toEqual(['Task b', 'Task c']);
  });

  test('increments carry count so a dodged task is visibly dodged', () => {
    const d = day([task('a', 'pending', 2)]);

    expect(carriedFrom(d)[0].carryCount).toBe(3);
  });

  test('records which day it came from', () => {
    const d = day([task('a', 'pending')]);

    expect(carriedFrom(d)[0].fromDayId).toBe('day-1');
  });

  test('carries nothing from a fully finished day', () => {
    const d = day([task('a', 'completed'), task('b', 'completed')]);

    expect(carriedFrom(d)).toEqual([]);
  });

  test('does not re-carry work already rolled', () => {
    const d = day([task('a', 'rolled'), task('b', 'pending')]);

    expect(carriedFrom(d)).toHaveLength(1);
  });
});

describe('closeDay', () => {
  test('rolls unfinished work and closes the day', () => {
    const d = day([task('a', 'completed'), task('b', 'pending'), task('c', 'active')]);

    const closed = closeDay(d);

    expect(closed.status).toBe('closed');
    expect(closed.tasks.map((t) => t.status)).toEqual(['completed', 'rolled', 'rolled']);
  });

  test('does not mutate the day it was given', () => {
    const d = day([task('a', 'pending')]);

    closeDay(d);

    expect(d.status).toBe('ready');
    expect(d.tasks[0].status).toBe('pending');
  });
});

describe('toggleTask', () => {
  test('completes a pending task and stamps the time', () => {
    const d = day([task('a', 'pending')]);

    const next = toggleTask(d, 'a');

    expect(next.tasks[0].status).toBe('completed');
    expect(next.tasks[0].completedAt).not.toBeNull();
  });

  test('un-completing clears the timestamp so stats stay honest', () => {
    const d = day([{ ...task('a', 'completed'), completedAt: '2026-08-12T09:00:00Z' }]);

    const next = toggleTask(d, 'a');

    expect(next.tasks[0].status).toBe('pending');
    expect(next.tasks[0].completedAt).toBeNull();
  });

  test('leaves other tasks untouched', () => {
    const d = day([task('a', 'pending'), task('b', 'pending')]);

    const next = toggleTask(d, 'a');

    expect(next.tasks[1].status).toBe('pending');
  });

  test('is a no-op for an unknown id', () => {
    const d = day([task('a', 'pending')]);

    expect(toggleTask(d, 'nope').tasks).toEqual(d.tasks);
  });

  test('does not mutate the original day', () => {
    const d = day([task('a', 'pending')]);

    toggleTask(d, 'a');

    expect(d.tasks[0].status).toBe('pending');
  });
});

describe('startFocus', () => {
  test('makes exactly one task active', () => {
    const d = day([task('a', 'active'), task('b', 'pending')]);

    const next = startFocus(d, 'b');

    expect(next.tasks.filter((t) => t.status === 'active')).toHaveLength(1);
    expect(next.tasks[1].status).toBe('active');
    expect(next.tasks[0].status).toBe('pending');
  });

  test('does not disturb completed work', () => {
    const d = day([task('a', 'completed'), task('b', 'pending')]);

    const next = startFocus(d, 'b');

    expect(next.tasks[0].status).toBe('completed');
  });
});

describe('carriedIndex', () => {
  test('matches a generated title back to its lineage regardless of case', () => {
    const index = carriedIndex(carriedFrom(day([task('a', 'pending', 1)])));

    expect(index.get('task a')).toEqual({ fromDayId: 'day-1', carryCount: 2 });
  });
});
