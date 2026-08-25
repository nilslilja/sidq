-- ---------------------------------------------------------------------------
-- 0010 — enough to know whether anybody is using it.
--
-- There was no measurement of any kind. Not on the site, not in the app. A
-- launch would have produced a number of downloads and nothing else: no way to
-- tell whether people installed and stayed, installed and gave up, or never
-- arrived at all. Those need different fixes and were indistinguishable.
--
-- ── Why this records almost nothing ─────────────────────────────────────────
-- "Your conversations never leave this Mac" is the product. Sending usage
-- telemetry to find out how the product is doing would quietly make the reason
-- to install it untrue, which is a bad trade at any volume.
--
-- So nothing new leaves the machine. The app already calls Supabase every few
-- hours to ask which plan it is on — it has to, that is how the limit works —
-- and the server necessarily knows that call arrived. This records that fact
-- and nothing else: an account, and a date. No conversation, no title, no
-- count of anything, no device, no address.
--
-- A date rather than a timestamp on purpose. Retention is measured in days,
-- and a date cannot be read backwards into when somebody sits at their desk.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists last_seen date;

create index if not exists profiles_last_seen on public.profiles (last_seen desc);

/*
 * Called by the desktop app when it checks its plan, which it already does.
 *
 * SECURITY DEFINER so it can write the column that `guard_plan_tier` protects
 * the neighbours of, and scoped to auth.uid() so an account can only ever mark
 * itself. Returns nothing: this is bookkeeping, and a caller waiting on it
 * would be waiting for no reason.
 */
create or replace function public.seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  update public.profiles
     set last_seen = current_date
   where id = auth.uid()
     and (last_seen is distinct from current_date);
end;
$$;

revoke all on function public.seen() from public, anon;
grant execute on function public.seen() to authenticated;
