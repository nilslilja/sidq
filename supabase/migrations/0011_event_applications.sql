-- Applications to the builders' night.
--
-- Separate table from the product waitlist on purpose: these are people asking
-- to come to an event, not to download the app, and mixing them would poison
-- both lists. Builders and sponsors share the table but are told apart by
-- `kind`, because a sponsor lead is followed up completely differently from a
-- builder and burying it among a hundred builders is how it gets missed.

create table if not exists public.event_applications (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'builder' check (kind in ('builder', 'sponsor')),
  name text not null,
  email text not null,
  age int,
  builds text,
  location text,
  link text,
  created_at timestamptz not null default now()
);

alter table public.event_applications enable row level security;

-- No client may read this list. It is written through the edge function with
-- the service role and read only from the dashboard. A public read policy on a
-- table of people's emails and ages is exactly the leak this app is sold
-- against, so there is not one.
create policy "no direct reads"
  on public.event_applications for select
  using (false);
