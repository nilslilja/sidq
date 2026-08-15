-- Sidq initial schema.
--
-- Deviation from the blueprint worth knowing about: the blueprint calls the first
-- table `users`, but Supabase owns `auth.users` and you cannot add columns to it.
-- The standard pattern is a `profiles` table keyed on the auth uid, which is what
-- this is. Every other table matches the blueprint.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text,
  created_at          timestamptz not null default now(),
  work_rhythm         text check (work_rhythm in ('morning','afternoon','night','chaos')),
  derailers           text,
  streak_count        integer not null default 0 check (streak_count >= 0),
  streak_last_active  date,
  -- Forgiveness budget. Spent to cover missed days instead of resetting the streak.
  grace_remaining     integer not null default 2 check (grace_remaining between 0 and 2),
  plan_tier           text not null default 'free' check (plan_tier in ('free','paid')),
  ritual_hour         integer not null default 7 check (ritual_hour between 0 and 23),
  timezone            text not null default 'UTC',
  stripe_customer_id  text unique,
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- goals — the durable things the user is chasing. Accumulating these is what
-- makes the app feel like it knows them, built purely from in-app behaviour.
-- ---------------------------------------------------------------------------
create table public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  text        text not null check (length(trim(text)) > 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index goals_user_active_idx on public.goals (user_id, active);

-- ---------------------------------------------------------------------------
-- days — exactly one per user per local calendar date
-- ---------------------------------------------------------------------------
create table public.days (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  date          date not null,
  generated_at  timestamptz,
  status        text not null default 'generating' check (status in ('generating','ready','closed')),
  top_priority  text not null default '',
  note          text not null default '',
  created_at    timestamptz not null default now(),
  unique (user_id, date)
);
create index days_user_date_idx on public.days (user_id, date desc);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id                  uuid primary key default gen_random_uuid(),
  day_id              uuid not null references public.days(id) on delete cascade,
  title               text not null check (length(trim(title)) > 0),
  why                 text not null default '',
  priority_rank       integer not null default 0,
  est_minutes         integer not null default 25 check (est_minutes > 0 and est_minutes <= 240),
  status              text not null default 'pending' check (status in ('pending','active','completed','rolled')),
  carried_from_day_id uuid references public.days(id) on delete set null,
  -- Not in the blueprint, but required: carried_from_day_id points at a day, so
  -- there is no task lineage to walk. Without a counter the planner cannot tell a
  -- task carried once from one carried five times, and that distinction drives the
  -- single most useful rule in the prompt.
  carry_count         integer not null default 0 check (carry_count >= 0),
  completed_at        timestamptz,
  created_at          timestamptz not null default now()
);
create index tasks_day_rank_idx on public.tasks (day_id, priority_rank);

-- ---------------------------------------------------------------------------
-- reflections — one per day, written at shutdown
-- ---------------------------------------------------------------------------
create table public.reflections (
  id               uuid primary key default gen_random_uuid(),
  day_id           uuid not null unique references public.days(id) on delete cascade,
  note             text not null default '',
  planned_count    integer not null default 0,
  completed_count  integer not null default 0,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- generation_events — meters the free tier. A row per model call, so a
-- regeneration costs the same as a first generation and the cap cannot be
-- sidestepped by deleting and recreating a day.
-- ---------------------------------------------------------------------------
create table public.generation_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index generation_events_user_time_idx on public.generation_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- push_subscriptions — web push is the retention lever, so it ships with the
-- schema rather than being bolted on later
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- Row level security. Enabled on every table, no exceptions. A user can only ever
-- reach their own rows, and ownership of a task is proved through its day.
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.goals               enable row level security;
alter table public.days                enable row level security;
alter table public.tasks               enable row level security;
alter table public.reflections         enable row level security;
alter table public.generation_events   enable row level security;
alter table public.push_subscriptions  enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own goals" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own days" on public.days
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own tasks" on public.tasks
  for all using (
    exists (select 1 from public.days d where d.id = tasks.day_id and d.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.days d where d.id = tasks.day_id and d.user_id = auth.uid())
  );

create policy "own reflections" on public.reflections
  for all using (
    exists (select 1 from public.days d where d.id = reflections.day_id and d.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.days d where d.id = reflections.day_id and d.user_id = auth.uid())
  );

-- Read-only to the client: the count is the paywall, so only the service role
-- (the edge function) may write it.
create policy "read own generations" on public.generation_events
  for select using (auth.uid() = user_id);

create policy "own push subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- plan_tier is set by the Stripe webhook alone. Without this a user could grant
-- themselves a paid plan with a single PATCH against the REST API.
create or replace function public.guard_plan_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plan_tier is distinct from old.plan_tier then
    raise exception 'plan_tier is set by billing, not by the client';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_plan_tier
  before update on public.profiles
  for each row
  when (current_setting('role', true) is distinct from 'service_role')
  execute function public.guard_plan_tier();

-- ---------------------------------------------------------------------------
-- New auth user gets a profile automatically.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
