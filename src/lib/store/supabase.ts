import type { SupabaseClient } from '@supabase/supabase-js';
import type { Day, Goal, Profile, Reflection, Task, WorkRhythm } from '@/types/domain';
import type { SidqStore, StoreSnapshot } from './types';

/*
 * Postgres-backed store. Reads and writes are scoped by RLS rather than by any
 * filter written here, a missing `.eq('user_id', ...)` cannot leak another user's
 * rows, because the policy is the boundary.
 */

interface DayRow {
  id: string;
  user_id: string;
  date: string;
  generated_at: string | null;
  status: Day['status'];
  top_priority: string;
  note: string;
  tasks?: TaskRow[];
}

interface TaskRow {
  id: string;
  day_id: string;
  title: string;
  why: string;
  priority_rank: number;
  est_minutes: number;
  status: Task['status'];
  carried_from_day_id: string | null;
  carry_count: number;
  completed_at: string | null;
}

const toTask = (r: TaskRow): Task => ({
  id: r.id,
  dayId: r.day_id,
  title: r.title,
  why: r.why ?? '',
  priorityRank: r.priority_rank,
  estMinutes: r.est_minutes,
  status: r.status,
  carriedFromDayId: r.carried_from_day_id,
  carryCount: r.carry_count ?? 0,
  completedAt: r.completed_at,
});

const toDay = (r: DayRow): Day => ({
  id: r.id,
  userId: r.user_id,
  date: r.date,
  generatedAt: r.generated_at,
  status: r.status,
  topPriority: r.top_priority ?? '',
  note: r.note ?? '',
  tasks: (r.tasks ?? []).map(toTask).sort((a, b) => a.priorityRank - b.priorityRank),
});

export class SupabaseStore implements SidqStore {
  readonly kind = 'supabase' as const;

  constructor(
    private readonly db: SupabaseClient,
    private readonly userId: string,
  ) {}

  async getProfile(): Promise<Profile | null> {
    const { data, error } = await this.db.from('profiles').select('*').eq('id', this.userId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      email: data.email,
      workRhythm: data.work_rhythm as WorkRhythm | null,
      derailers: data.derailers,
      streakCount: data.streak_count,
      streakLastActive: data.streak_last_active,
      graceRemaining: data.grace_remaining,
      planTier: data.plan_tier,
      ritualHour: data.ritual_hour,
      timezone: data.timezone,
    };
  }

  async saveProfile(profile: Profile): Promise<void> {
    // plan_tier is intentionally not sent. A database trigger rejects any client
    // attempt to change it; billing owns that column.
    const { error } = await this.db.from('profiles').update({
      work_rhythm: profile.workRhythm,
      derailers: profile.derailers,
      streak_count: profile.streakCount,
      streak_last_active: profile.streakLastActive,
      grace_remaining: profile.graceRemaining,
      ritual_hour: profile.ritualHour,
      timezone: profile.timezone,
      updated_at: new Date().toISOString(),
    }).eq('id', this.userId);
    if (error) throw error;
  }

  async getGoals(): Promise<Goal[]> {
    const { data, error } = await this.db
      .from('goals')
      .select('*')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((g) => ({ id: g.id, userId: g.user_id, text: g.text, active: g.active }));
  }

  async saveGoals(goals: Goal[]): Promise<void> {
    const { error: delError } = await this.db.from('goals').delete().eq('user_id', this.userId);
    if (delError) throw delError;
    if (goals.length === 0) return;
    const { error } = await this.db
      .from('goals')
      .insert(goals.map((g) => ({ user_id: this.userId, text: g.text, active: g.active })));
    if (error) throw error;
  }

  async getDay(date: string): Promise<Day | null> {
    const { data, error } = await this.db
      .from('days')
      .select('*, tasks(*)')
      .eq('user_id', this.userId)
      .eq('date', date)
      .maybeSingle();
    if (error) throw error;
    return data ? toDay(data as DayRow) : null;
  }

  async saveDay(day: Day): Promise<void> {
    const { data, error } = await this.db
      .from('days')
      .upsert(
        {
          user_id: this.userId,
          date: day.date,
          generated_at: day.generatedAt,
          status: day.status,
          top_priority: day.topPriority,
          note: day.note,
        },
        { onConflict: 'user_id,date' },
      )
      .select('id')
      .single();
    if (error) throw error;

    const dayId = data.id as string;

    // Tasks are replaced wholesale. A day holds at most six rows, so the simple
    // path is also the fast one, and it keeps ordering authoritative.
    const { error: delError } = await this.db.from('tasks').delete().eq('day_id', dayId);
    if (delError) throw delError;

    if (day.tasks.length === 0) return;
    const { error: insError } = await this.db.from('tasks').insert(
      day.tasks.map((t) => ({
        day_id: dayId,
        title: t.title,
        why: t.why,
        priority_rank: t.priorityRank,
        est_minutes: t.estMinutes,
        status: t.status,
        carried_from_day_id: t.carriedFromDayId,
        carry_count: t.carryCount,
        completed_at: t.completedAt,
      })),
    );
    if (insError) throw insError;
  }

  async getRecentDays(limit: number): Promise<Day[]> {
    const { data, error } = await this.db
      .from('days')
      .select('*, tasks(*)')
      .eq('user_id', this.userId)
      .order('date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((d) => toDay(d as DayRow));
  }

  async saveReflection(reflection: Reflection): Promise<void> {
    const { error } = await this.db.from('reflections').upsert(
      {
        day_id: reflection.dayId,
        note: reflection.note,
        planned_count: reflection.plannedCount,
        completed_count: reflection.completedCount,
      },
      { onConflict: 'day_id' },
    );
    if (error) throw error;
  }

  async getReflections(limit: number): Promise<Reflection[]> {
    const { data, error } = await this.db
      .from('reflections')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      dayId: r.day_id,
      note: r.note,
      plannedCount: r.planned_count,
      completedCount: r.completed_count,
      createdAt: r.created_at,
    }));
  }

  async exportAll(): Promise<StoreSnapshot> {
    const [profile, goals, days, reflections] = await Promise.all([
      this.getProfile(),
      this.getGoals(),
      this.getRecentDays(365),
      this.getReflections(365),
    ]);
    return { profile, goals, days, reflections };
  }

  /** Used once, when an anonymous session is claimed by a new account. */
  async importAll(snapshot: StoreSnapshot): Promise<void> {
    if (snapshot.profile) {
      await this.saveProfile({ ...snapshot.profile, id: this.userId });
    }
    if (snapshot.goals.length > 0) {
      await this.saveGoals(snapshot.goals);
    }
    for (const day of snapshot.days) {
      await this.saveDay({ ...day, userId: this.userId });
    }
  }

  async clear(): Promise<void> {
    // Deleting days cascades to tasks and reflections.
    await this.db.from('days').delete().eq('user_id', this.userId);
    await this.db.from('goals').delete().eq('user_id', this.userId);
  }
}
