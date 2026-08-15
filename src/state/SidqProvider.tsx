import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Day, Goal, IntakeAnswers, Profile, Reflection } from '@/types/domain';
import { completedCount, plannedCount } from '@/types/domain';
import { LocalStore } from '@/lib/store/local';
import { SupabaseStore } from '@/lib/store/supabase';
import type { SidqStore } from '@/lib/store/types';
import { getSupabase, getAccessToken } from '@/lib/supabase';
import { isBackendConfigured } from '@/lib/env';
import { buildPlanInput, generatePlan, planToTasks, PlanLimitReachedError } from '@/lib/generate';
import { carriedFrom, carriedIndex, closeDay, startFocus, toggleTask } from '@/lib/carryover';
import { localDateKey, addDays, timezone } from '@/lib/date';
import { deriveCalibration, calibrationBrief, EMPTY_CALIBRATION, type Calibration } from '@/lib/calibration';
import { entitlementsFor, planFromTier, isUnlimited } from '@/lib/entitlements';
import {
  initialStreak,
  recordActiveDay,
  dayCountsAsActive,
  streakMessage,
  type StreakState,
} from '@/lib/streak';

type Phase = 'loading' | 'needs-intake' | 'generating' | 'ready' | 'error';

interface SidqContextValue {
  phase: Phase;
  session: Session | null;
  /** True once the user may reach intake: signed in, or explicitly browsing without an account. */
  canEnter: boolean;
  continueWithoutAccount: () => void;
  profile: Profile | null;
  goals: Goal[];
  today: Day | null;
  recentDays: Day[];
  isDemo: boolean;
  /** True only for the day just generated, so the reveal stagger fires once. */
  justRevealed: boolean;
  error: string | null;
  limitReached: boolean;
  streak: StreakState;
  lastStreakMessage: string | null;
  /** What Sidq has measured about how this person actually works. */
  calibration: Calibration;

  completeIntake: (answers: IntakeAnswers) => Promise<void>;
  regenerate: () => Promise<void>;
  toggle: (taskId: string) => void;
  focusTask: (taskId: string) => void;
  finishDay: (note: string) => Promise<void>;
  updateGoals: (text: string) => Promise<void>;
  signOut: () => Promise<void>;
  dismissReveal: () => void;
  clearError: () => void;
}

const SidqContext = createContext<SidqContextValue | null>(null);

const ANON_USER = 'local';
const GUEST_KEY = 'sidq.guest';

export function SidqProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [today, setToday] = useState<Day | null>(null);
  const [recentDays, setRecentDays] = useState<Day[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [justRevealed, setJustRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [lastStreakMessage, setLastStreakMessage] = useState<string | null>(null);
  // Persisted so a refresh does not bounce a guest back to the sign-in wall.
  const [guest, setGuest] = useState(() => {
    try {
      return localStorage.getItem(GUEST_KEY) === '1';
    } catch {
      return false;
    }
  });

  const storeRef = useRef<SidqStore>(new LocalStore());

  // Recomputed whenever history changes. Cheap: it is a pass over at most 60 days.
  /*
   * The paywall that matters.
   *
   * Calibration is what the paid plan is actually for, so a free account gets
   * EMPTY_CALIBRATION regardless of how much history it has. Downstream that is
   * already the honest "not enough evidence yet" state, so every consumer
   * degrades correctly rather than needing its own check.
   *
   * History is also trimmed to the entitled window before deriving, so the gate
   * holds even if the tier check above were ever wrong.
   */
  const entitlements = useMemo(() => entitlementsFor(planFromTier(profile?.planTier)), [profile]);

  const calibration: Calibration = useMemo(() => {
    if (!entitlements.calibration) return EMPTY_CALIBRATION;
    const window = isUnlimited(entitlements.historyDays)
      ? recentDays
      : recentDays.slice(0, entitlements.historyDays);
    return window.length > 0 ? deriveCalibration(window) : EMPTY_CALIBRATION;
  }, [recentDays, entitlements]);

  const streak: StreakState = useMemo(
    () =>
      profile
        ? {
            count: profile.streakCount,
            lastActive: profile.streakLastActive,
            grace: profile.graceRemaining,
          }
        : initialStreak(),
    [profile],
  );

  // ---------------------------------------------------------------------------
  // Auth. Absent a backend this resolves immediately to the anonymous local store.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      void bootstrap(new LocalStore());
      return;
    }

    let cancelled = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      void bootstrap(storeFor(data.session));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      void bootstrap(storeFor(next));
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function storeFor(next: Session | null): SidqStore {
    const supabase = getSupabase();
    if (supabase && next?.user) return new SupabaseStore(supabase, next.user.id);
    return new LocalStore();
  }

  const bootstrap = useCallback(async (store: SidqStore) => {
    storeRef.current = store;
    try {
      const [storedProfile, storedGoals] = await Promise.all([store.getProfile(), store.getGoals()]);

      setProfile(storedProfile);
      setGoals(storedGoals);

      if (!storedProfile || storedGoals.length === 0) {
        setPhase('needs-intake');
        return;
      }

      const date = localDateKey();
      const existing = await store.getDay(date);
      setRecentDays(await store.getRecentDays(14));

      if (existing) {
        setToday(existing);
        setPhase('ready');
        return;
      }

      // Morning arrives and there is no plan yet. Build it without being asked.
      // Near-zero activation is the entire point of the ritual.
      await runGeneration(store, storedProfile, storedGoals, date);
    } catch (err) {
      setError(messageFor(err));
      setPhase('error');
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------
  const runGeneration = useCallback(
    async (store: SidqStore, currentProfile: Profile, currentGoals: Goal[], date: string) => {
      setPhase('generating');
      setLimitReached(false);

      const yesterday = await store.getDay(addDays(date, -1));
      const carried = yesterday ? carriedFrom(yesterday) : [];

      // The whole history, not just yesterday. This is what makes day 30 better
      // than day 1, and it is the input a copied prompt does not have.
      const history = await store.getRecentDays(60);

      /*
       * The same gate as the UI, applied to the prompt.
       *
       * Without this a free account would still get calibrated plans, because
       * the brief goes straight into the system prompt where nobody can see it.
       * That is the back door that makes the paid tier meaningless.
       */
      const limits = entitlementsFor(planFromTier(currentProfile.planTier));
      const brief = limits.calibration
        ? calibrationBrief(
            deriveCalibration(
              isUnlimited(limits.historyDays)
                ? history
                : history.slice(0, limits.historyDays),
            ),
          )
        : undefined;

      const input = buildPlanInput({
        date,
        goals: currentGoals,
        profile: currentProfile,
        carriedOver: carried.map((c) => ({ title: c.title, carryCount: c.carryCount })),
        calibration: brief,
      });

      try {
        const token = await getAccessToken();
        const { plan, isDemo: demo } = await generatePlan(input, token);

        const dayId = `${currentProfile.id}:${date}`;
        const day: Day = {
          id: dayId,
          userId: currentProfile.id,
          date,
          generatedAt: new Date().toISOString(),
          status: 'ready',
          topPriority: plan.top_priority,
          note: plan.note,
          tasks: planToTasks(plan, dayId, carriedIndex(carried)),
        };

        await store.saveDay(day);
        setToday(day);
        setIsDemo(demo);
        setJustRevealed(true);
        setRecentDays(await store.getRecentDays(14));
        setPhase('ready');
      } catch (err) {
        if (err instanceof PlanLimitReachedError) {
          setLimitReached(true);
          setPhase('ready');
          return;
        }
        setError(messageFor(err));
        setPhase('error');
      }
    },
    [],
  );

  const completeIntake = useCallback(
    async (answers: IntakeAnswers) => {
      const store = storeRef.current;
      const date = localDateKey();
      const userId = session?.user.id ?? ANON_USER;

      const nextGoals: Goal[] = answers.goals
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((text, i) => ({ id: `${userId}:goal:${i}`, userId, text, active: true }));

      const nextProfile: Profile = {
        id: userId,
        email: session?.user.email ?? null,
        workRhythm: answers.workRhythm,
        derailers: answers.derailers || null,
        streakCount: 0,
        streakLastActive: null,
        graceRemaining: 2,
        planTier: 'free',
        ritualHour: 7,
        timezone: timezone(),
      };

      await store.saveProfile(nextProfile);
      await store.saveGoals(nextGoals);
      setProfile(nextProfile);
      setGoals(nextGoals);

      await runGeneration(store, nextProfile, nextGoals, date);
    },
    [session, runGeneration],
  );

  const regenerate = useCallback(async () => {
    if (!profile) return;
    await runGeneration(storeRef.current, profile, goals, localDateKey());
  }, [profile, goals, runGeneration]);

  const updateGoals = useCallback(
    async (text: string) => {
      const userId = profile?.id ?? ANON_USER;
      const next: Goal[] = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((t, i) => ({ id: `${userId}:goal:${i}`, userId, text: t, active: true }));
      await storeRef.current.saveGoals(next);
      setGoals(next);
    },
    [profile],
  );

  // ---------------------------------------------------------------------------
  // Day interaction. Optimistic, a tap must never wait on a network round trip.
  // ---------------------------------------------------------------------------
  const persist = useCallback((next: Day) => {
    setToday(next);
    void storeRef.current.saveDay(next).catch((err) => setError(messageFor(err)));
  }, []);

  const toggle = useCallback(
    (taskId: string) => {
      if (!today) return;
      persist(toggleTask(today, taskId));
    },
    [today, persist],
  );

  const focusTask = useCallback(
    (taskId: string) => {
      if (!today) return;
      persist(startFocus(today, taskId));
    },
    [today, persist],
  );

  const finishDay = useCallback(
    async (note: string) => {
      if (!today || !profile) return;
      const store = storeRef.current;

      const done = completedCount(today);
      const planned = plannedCount(today);
      const closed = closeDay(today);

      await store.saveDay(closed);

      const reflection: Reflection = {
        id: `${closed.id}:reflection`,
        dayId: closed.id,
        note,
        plannedCount: planned,
        completedCount: done,
        createdAt: new Date().toISOString(),
      };
      await store.saveReflection(reflection);

      // The streak advances only on a day that earned it, and the forgiving rules
      // live entirely in recordActiveDay, nothing here can reset a count to zero.
      let nextProfile = profile;
      if (dayCountsAsActive(done)) {
        const result = recordActiveDay(
          { count: profile.streakCount, lastActive: profile.streakLastActive, grace: profile.graceRemaining },
          today.date,
        );
        nextProfile = {
          ...profile,
          streakCount: result.state.count,
          streakLastActive: result.state.lastActive,
          graceRemaining: result.state.grace,
        };
        await store.saveProfile(nextProfile);
        setProfile(nextProfile);
        setLastStreakMessage(streakMessage(result));
      } else {
        setLastStreakMessage(null);
      }

      setToday(closed);
      setRecentDays(await store.getRecentDays(14));
    },
    [today, profile],
  );

  const signOut = useCallback(async () => {
    try {
      localStorage.removeItem(GUEST_KEY);
    } catch {
      /* storage unavailable, nothing to clear */
    }
    setGuest(false);
    await getSupabase()?.auth.signOut();
  }, []);

  const continueWithoutAccount = useCallback(() => {
    try {
      localStorage.setItem(GUEST_KEY, '1');
    } catch {
      /* storage unavailable, guest mode lasts this session only */
    }
    setGuest(true);
  }, []);

  const value: SidqContextValue = {
    phase,
    session,
    // Without a backend there is no account to require, so the wall would only be
    // theatre. It gates when auth actually exists.
    canEnter: !isBackendConfigured || session !== null || guest,
    continueWithoutAccount,
    profile,
    goals,
    today,
    recentDays,
    isDemo,
    justRevealed,
    error,
    limitReached,
    streak,
    lastStreakMessage,
    calibration,
    completeIntake,
    regenerate,
    toggle,
    focusTask,
    finishDay,
    updateGoals,
    signOut,
    dismissReveal: () => setJustRevealed(false),
    clearError: () => {
      setError(null);
      setPhase(profile && goals.length > 0 ? 'ready' : 'needs-intake');
    },
  };

  return <SidqContext.Provider value={value}>{children}</SidqContext.Provider>;
}

function messageFor(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Something went wrong building your day.';
}

export function useSidq(): SidqContextValue {
  const ctx = useContext(SidqContext);
  if (!ctx) throw new Error('useSidq must be used inside SidqProvider');
  return ctx;
}
