-- ---------------------------------------------------------------------------
-- One-time print: is anybody actually using Sidq.
--
-- Reads `last_seen` from 0010_activity.sql — the date-only column the desktop
-- app marks each time it checks its plan tier. Run this in the Supabase SQL
-- editor (Project > SQL Editor), not via the anon key: profiles is scoped by
-- RLS to auth.uid(), so an aggregate count needs the editor's elevated role.
-- ---------------------------------------------------------------------------

select
  count(*) filter (where last_seen is not null)                          as ever_seen,
  count(*) filter (where last_seen >= current_date)                      as active_today,
  count(*) filter (where last_seen >= current_date - interval '7 days')  as active_7d,
  count(*) filter (where last_seen >= current_date - interval '30 days') as active_30d,
  count(*)                                                                as total_accounts
from public.profiles;
