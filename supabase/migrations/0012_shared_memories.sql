-- ---------------------------------------------------------------------------
-- 0012 — a memory somebody chose to publish.
--
-- ── The tension this table sits in, stated plainly ──────────────────────────
--
-- The front page says nothing is uploaded, and that is the reason people
-- install this. This table holds uploaded text. Both of those stay true only
-- because of where the decision is made: nothing arrives here unless a person
-- picked one project and pressed publish on it, having been told in the window
-- that it leaves the Mac.
--
-- So the wording everywhere is "your conversations never leave this Mac", which
-- remains exactly true — a memory is not a conversation. It is the short
-- derived document Sidq builds *about* a project, and the person publishing it
-- can read every word before it goes. Anything vaguer than that would make the
-- privacy page a lie, and the privacy page is the product.
--
-- ── Why an unguessable id and a separate secret ─────────────────────────────
--
-- The id is in the URL, so it is public by construction. The secret never is:
-- it stays in the settings table on the Mac that published, and it is the only
-- thing that can unpublish. That way a link being forwarded, indexed or posted
-- somewhere cannot cost the author control of the thing they shared.
--
-- anon may read, and may read only four columns. `secret` is not among them,
-- and column grants rather than a view because PostgREST honours them directly
-- and a view is one more object to keep in step.
--
-- Nothing writes through PostgREST at all. Inserts and deletes go through the
-- share-memory function on the service role, which is also where the size cap
-- and the signed-in check live — a public endpoint that accepts arbitrary text
-- from strangers is a pastebin, and this is not going to become one.
-- ---------------------------------------------------------------------------

create table if not exists public.shared_memories (
  id          text primary key,
  secret      text not null,
  -- The project's display name. Never its path: a path is "/Users/nils/..."
  -- and would put a person's name and their disk layout on a public page.
  project     text not null,
  markdown    text not null,
  author      uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists shared_memories_author on public.shared_memories (author, created_at desc);

alter table public.shared_memories enable row level security;

/*
 * Read is open, because a share link that needs an account is not a share link.
 * The id is 22 random characters, so "open" means "open to whoever was given
 * the link" rather than open to enumeration.
 */
drop policy if exists shared_memories_readable on public.shared_memories;
create policy shared_memories_readable
  on public.shared_memories for select
  to anon, authenticated
  using (true);

revoke all on public.shared_memories from anon, authenticated;
grant select (id, project, markdown, created_at) on public.shared_memories to anon, authenticated;
