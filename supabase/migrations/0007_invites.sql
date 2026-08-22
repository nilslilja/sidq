-- ---------------------------------------------------------------------------
-- 0007 — invites.
--
-- Every account gets a code. Somebody who signs up and enters yours earns you
-- both more handovers a week, permanently, up to a cap.
--
-- ── Why the reward is not a column ───────────────────────────────────────────
-- The obvious shape is `profiles.bonus_handovers`, incremented when a code is
-- used. That needs a guard trigger to stop a client granting itself the reward
-- with one PATCH, in exactly the way `plan_tier` already does, and then it needs
-- an escape hatch so the invite path can write the column the guard exists to
-- protect. Two mechanisms fighting each other over one integer.
--
-- The reward is derived from the invite records instead. There is no column to
-- protect, a client cannot inflate a number that is not stored, and the figure
-- can never drift from the rows it is supposed to describe. `referrals` has no
-- insert policy at all, so the only way a row appears is `redeem_invite`.
--
-- ── Why the cap ──────────────────────────────────────────────────────────────
-- Without one, enough invites is a free unlimited plan, and the person who
-- gets there is the person automating signups rather than the person telling
-- their friends. Five each, up to twenty-five, is worth having and is not a
-- business model to attack.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists referral_code text;

-- ---------------------------------------------------------------------------
-- The code itself.
--
-- Seven characters from an alphabet with no O/0 and no I/1/L, because these get
-- read off a screen and typed by somebody else, and a code that cannot be
-- dictated over a table is a code nobody passes on.
-- ---------------------------------------------------------------------------
create or replace function public.new_referral_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  i integer;
begin
  loop
    candidate := '';
    for i in 1..7 loop
      candidate := candidate
        || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    exit when not exists (
      select 1 from public.profiles where referral_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

update public.profiles
   set referral_code = public.new_referral_code()
 where referral_code is null;

alter table public.profiles
  alter column referral_code set default public.new_referral_code();

alter table public.profiles
  alter column referral_code set not null;

create unique index if not exists profiles_referral_code_key
  on public.profiles (referral_code);

-- ---------------------------------------------------------------------------
-- Who invited whom.
--
-- The invitee is the primary key: an account can be invited exactly once, which
-- is what stops one person redeeming a code from each of their own alts and
-- what makes "have you already used one" a lookup rather than a policy.
-- ---------------------------------------------------------------------------
create table if not exists public.referrals (
  invitee    uuid primary key references auth.users(id) on delete cascade,
  inviter    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint referrals_not_self check (inviter <> invitee)
);

create index if not exists referrals_inviter_idx on public.referrals (inviter);

alter table public.referrals enable row level security;

-- Read only, and only your own side of it. There is deliberately no insert,
-- update or delete policy: `redeem_invite` is the sole writer.
drop policy if exists "own invites" on public.referrals;
create policy "own invites" on public.referrals
  for select using (auth.uid() = inviter or auth.uid() = invitee);

-- ---------------------------------------------------------------------------
-- What an invite is worth.
--
-- Kept as one function so the number the app shows and the number the app
-- enforces cannot be two different rules. `entitlement.rs` reads it through
-- `invite_summary` and adds it to the free plan's weekly allowance.
-- ---------------------------------------------------------------------------
create or replace function public.invite_bonus(account uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select least(
    5 * (select count(*) from public.referrals where inviter = account)
      + case
          when exists (select 1 from public.referrals where invitee = account)
          then 5 else 0
        end,
    25
  )::integer;
$$;

-- ---------------------------------------------------------------------------
-- Your code, how many people used it, and what that is worth.
-- ---------------------------------------------------------------------------
create or replace function public.invite_summary()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'code',     p.referral_code,
    'invited',  (select count(*) from public.referrals where inviter = p.id),
    'bonus',    public.invite_bonus(p.id),
    'redeemed', exists (select 1 from public.referrals where invitee = p.id)
  )
  from public.profiles p
  where p.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Use somebody's code.
--
-- Security definer because the caller has no write access to `referrals` and
-- must not be given any: every refusal below is a rule the client would
-- otherwise be trusted to keep.
--
-- Errors are written to be shown to a person as they are. A referral failing
-- with "P0001: new row violates row-level security" helps nobody standing in
-- front of it.
-- ---------------------------------------------------------------------------
create or replace function public.redeem_invite(code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  me   uuid := auth.uid();
  host uuid;
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

  insert into public.referrals (inviter, invitee) values (host, me);

  return json_build_object(
    'ok',    true,
    'bonus', public.invite_bonus(me)
  );
end;
$$;

revoke all on function public.invite_summary() from public, anon;
revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.invite_summary() to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
