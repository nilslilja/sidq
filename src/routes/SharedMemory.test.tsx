import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import SharedMemory from "./SharedMemory";

/*
 * The published page is the only surface a stranger ever sees, and the only one
 * that renders text somebody else wrote. Both of those are worth testing for
 * their own reasons.
 */

const row = vi.fn();

const rpc = vi.fn();

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    rpc: (name: string, args: unknown) => {
      rpc(name, args);
      return Promise.resolve(row());
    },
    // Present and deliberately useless. If the page ever goes back to reading
    // the table directly it fails here rather than quietly re-opening the
    // endpoint that lists everybody's shares.
    from: () => {
      throw new Error("the page must read through the shared_memory function");
    },
  }),
}));

function show(id = "abc") {
  return render(
    <MemoryRouter initialEntries={[`/m/${id}`]}>
      <Routes>
        <Route path="/m/:id" element={<SharedMemory />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  row.mockReset();
  rpc.mockReset();
});

describe("a published memory", () => {
  test("renders the project and what Sidq wrote about it", async () => {
    row.mockReturnValue({
      data: [
        {
          project: "Sidq",
          markdown: "## Opened with\n- the entire PRD blueprint. go",
          created_at: "2026-09-09T20:00:00Z",
        },
      ],
      error: null,
    });

    show();

    expect(await screen.findByRole("heading", { name: "Sidq" })).toBeVisible();
    expect(
      await screen.findByText(/the entire PRD blueprint/),
    ).toBeVisible();
  });

  test("a link that was taken down reads the same as one that never existed", async () => {
    /*
     * Saying "this was unpublished" would confirm to anybody holding an old
     * link that it once existed, and that is exactly what somebody pressing
     * unpublish is trying to undo.
     */
    row.mockReturnValue({ data: [], error: null });
    show("gone");

    expect(
      await screen.findByRole("heading", { name: /nothing at this link/i }),
    ).toBeVisible();
    expect(screen.queryByText(/unpublish|removed|deleted/i)).toBeNull();
  });

  test("one memory is fetched by id, never a list of everybody's", async () => {
    /*
     * The bug this replaced: the page read the table, and any table anon can
     * read is a list endpoint in PostgREST. The 22-character id stopped anyone
     * guessing a link and did nothing about
     * `GET /shared_memories?select=markdown`, which returns every memory ever
     * published to anyone holding the anon key — and the anon key ships in the
     * app and the site.
     */
    row.mockReturnValue({ data: [], error: null });
    show("xyz");

    await screen.findByRole("heading", { name: /nothing at this link/i });
    expect(rpc).toHaveBeenCalledWith("shared_memory", { share_id: "xyz" });
  });

  test("the migration exposes no readable table, only the function", () => {
    const sql = readFileSync("supabase/migrations/0012_shared_memories.sql", "utf8");
    // A select policy on this table is the whole vulnerability, whatever the
    // column grants say alongside it.
    expect(sql).not.toMatch(/for\s+select/i);
    expect(sql).toMatch(/create or replace function public\.shared_memory/);
    expect(sql).toMatch(/security definer/);
  });

  test("published text is never set as HTML", () => {
    /*
     * The page renders a string a stranger supplied. One
     * dangerouslySetInnerHTML here turns a shared memory into script running on
     * our own origin, and no other test in this file would notice, because the
     * rendered output looks identical either way.
     */
    const source = readFileSync("src/routes/SharedMemory.tsx", "utf8");
    // The prop, not the word: the file explains in a comment why it does not
    // use this, and a check that cannot tell those apart fails on its own
    // documentation and gets deleted by whoever it next accuses.
    expect(source).not.toMatch(/dangerouslySetInnerHTML\s*=/);
  });
});

describe("what the privacy page has to say about it", () => {
  test("publishing is described, because it is the one thing that leaves", () => {
    // The page's whole argument is that nothing is uploaded. A feature that
    // uploads has to be named there, or the claim stops being true and nobody
    // finds out from us.
    const legal = readFileSync("src/routes/Legal.tsx", "utf8");
    expect(legal).toMatch(/Sharing a project memory/i);
    expect(legal).toMatch(/unpublish/i);
  });
});
