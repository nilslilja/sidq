-- ---------------------------------------------------------------------------
-- 0004 — settle the plan tiers.
--
-- 0003 added 'accountable' for a tier that promised a human being would read
-- your week every week. That was a service, not software: it required somebody
-- to do manual work forever and it did not survive the hundredth customer. It
-- was removed from the product before anyone could buy it, so this drops the
-- value rather than migrating anybody off it.
--
-- 'pro' and 'duo' replace it. 'paid' stays, because every existing subscriber
-- is sitting on that value and the application maps it to Pro. Renaming a value
-- that live customers depend on, to make an enum tidier, is how you cause an
-- outage for precisely the people who are paying.
-- ---------------------------------------------------------------------------

alter table public.profiles
  drop constraint if exists profiles_plan_tier_check;

alter table public.profiles
  add constraint profiles_plan_tier_check
  check (plan_tier in ('free', 'paid', 'pro', 'duo'));

-- Nobody could have reached 'accountable', but assert it rather than assume it:
-- a silent constraint violation on the next write would be much harder to find.
do $$
declare
  stragglers int;
begin
  select count(*) into stragglers
  from public.profiles
  where plan_tier not in ('free', 'paid', 'pro', 'duo');

  if stragglers > 0 then
    raise exception 'unexpected plan_tier values on % rows', stragglers;
  end if;
end $$;
