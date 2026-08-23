-- ---------------------------------------------------------------------------
-- 0008 — invites run out, and there is a limit on how many count.
--
-- 0007 paid five handovers a week per invite, permanently, up to twenty-five.
-- Permanent is the wrong shape for this. It pays once and then keeps paying
-- forever, so the person who invites five friends in their first week is on a
-- better free plan than everybody else for as long as the account exists, and
-- has no reason to invite anybody again or to ever pay.
--
-- Two changes, and they point the same way:
--
--   The bonus is a rolling week. An invite is worth five handovers a week for
--   seven days and then it is gone. Keeping the lift means bringing somebody
--   new, which is the behaviour worth paying for; not bothering means landing
--   back on ten, which is where the upgrade argument lives.
--
--   Three a week, per account. Without a limit the ceiling is reached by
--   whoever automates signups rather than whoever tells their friends, and a
--   week is long enough that a real person will not notice the limit at all.
--
-- The cap from 0007 stays. Three a week at five each is fifteen, plus five for
-- having used somebody's code, so twenty-five is no longer reachable — it is
-- kept as the backstop it always was rather than removed on the assumption
-- that the arithmetic above never changes.
-- ---------------------------------------------------------------------------

/*
 * How long an invite is worth anything.
 *
 * A function rather than a literal so the window is stated once. `redeem_invite`
 * counts against it and `invite_bonus` pays against it, and the two drifting
 * apart would mean somebody is refused for a limit they are no longer earning
 * anything from.
 */
create or replace function public.invite_window()
returns interval
language sql
immutable
as $$
  select interval '7 days';
$$;

-- How many invites an account may have counted in that window.
create or replace function public.invites_per_window()
returns integer
language sql
immutable
as $$
  select 3;
$$;

-- ---------------------------------------------------------------------------
-- What an invite is worth, now that it expires.
--
-- Only referrals inside the window are paid for, on both sides: the account
-- that invited and the account that used a code. Both decay, because a reward
-- that runs out for one and not the other is two rules to explain.
-- ---------------------------------------------------------------------------
create or replace function public.invite_bonus(account uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select least(
    5 * (
      select count(*)
      from public.referrals
      where inviter = account
        and created_at > now() - public.invite_window()
    )
    + case
        when exists (
          select 1 from public.referrals
          where invitee = account
            and created_at > now() - public.invite_window()
        )
        then 5 else 0
      end,
    25
  )::integer;
$$;

-- ---------------------------------------------------------------------------
-- Using a code, with the weekly limit.
--
-- The limit is on the inviter, not the person redeeming: it is the inviter's
-- reward being rationed. Somebody handed a code by a friend who has already had
-- three this week is not the one at fault, so the message says whose limit it
-- is and that it lifts on its own.
-- ---------------------------------------------------------------------------
create or replace function public.redeem_invite(code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  me     uuid := auth.uid();
  host   uuid;
  recent integer;
begin
  if me is null then
    raise exception 'Sign in before using an invite code.';
  end if;

  select id into host
    from public.profiles
   where referral_code = upper(btrim(code));

  if host is null then
    raise exception 'That code does not exist.';
  end if;

  if host = me then
    raise exception 'That is your own code.';
  end if;

  if exists (select 1 from public.referrals where invitee = me) then
    raise exception 'You have already used an invite code.';
  end if;

  select count(*) into recent
    from public.referrals
   where inviter = host
     and created_at > now() - public.invite_window();

  if recent >= public.invites_per_window() then
    raise exception 'That code has been used % times this week, which is the limit. It works again in a few days.', recent;
  end if;

  insert into public.referrals (inviter, invitee) values (host, me);

  return json_build_object(
    'ok',    true,
    'bonus', public.invite_bonus(me)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The summary gains the two numbers the window needs stated.
--
-- `expires` is when the oldest invite still being paid for stops counting, so
-- the app can say when the bonus drops rather than letting it change without
-- explanation.
-- ---------------------------------------------------------------------------
create or replace function public.invite_summary()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'code',      p.referral_code,
    'invited',   (select count(*) from public.referrals where inviter = p.id),
    'thisWeek',  (
      select count(*) from public.referrals
      where inviter = p.id and created_at > now() - public.invite_window()
    ),
    'perWeek',   public.invites_per_window(),
    'bonus',     public.invite_bonus(p.id),
    'redeemed',  exists (select 1 from public.referrals where invitee = p.id),
    'expires',   (
      select min(created_at) + public.invite_window()
      from public.referrals
      where (inviter = p.id or invitee = p.id)
        and created_at > now() - public.invite_window()
    )
  )
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke all on function public.invite_summary() from public, anon;
revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.invite_summary() to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
