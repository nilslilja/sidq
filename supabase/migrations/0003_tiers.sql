-- ---------------------------------------------------------------------------
-- 0003 — a third paid tier.
--
-- plan_tier was a two-value flag. The pricing page now has three cards, and the
-- top one grants something the middle one does not, so the column has to be able
-- to say which was bought.
--
-- 'paid' is kept rather than renamed to 'pro'. Every existing subscriber is
-- sitting on that value, the webhook writes it, and a rename here would be a
-- migration that silently unsubscribes people if any writer is missed.
-- ---------------------------------------------------------------------------

alter table public.profiles
  drop constraint if exists profiles_plan_tier_check;

alter table public.profiles
  add constraint profiles_plan_tier_check
  check (plan_tier in ('free', 'paid', 'accountable'));

-- The guard trigger from 0001 still applies: only the service role may change
-- this column, so adding a value does not widen who can set it.
