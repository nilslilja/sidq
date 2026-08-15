-- ---------------------------------------------------------------------------
-- 0005 — meter the premium voice.
--
-- ElevenLabs bills per character on an account-wide key. Without a server-side
-- cap, one runaway loop in one client turns a $0.30/month user into a $300 one,
-- and the first anyone would know is the invoice.
--
-- Deliberately its own table rather than a column on profiles: a counter that is
-- updated in place cannot be audited later, and "why was this month expensive"
-- is a question worth being able to answer.
-- ---------------------------------------------------------------------------

create table if not exists public.speech_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists speech_events_user_time_idx
  on public.speech_events (user_id, created_at desc);

alter table public.speech_events enable row level security;

-- Readable by the owner so the app can show remaining usage. Writes are the
-- edge function's alone, via the service role: a client that can insert its own
-- meter rows can also decline to, which makes the cap decorative.
create policy "own speech events readable"
  on public.speech_events for select
  using (auth.uid() = user_id);
