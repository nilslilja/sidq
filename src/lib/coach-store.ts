import { getSupabase, getAccessToken } from './supabase';
import { env, isBackendConfigured } from './env';
import type { CoachLink, ShareScope, LinkStatus } from './coaching';
import type { Day, Task } from '@/types/domain';

/*
 * Data access for the coaching layer.
 *
 * Every read of client behaviour goes through the get_client_signals RPC. There is
 * deliberately no function in this file that selects from days or tasks for another
 * user: if such a path existed, the privacy guarantee would depend on nobody using
 * it, which is not a guarantee.
 */

export interface CoachProfile {
  id: string;
  practiceName: string | null;
  inviteCode: string;
  inviteOpen: boolean;
  seatLimit: number;
  planStatus: 'trialing' | 'active' | 'past_due' | 'canceled';
  trialEndsAt: string;
}

export interface CoachClientRow extends CoachLink {
  displayName: string;
  streakCount: number;
}

function db() {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Accounts are not connected in this environment.');
  return supabase;
}

export function inviteUrl(code: string): string {
  return `${window.location.origin}/join/${encodeURIComponent(code)}`;
}

/** Null when the signed-in user has not set themselves up as a coach. */
export async function getCoachProfile(): Promise<CoachProfile | null> {
  const supabase = db();
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return null;

  const { data, error } = await supabase.from('coach_profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    practiceName: data.practice_name,
    inviteCode: data.invite_code,
    inviteOpen: data.invite_open,
    seatLimit: data.seat_limit,
    planStatus: data.plan_status,
    trialEndsAt: data.trial_ends_at,
  };
}

/** Idempotent: becoming a coach twice is not an error, it is a double click. */
export async function becomeCoach(practiceName: string): Promise<CoachProfile> {
  const supabase = db();
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) throw new Error('Sign in first.');

  const { error } = await supabase
    .from('coach_profiles')
    .upsert({ id: uid, practice_name: practiceName.trim() || null }, { onConflict: 'id' });
  if (error) throw error;

  const profile = await getCoachProfile();
  if (!profile) throw new Error('Could not create the coach profile.');
  return profile;
}

export async function listClients(): Promise<CoachClientRow[]> {
  const supabase = db();
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return [];

  const { data, error } = await supabase
    .from('coach_client_links')
    .select('id, coach_id, client_id, status, share_scope, client_label, joined_at')
    .eq('coach_id', uid)
    .neq('status', 'revoked');
  if (error) throw error;

  return (data ?? []).map((l, i) => ({
    id: l.id,
    coachId: l.coach_id,
    clientId: l.client_id,
    status: l.status as LinkStatus,
    shareScope: l.share_scope as ShareScope,
    invitedAt: l.joined_at,
    acceptedAt: l.joined_at,
    // A coach never learns a client's email or real name from us. They see the
    // label the client chose, or a stable placeholder.
    displayName: l.client_label ?? `Client ${i + 1}`,
    streakCount: 0,
  }));
}

interface SignalRow {
  date: string;
  status: string;
  est_minutes: number;
  task_completed: boolean;
  carry_count: number;
  title: string | null;
}

/**
 * Reconstruct day-shaped objects from the redacted signal rows so the existing
 * calibration engine can run over them unchanged. Titles are placeholders when the
 * client did not share them, which keeps every downstream consumer honest: there is
 * no code path where absent content silently becomes real content.
 */
export async function getClientDays(clientId: string, dayLimit = 60): Promise<Day[]> {
  const supabase = db();
  const { data, error } = await supabase.rpc('get_client_signals', {
    target_client: clientId,
    day_limit: dayLimit,
  });
  if (error) throw error;

  const rows = (data ?? []) as SignalRow[];
  const byDate = new Map<string, Task[]>();

  rows.forEach((r, i) => {
    const list = byDate.get(r.date) ?? [];
    list.push({
      id: `${r.date}:${i}`,
      dayId: r.date,
      title: r.title ?? '(not shared)',
      why: '',
      priorityRank: list.length,
      estMinutes: r.est_minutes,
      status: r.task_completed ? 'completed' : 'rolled',
      carriedFromDayId: null,
      carryCount: r.carry_count,
      completedAt: r.task_completed ? `${r.date}T12:00:00.000Z` : null,
    });
    byDate.set(r.date, list);
  });

  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, tasks]) => ({
      id: date,
      userId: clientId,
      date,
      generatedAt: null,
      status: 'closed' as const,
      topPriority: '',
      note: '',
      tasks,
    }));
}

export interface CoachBriefResult {
  brief: {
    headline: string;
    whats_changed: string[];
    worth_asking: string[];
    going_well: string[];
    confidence: 'high' | 'medium' | 'low';
    data_note: string;
  };
  degraded?: boolean;
}

export async function fetchCoachBrief(clientId: string): Promise<CoachBriefResult> {
  if (!isBackendConfigured) throw new Error('Not connected in this environment.');
  const token = await getAccessToken();
  if (!token) throw new Error('Sign in first.');

  const res = await fetch(`${env.supabaseUrl}/functions/v1/coach-brief`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ clientId }),
  });
  if (!res.ok) throw new Error(`Could not build the brief (${res.status}).`);
  return (await res.json()) as CoachBriefResult;
}

export async function revokeClient(linkId: string): Promise<void> {
  const { error } = await db()
    .from('coach_client_links')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', linkId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Client side of the relationship
// ---------------------------------------------------------------------------

export interface MyCoach {
  linkId: string;
  practiceName: string | null;
  shareScope: ShareScope;
  status: LinkStatus;
  joinedAt: string;
}

export async function listMyCoaches(): Promise<MyCoach[]> {
  const supabase = db();
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return [];

  const { data, error } = await supabase
    .from('coach_client_links')
    .select('id, share_scope, status, joined_at, coach_profiles(practice_name)')
    .eq('client_id', uid)
    .neq('status', 'revoked');
  if (error) throw error;

  return (data ?? []).map((l) => {
    const coach = l.coach_profiles as unknown as { practice_name: string | null } | null;
    return {
      linkId: l.id,
      practiceName: coach?.practice_name ?? null,
      shareScope: l.share_scope as ShareScope,
      status: l.status as LinkStatus,
      joinedAt: l.joined_at,
    };
  });
}

/** Only the client can do this. A database trigger rejects anyone else. */
export async function setShareScope(linkId: string, scope: ShareScope): Promise<void> {
  const { error } = await db()
    .from('coach_client_links')
    .update({ share_scope: scope })
    .eq('id', linkId);
  if (error) throw error;
}

export async function leaveCoach(linkId: string): Promise<void> {
  const { error } = await db()
    .from('coach_client_links')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', linkId);
  if (error) throw error;
}

export async function previewInvite(code: string): Promise<{ practiceName: string | null; hasSpace: boolean } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('preview_coach_invite', { code });
  if (error) return null;
  const row = (data ?? [])[0] as { practice_name: string | null; has_space: boolean } | undefined;
  return row ? { practiceName: row.practice_name, hasSpace: row.has_space } : null;
}

export async function joinCoach(code: string): Promise<{ practiceName: string | null }> {
  const { data, error } = await db().rpc('join_coach', { code });
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as { practice_name: string | null } | undefined;
  return { practiceName: row?.practice_name ?? null };
}
