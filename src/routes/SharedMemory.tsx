import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getSupabase } from "@/lib/supabase";
import { SiteFooter } from "@/components/landing/SiteFooter";

/*
 * A project memory somebody chose to publish.
 *
 * ── Why this page is deliberately plain ──────────────────────────────────────
 *
 * Whoever opens this arrived from a link a person sent them, to read one
 * specific thing. Wrapping it in the marketing page would put the pitch in
 * front of the thing they came for, and the pitch is better made by the
 * document being good. So: the memory, then one line saying what made it.
 *
 * ── Why the markdown is rendered by hand ─────────────────────────────────────
 *
 * A memory is a small, known shape — headings, list items, paragraphs, and the
 * quoted lines Sidq writes. Pulling in a markdown library to render four cases
 * would cost more than the page does, and every markdown renderer is one
 * `dangerouslySetInnerHTML` away from turning published text into script that
 * runs on our origin. Nothing here is ever set as HTML.
 */

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "found"; project: string; markdown: string; when: string };

/** Headings, bullets and rules. Everything else is a paragraph. */
function Rendered({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");

  return (
    <div className="space-y-3">
      {lines.map((line, i) => {
        const key = `${i}-${line.slice(0, 12)}`;
        const text = line.trim();

        if (!text) return null;
        if (text === "---") {
          return <hr key={key} className="my-6 border-black/10" />;
        }
        if (text.startsWith("## ")) {
          return (
            <h2 key={key} className="pt-4 font-display text-[1.375rem] tracking-tight">
              {text.slice(3)}
            </h2>
          );
        }
        if (text.startsWith("# ")) {
          return (
            <h1 key={key} className="font-display text-[2rem] tracking-tight">
              {text.slice(2)}
            </h1>
          );
        }
        if (text.startsWith("- ")) {
          return (
            <p key={key} className="flex gap-3 pl-1 text-[0.9375rem] leading-relaxed">
              <span aria-hidden="true" className="select-none text-black/25">
                •
              </span>
              <span className="min-w-0 flex-1">{text.slice(2)}</span>
            </p>
          );
        }
        return (
          <p key={key} className="text-[0.9375rem] leading-relaxed text-black/70">
            {text}
          </p>
        );
      })}
    </div>
  );
}

export default function SharedMemory() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !id) {
      setState({ kind: "missing" });
      return;
    }

    let cancelled = false;
    void supabase
      .from("shared_memories")
      .select("project, markdown, created_at")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        /*
         * A deleted link and a broken one look the same on purpose. Saying
         * "this was unpublished" would confirm to anybody holding an old link
         * that it once existed, which is the opposite of what unpublishing is
         * for.
         */
        if (error || !data) {
          setState({ kind: "missing" });
          return;
        }
        setState({
          kind: "found",
          project: data.project as string,
          markdown: data.markdown as string,
          when: data.created_at as string,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="min-h-[100dvh] bg-[#F7F6F3] text-black">
      <main className="mx-auto w-full max-w-[46rem] px-6 py-16 sm:py-24">
        {state.kind === "loading" && (
          <p className="text-[0.875rem] text-black/40">Fetching…</p>
        )}

        {state.kind === "missing" && (
          <section aria-labelledby="gone">
            <h1 id="gone" className="font-display text-[2rem] tracking-tight">
              There is nothing at this link
            </h1>
            <p className="mt-4 max-w-[46ch] text-[0.9375rem] leading-relaxed text-black/60">
              It may never have existed, or whoever shared it has taken it down. Both
              look the same from here, which is the point.
            </p>
            <Link
              to="/"
              className="mt-8 inline-block text-[0.875rem] underline underline-offset-4"
            >
              What Sidq is
            </Link>
          </section>
        )}

        {state.kind === "found" && (
          <>
            <header className="border-b border-black/10 pb-6">
              <p className="text-[0.75rem] uppercase tracking-[0.14em] text-black/35">
                A project memory
              </p>
              <h1 className="mt-2 font-display text-[2.25rem] leading-[1.05] tracking-tight">
                {state.project}
              </h1>
              <p className="mt-3 text-[0.8125rem] text-black/45">
                Published {new Date(state.when).toLocaleDateString()} by whoever sent you
                this. Read-only, and it can be taken down at any time.
              </p>
            </header>

            <article className="mt-8">
              <Rendered markdown={state.markdown} />
            </article>

            <aside className="mt-14 rounded-2xl border border-black/10 bg-white/60 p-6">
              <p className="text-[0.9375rem] leading-relaxed text-black/70">
                Sidq wrote this out of the conversations already on one Mac. It reads what
                your assistants have written to your own disk and carries a whole
                conversation into a different one.
              </p>
              <Link
                to="/"
                className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-[0.875rem] font-medium text-white hover:opacity-90"
              >
                Get Sidq
              </Link>
            </aside>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
