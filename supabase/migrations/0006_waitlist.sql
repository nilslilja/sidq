-- Who is waiting for a build that does not exist yet.
--
-- The site used to offer a Windows .exe and a Linux AppImage. Neither file was
-- ever built, so both 404'd, and the sizes on the buttons were invented. This
-- replaces the lie with the only honest version of it: say Mac only, and count
-- the people who wanted otherwise.
--
-- The count is the point. "Port to Windows" is weeks of work — curl, the
-- library paths, the whole menu-bar placement — and this is the number that
-- decides whether it is worth doing.

create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  platform   text not null check (platform in ('windows', 'linux', 'unknown')),
  created_at timestamptz not null default now(),

  -- One row per person per platform. Somebody clicking twice is impatience,
  -- not demand, and counting it twice would overstate the case for building.
  unique (email, platform)
);

create index if not exists waitlist_platform on public.waitlist (platform, created_at desc);

alter table public.waitlist enable row level security;

/*
 * Anyone may add themselves. Nobody may read the list.
 *
 * This is a public form on a marketing page, so there is no session to check
 * against — insert has to be open. Select is granted to no one at all, which
 * means the table cannot be scraped for email addresses through the anon key
 * even though that key is in the shipped bundle. Counting is done in the
 * dashboard, over the service role, by a person.
 */
create policy waitlist_insert_anyone
  on public.waitlist for insert
  to anon, authenticated
  with check (
    -- Cheap sanity, not validation. Real validation is the confirmation mail
    -- nobody gets until there is something to confirm.
    email like '%_@_%.__%' and length(email) <= 254
  );
