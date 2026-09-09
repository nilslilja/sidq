/*
 * Publish one project memory to a link, and take it down again.
 *
 * ── Why a function rather than PostgREST ─────────────────────────────────────
 * The table could have taken an anon insert policy and saved this file. That
 * would leave a public endpoint accepting arbitrary text from anybody, which is
 * a free pastebin wearing our domain, and the first thing it would be used for
 * is not sharing project memories.
 *
 * Edge functions verify the caller's JWT before this code runs, so publishing
 * requires an account. That alone removes the abuse case, and it gives every
 * row an author, which is what makes "delete everything I ever shared" a thing
 * that can exist later.
 *
 * ── Why the secret is returned once and never stored anywhere we can read it ─
 * Unpublishing has to work from the machine that published, without an account
 * lookup, and it must not work for somebody who merely has the link. So the
 * secret goes back in the response, the Mac keeps it, and this function only
 * ever compares it. We can delete a row as the service role, obviously, but
 * nothing in the product does that on a user's behalf.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { json, fail, preflight } from '../_shared/http.ts';

/**
 * A memory is a short derived document. Real ones run to a few kilobytes.
 *
 * The cap is not about storage, it is about what this endpoint is for: at a
 * megabyte somebody is putting something else through it.
 */
const MAX_MARKDOWN = 128 * 1024;

/** Long enough that the URL is not guessable, short enough to paste in chat. */
const ID_CHARS = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomId(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  // Modulo bias over a 56-character alphabet is far below what matters for an
  // identifier this long, and rejection sampling here buys nothing real.
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join('');
}

const admin = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    project?: string;
    markdown?: string;
    id?: string;
    secret?: string;
  };

  /*
   * The caller, taken from the verified token rather than the body.
   *
   * An author id that arrives in the request is not an author id, it is a
   * request to be believed.
   */
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const {
    data: { user },
  } = await admin().auth.getUser(jwt);
  if (!user) return fail(req, 401, 'Sign in to share a memory');

  if (body.action === 'unpublish') {
    const id = (body.id ?? '').trim();
    const secret = (body.secret ?? '').trim();
    if (!id || !secret) return fail(req, 400, 'Nothing to unpublish');

    /*
     * Matched on the secret as well as the author. Either alone would do, and
     * requiring both means a stolen token cannot take down a link and a leaked
     * secret cannot either.
     */
    const { error } = await admin()
      .from('shared_memories')
      .delete()
      .eq('id', id)
      .eq('secret', secret)
      .eq('author', user.id);

    if (error) return fail(req, 500, 'Could not unpublish that', error);
    return json(req, { ok: true });
  }

  const project = (body.project ?? '').trim();
  const markdown = body.markdown ?? '';

  if (!project) return fail(req, 400, 'A shared memory needs a project name');
  if (!markdown.trim()) return fail(req, 400, 'There is nothing in that memory yet');
  if (markdown.length > MAX_MARKDOWN) return fail(req, 400, 'That memory is too large to share');
  // A path would put somebody's name and disk layout on a public page.
  if (project.includes('/')) return fail(req, 400, 'Send the project name, not its path');

  const id = randomId(22);
  const secret = randomId(43);

  const { error } = await admin()
    .from('shared_memories')
    .insert({ id, secret, project: project.slice(0, 120), markdown, author: user.id });

  if (error) return fail(req, 500, 'Could not publish that', error);

  return json(req, { id, secret });
});
