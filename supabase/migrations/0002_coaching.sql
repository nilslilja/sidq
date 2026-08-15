-- Coaching layer: coaches, client links, consent, and the read path.
--
-- The privacy model is enforced here, not in the UI. A coach has NO row-level read
-- access to days, tasks, goals or reflections at any point. The only way client
-- behaviour reaches a coach is through get_client_signals(), a security-definer
-- function that re-checks the link and the share scope on every call and returns
-- pre-redacted rows.
--
-- Stated plainly because it is the thing to get right: if a client believes their
-- coach can read what they wrote, they write for the coach, the behavioural record
-- stops describing reality, and the calibration engine that a coach is paying for
-- becomes worthless. Privacy here is a data-quality mechanism.

-- ---------------------------------------------------------------------------
-- coach_profiles
-- ---------------------------------------------------------------------------
create table public.coach_profiles (
  id                  uuid primary key references public.profiles(id) on delete cascade,
  practice_name       text,
  -- ONE permanent, rotatable link per coach, not an invite per client.
  -- A coach pastes this into their email signature or intake pack once and never
  -- touches it again. Typing fifteen client emails is the kind of friction that
  -- stops a $20 tool from ever getting set up at all.
  invite_code         text not null unique default encode(gen_random_bytes(9), 'base64'),
  invite_open         boolean not null default true,
  seat_limit          integer not null default 15 check (seat_limit between 1 and 500),
  -- Billing state lives here rather than on profiles: a coach subscription is a
  -- different product from an individual one and must not be confused with it.
  plan_status         text not null default 'trialing'
                        check (plan_status in ('trialing','active','past_due','canceled')),
  trial_ends_at       timestamptz not null default (now() + interval '14 days'),
  stripe_customer_id  text unique,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- coach_client_links
--
-- One row per coaching relationship. share_scope is owned by the CLIENT and is the
-- only thing controlling what flows. A coach can revoke (ending the relationship)
-- but can never widen the scope.
-- ---------------------------------------------------------------------------
create table public.coach_client_links (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references public.coach_profiles(id) on delete cascade,
  client_id     uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'active'
                  check (status in ('active','paused','revoked')),
  share_scope   text not null default 'signals'
                  check (share_scope in ('signals','signals-and-titles','paused')),
  -- The client's own label for the coach, and vice versa. Never a real name unless
  -- the person types one.
  client_label  text,
  joined_at     timestamptz not null default now(),
  revoked_at    timestamptz
);

-- A person cannot be linked to the same coach twice while the link is live.
create unique index coach_client_unique_active
  on public.coach_client_links (coach_id, client_id)
  where status <> 'revoked';

create index coach_links_by_coach  on public.coach_client_links (coach_id, status);
create index coach_links_by_client on public.coach_client_links (client_id, status);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.coach_profiles      enable row level security;
alter table public.coach_client_links  enable row level security;

create policy "own coach profile" on public.coach_profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Both sides of a relationship can see the link row itself. That is deliberate:
-- the client must always be able to see who has access to them.
create policy "read links you are part of" on public.coach_client_links
  for select using (auth.uid() = coach_id or auth.uid() = client_id);

-- Deliberately NO insert policy for coaches.
--
-- An earlier draft allowed `with check (auth.uid() = coach_id)`, which would have
-- let a coach POST a link naming any user id and attach themselves to a stranger
-- without that person ever agreeing. Links are created exclusively by join_coach(),
-- which runs as the client and requires them to hold the coach's code. Consent is
-- therefore structural: there is no code path that creates a relationship the
-- client did not initiate.

-- A coach may change status (revoke, pause) but NEVER share_scope. Enforced by the
-- trigger below, because a WITH CHECK clause cannot compare against the old row.
create policy "coach updates own links" on public.coach_client_links
  for update using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

create policy "client updates own link" on public.coach_client_links
  for update using (auth.uid() = client_id) with check (auth.uid() = client_id);

create policy "coach deletes own links" on public.coach_client_links
  for delete using (auth.uid() = coach_id);

-- ---------------------------------------------------------------------------
-- Consent guard.
--
-- share_scope belongs to the client and to nobody else. Without this a coach could
-- widen their own access with a single PATCH against the REST API, which is exactly
-- the failure that would make the whole privacy claim a lie.
-- ---------------------------------------------------------------------------
create or replace function public.guard_share_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.share_scope is distinct from old.share_scope
     and auth.uid() is distinct from old.client_id then
    raise exception 'share_scope can only be changed by the client';
  end if;

  -- A revoked link is terminal. Re-inviting creates a new row, so a coach cannot
  -- quietly resurrect access after a client has ended the relationship.
  if old.status = 'revoked' and new.status <> 'revoked' then
    raise exception 'a revoked link cannot be reactivated';
  end if;

  return new;
end;
$$;

create trigger coach_links_guard_scope
  before update on public.coach_client_links
  for each row execute function public.guard_share_scope();

-- ---------------------------------------------------------------------------
-- Seat enforcement. Checked in the database so it cannot be bypassed by calling
-- the REST API directly instead of going through the app.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  used  integer;
  limit_ integer;
begin
  select count(*) into used
    from public.coach_client_links
   where coach_id = new.coach_id and status <> 'revoked';

  select seat_limit into limit_
    from public.coach_profiles
   where id = new.coach_id;

  if used >= coalesce(limit_, 0) then
    raise exception 'seat limit reached';
  end if;

  return new;
end;
$$;

create trigger coach_links_enforce_seats
  before insert on public.coach_client_links
  for each row execute function public.enforce_seat_limit();

-- ---------------------------------------------------------------------------
-- The read path.
--
-- This is the ONLY way client behaviour reaches a coach. Note what it does not do:
-- it never returns `why`, never returns the plan note, never returns reflections,
-- and returns titles only when the client's own scope allows it.
-- ---------------------------------------------------------------------------
create or replace function public.get_client_signals(target_client uuid, day_limit integer default 60)
returns table (
  date            date,
  status          text,
  est_minutes     integer,
  task_completed  boolean,
  carry_count     integer,
  title           text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  scope text;
begin
  -- Authorisation, re-checked on every call rather than trusted from the caller.
  select l.share_scope into scope
    from public.coach_client_links l
   where l.coach_id = auth.uid()
     and l.client_id = target_client
     and l.status = 'active'
   limit 1;

  if scope is null then
    raise exception 'no active coaching link';
  end if;

  -- A paused scope yields nothing at all. The coach still sees the link exists,
  -- via the link row, so paused reads as paused rather than as disappearance.
  if scope = 'paused' then
    return;
  end if;

  return query
    select d.date,
           d.status,
           t.est_minutes,
           (t.status = 'completed') as task_completed,
           t.carry_count,
           case when scope = 'signals-and-titles' then t.title else null end as title
      from public.days d
      join public.tasks t on t.day_id = d.id
     where d.user_id = target_client
       and d.status = 'closed'
     order by d.date desc
     limit greatest(day_limit, 1) * 10;
end;
$$;

revoke all on function public.get_client_signals(uuid, integer) from public;
grant execute on function public.get_client_signals(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Joining a coach.
--
-- One call, one code, no email round trip, no pending state to chase. The client
-- clicks their coach's link, signs in, and is connected. Anything more than this
-- does not survive contact with a real client on a real morning.
-- ---------------------------------------------------------------------------
create or replace function public.join_coach(code text)
returns table (link_id uuid, practice_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  found_coach uuid;
  found_name  text;
  used        integer;
  limit_      integer;
  existing    uuid;
  new_id      uuid;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  select cp.id, cp.practice_name, cp.seat_limit
    into found_coach, found_name, limit_
    from public.coach_profiles cp
   where cp.invite_code = code
     and cp.invite_open = true
   limit 1;

  if found_coach is null then
    raise exception 'that link is not valid';
  end if;

  if found_coach = auth.uid() then
    raise exception 'you cannot add yourself as your own client';
  end if;

  -- Idempotent: clicking the link twice reconnects rather than erroring, which is
  -- what actually happens when someone taps an old message.
  select l.id into existing
    from public.coach_client_links l
   where l.coach_id = found_coach
     and l.client_id = auth.uid()
     and l.status <> 'revoked'
   limit 1;

  if existing is not null then
    return query select existing, found_name;
    return;
  end if;

  select count(*) into used
    from public.coach_client_links
   where coach_id = found_coach and status <> 'revoked';

  if used >= coalesce(limit_, 0) then
    raise exception 'this coach has no seats left';
  end if;

  insert into public.coach_client_links (coach_id, client_id)
  values (found_coach, auth.uid())
  returning id into new_id;

  return query select new_id, found_name;
end;
$$;

revoke all on function public.join_coach(text) from public;
grant execute on function public.join_coach(text) to authenticated;

-- A prospective client needs to see whose link they are about to accept BEFORE
-- signing in. Returns the practice name and nothing else, so a guessed code leaks
-- no client data and no coach contact details.
create or replace function public.preview_coach_invite(code text)
returns table (practice_name text, has_space boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  found_coach uuid;
  found_name  text;
  limit_      integer;
  used        integer;
begin
  select cp.id, cp.practice_name, cp.seat_limit
    into found_coach, found_name, limit_
    from public.coach_profiles cp
   where cp.invite_code = code and cp.invite_open = true
   limit 1;

  if found_coach is null then
    return;
  end if;

  select count(*) into used
    from public.coach_client_links
   where coach_id = found_coach and status <> 'revoked';

  return query select found_name, (used < coalesce(limit_, 0));
end;
$$;

grant execute on function public.preview_coach_invite(text) to anon, authenticated;
