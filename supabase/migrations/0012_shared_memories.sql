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
 * No policy, and that is the point: nothing reads this table through PostgREST.
 *
 * The first version of this migration gave anon a `using (true)` select policy
 * and relied on the id being 22 random characters. That stops somebody guessing
 * a link and does nothing about the endpoint PostgREST derives from any
 * readable table:
 *
 *     GET /rest/v1/shared_memories?select=id,project,markdown
 *
 * which hands back every memory anybody ever published, to anyone holding the
 * anon key — and the anon key ships inside the app and the website, so that is
 * everyone. Unguessable is not the same as unlistable, and a share feature that
 * leaks the other shares is worse than no share feature.
 *
 * So reads go through one function that takes an id and can only ever return
 * the row matching it. There is no shape of request to it that means "all".
 */
create or replace function public.shared_memory(share_id text)
returns table (id text, project text, markdown text, created_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select m.id, m.project, m.markdown, m.created_at
    from public.shared_memories m
   where m.id = share_id;
$$;

-- `secret` and `author` are not in the return type and cannot be reached from
-- here. The function is the only door and it is a narrow one.
revoke all on function public.shared_memory(text) from public;
grant execute on function public.shared_memory(text) to anon, authenticated;

/*
 * Writes never come through PostgREST either. The share-memory function holds
 * the service role, which is also where the size cap, the signed-in check and
 * the per-author limit live — a public endpoint that accepts arbitrary text
 * from strangers is a pastebin wearing our domain.
 */
revoke all on public.shared_memories from anon, authenticated;
