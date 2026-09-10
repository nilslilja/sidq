-- ---------------------------------------------------------------------------
-- 0013 — seats, so a team that pays can actually be served.
--
-- ── The bug underneath this one ─────────────────────────────────────────────
--
-- `profiles.plan_tier` has been constrained to ('free', 'paid', 'pro', 'duo')
-- since 0004. `entitlement.rs` has mapped "team" to Plan::Team the whole time,
-- and the pricing page has offered Team for longer than either. So if a Team
-- subscription had ever completed, the webhook's write would have failed the
-- check constraint and the customer would have paid and stayed on Free.
--
-- Nobody found that because the Team button was a mailto: and no Team
-- subscription has ever completed. The tier was unreachable, so the constraint
-- that made it unreachable was never exercised.
--
-- ── Why seats are codes and not a members table ─────────────────────────────
--
-- The product shares through a folder on a drive the team already has. There is
-- no server-side notion of "this team" and deliberately so: adding one would
-- mean the paid tier uploads what the free tier does not, which is the trade
-- the whole product refuses.
--
-- So a seat is a code, exactly like an invite. The buyer's account holds a seat
-- count set by billing; codes are minted against it and each one, once redeemed,
-- puts one account on the Team tier. Nothing here records who works with whom,
-- what they are called, or what they are working on.
--
-- ── Why the count is enforced in the database ───────────────────────────────
--
-- `plan_tier` is already guarded so only the service role may write it, which
-- is what stops a client granting itself Pro. A seat grants a tier, so the same
-- rule has to hold: `redeem_team_seat` is SECURITY DEFINER and is the only path
-- from a code to a tier. A client that could mint its own codes would be a
-- client that could grant itself Team, and the seat count would be decoration.
-- ---------------------------------------------------------------------------

-- Team was never an allowed value. See above.
alter table public.profiles
  drop constraint if exists profiles_plan_tier_check;

alter table public.profiles
  add constraint profiles_plan_tier_check
  check (plan_tier in ('free', 'paid', 'pro', 'duo', 'team'));

/*
 * How many seats this account has bought. Written by billing only, like the
 * tier it sits beside — `guard_plan_tier` covers plan_tier specifically, so
 * this gets its own guard rather than relying on that one's reach.
 */
alter table public.profiles
  add column if not exists team_seats integer not null default 0;

create or replace function public.guard_team_seats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.team_seats is distinct from old.team_seats then
    raise exception 'team_seats is set by billing, not by the client';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_team_seats on public.profiles;
create trigger profiles_guard_team_seats
  before update on public.profiles
  for each row
  when (current_setting('role', true) is distinct from 'service_role')
  execute function public.guard_team_seats();

/*
 * One row per seat handed out.
 *
 * `redeemed_by` null means the code exists and nobody has used it. A seat is
 * released by deleting the row, which is what happens when somebody leaves —
 * the buyer mints a replacement rather than editing a membership list.
 */
create table if not exists public.team_seats (
  code         text primary key,
  owner        uuid not null references auth.users (id) on delete cascade,
  redeemed_by  uuid references auth.users (id) on delete set null,
  redeemed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists team_seats_owner on public.team_seats (owner, created_at);

alter table public.team_seats enable row level security;

-- The owner can see their own seats and nothing else. Reads go through
-- PostgREST; every write goes through the functions below.
drop policy if exists team_seats_owner_reads on public.team_seats;
create policy team_seats_owner_reads
  on public.team_seats for select
  to authenticated
  using (owner = auth.uid());

revoke all on public.team_seats from anon, authenticated;
grant select (code, redeemed_by, redeemed_at, created_at) on public.team_seats to authenticated;

/*
 * Mint the codes this account has paid for, and return all of them.
 *
 * Idempotent by construction: it tops up to `team_seats` rather than adding
 * that many each time, so pressing the button twice does not double a team's
 * seats. That mattering is the whole reason the count lives on the profile and
 * not in the request.
 */
create or replace function public.team_seat_codes()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  me       uuid := auth.uid();
  bought   integer;
  existing integer;
begin
  if me is null then
    raise exception 'Sign in to manage your team.';
  end if;

  select team_seats into bought from public.profiles where id = me;
  if coalesce(bought, 0) = 0 then
    raise exception 'This account has no team seats.';
  end if;

  select count(*) into existing from public.team_seats where owner = me;

  -- One seat is the buyer's own, so codes are minted for the rest.
  while existing < bought - 1 loop
    insert into public.team_seats (code, owner)
    values (public.new_referral_code(), me)
    on conflict (code) do nothing;
    select count(*) into existing from public.team_seats where owner = me;
  end loop;

  return (
    select coalesce(json_agg(json_build_object(
      'code', code,
      'taken', redeemed_by is not null
    ) order by created_at), '[]'::json)
    from public.team_seats where owner = me
  );
end;
$$;

/*
 * Use a seat code, which puts this account on Team.
 *
 * The only path from a code to a tier, and SECURITY DEFINER for the same
 * reason `guard_plan_tier` exists: a client that could write its own tier would
 * make every price on the site optional.
 *
 * Messages are written to be read by the person who just typed the code in.
 * `invites.rs` pulls them straight out of the PostgREST error body.
 */
create or replace function public.redeem_team_seat(code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  me    uuid := auth.uid();
  seat  public.team_seats%rowtype;
begin
  if me is null then
    raise exception 'Sign in before using a team code.';
  end if;

  select * into seat from public.team_seats where team_seats.code = redeem_team_seat.code;

  if seat.code is null then
    raise exception 'That team code does not exist.';
  end if;
  if seat.owner = me then
    raise exception 'That is your own team. You already have a seat.';
  end if;
  if seat.redeemed_by is not null and seat.redeemed_by <> me then
    raise exception 'Somebody has already used that code.';
  end if;

  update public.team_seats
     set redeemed_by = me, redeemed_at = now()
   where team_seats.code = redeem_team_seat.code;

  update public.profiles set plan_tier = 'team' where id = me;

  return json_build_object('tier', 'team');
end;
$$;

revoke all on function public.team_seat_codes() from public, anon;
revoke all on function public.redeem_team_seat(text) from public, anon;
grant execute on function public.team_seat_codes() to authenticated;
grant execute on function public.redeem_team_seat(text) to authenticated;
