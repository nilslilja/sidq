-- ---------------------------------------------------------------------------
-- 0014 — somewhere for the counting to land.
--
-- `telemetry.rs` has POSTed batches to /rest/v1/counted since it shipped, and
-- no migration ever created that table. PostgREST answers a missing table with
-- an error, curl's --fail turns that into a failed send, and a failed send
-- leaves the rows queued for next time. So every install that opted in has
-- been keeping a growing backlog it could never deliver, and the dashboard has
-- been reading an empty table as "nobody uses it".
--
-- Idempotent on purpose: if the table was created by hand in the dashboard,
-- this changes nothing about it.
--
-- ── What goes in ────────────────────────────────────────────────────────────
-- Exactly the body `telemetry::payload` builds: a random install id, the app
-- version, the plan, and a batch of events. Events are literals and integers
-- by construction — `telemetry.rs` has a test that fails if the Event enum
-- ever gains a String — so there is no column here that could hold a title,
-- a prompt or a path.
--
-- ── Who can do what ─────────────────────────────────────────────────────────
-- The app sends with the anon key, so anon may insert and nothing else. No
-- select for anon or authenticated: a counting table anybody can read back is
-- a list of every install's behaviour, and nothing on the client needs it.
-- ---------------------------------------------------------------------------

create table if not exists public.counted (
  id          bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  install     text not null check (char_length(install) between 8 and 64),
  version     text not null check (char_length(version) <= 32),
  plan        text not null check (plan in ('free', 'pro', 'duo', 'team')),
  events      jsonb not null check (
                jsonb_typeof(events) = 'array'
                and jsonb_array_length(events) between 1 and 50
              )
);

create index if not exists counted_received_at on public.counted (received_at desc);
create index if not exists counted_install on public.counted (install);

alter table public.counted enable row level security;

drop policy if exists "anyone may add a batch" on public.counted;
create policy "anyone may add a batch"
  on public.counted
  for insert
  to anon, authenticated
  with check (true);

revoke all on public.counted from anon, authenticated;
grant insert (install, version, plan, events) on public.counted to anon, authenticated;
