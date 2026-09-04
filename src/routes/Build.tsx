import { useState } from "react";
import { cn } from "@/lib/cn";

/*
 * The application page for the builders' night. Its own site, not a page of the
 * product one.
 *
 * ── Why it is deliberately plain ─────────────────────────────────────────────
 *
 * A form page earns trust by looking like it will not waste your time. Every
 * gradient, mascot and "join the movement" headline on a page like this reads
 * as an event that will be thin, because the ones that are thin overcompensate.
 * So this is close to a document: one column, real type, a lot of air, and the
 * only colour is on the one button that matters. The confidence is in how
 * little it is trying.
 *
 * ── The event name lives in one place ────────────────────────────────────────
 *
 * EVENT is the working title and the only thing to change when it is named for
 * real. It is not a hackathon, it is a room of people who build, and the copy
 * says exactly that rather than dressing it up.
 */

// Rename here when the event is named. Everything reads from this.
const EVENT = {
  name: "Builders' Night",
  city: "Stockholm",
  line: "One night. The people in this city who actually build, in one room.",
};

type Kind = "builder" | "sponsor";
type State = "filling" | "sending" | "done" | "error";

const FN_URL =
  (import.meta.env.VITE_SUPABASE_URL as string) + "/functions/v1/apply-build";
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export default function Build() {
  const [kind, setKind] = useState<Kind>("builder");
  const [state, setState] = useState<State>("filling");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    age: "",
    builds: "",
    location: "",
    link: "",
  });

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ANON}`,
          apikey: ANON,
        },
        body: JSON.stringify({ kind, ...form, age: Number(form.age) || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        saved?: boolean;
      };
      if (!res.ok || !data.saved) {
        throw new Error(data.error ?? "Something went wrong. Try again.");
      }
      setState("done");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (state === "done") {
    return (
      <Page>
        <div className="animate-[rise_500ms_cubic-bezier(0.16,1,0.3,1)_both]">
          <p className="font-display text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.05] tracking-[-0.03em] text-ink">
            {kind === "sponsor" ? "Got it." : "You're in."}
          </p>
          <p className="ink-muted mt-4 max-w-[42ch] text-[1.0625rem] leading-relaxed">
            {kind === "sponsor"
              ? "This came straight to me. I'll come back to you personally with what I have in mind."
              : "Check your inbox for confirmation. I'll send the date and place as they lock in. If you know one other person who ships, send them here."}
          </p>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <header>
        <p className="text-[0.75rem] uppercase tracking-[0.18em] text-ink/45">
          {EVENT.city}
        </p>
        <h1 className="mt-3 font-display text-[clamp(2rem,5.5vw,3.5rem)] leading-[0.98] tracking-[-0.04em] text-ink">
          {EVENT.name}
        </h1>
        <p className="ink-muted mt-4 max-w-[46ch] text-[1.0625rem] leading-relaxed">
          {EVENT.line} Not a networking evening. Everyone in the room has made
          something. Say what you build and you're considered.
        </p>
      </header>

      {/* Two audiences, one form. The toggle changes which questions matter. */}
      <div className="mt-10 flex gap-1 rounded-full border border-ink/10 bg-ink/[0.03] p-1 text-[0.875rem]">
        <Toggle on={kind === "builder"} onClick={() => setKind("builder")}>
          I build
        </Toggle>
        <Toggle on={kind === "sponsor"} onClick={() => setKind("sponsor")}>
          I want to sponsor
        </Toggle>
      </div>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <Field label="Name" value={form.name} onChange={set("name")} required />
        <Field
          label="Email"
          type="email"
          value={form.email}
          onChange={set("email")}
          required
        />

        {kind === "builder" ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Age"
                type="number"
                value={form.age}
                onChange={set("age")}
              />
              <Field
                label="Where you are"
                value={form.location}
                onChange={set("location")}
                placeholder="Stockholm"
              />
            </div>
            <Field
              label="What do you build?"
              value={form.builds}
              onChange={set("builds")}
              textarea
              required
              placeholder="One or two lines. What you make, and what you're on right now."
            />
            <Field
              label="A link"
              value={form.link}
              onChange={set("link")}
              placeholder="GitHub, a site, anything you've shipped (optional)"
            />
          </>
        ) : (
          <>
            <Field
              label="Company"
              value={form.builds}
              onChange={set("builds")}
              placeholder="Who you are and what you'd want to put your name on"
              required
            />
            <Field
              label="A link"
              value={form.link}
              onChange={set("link")}
              placeholder="Your site (optional)"
            />
          </>
        )}

        {error && (
          <p role="alert" className="text-[0.875rem] text-[#c0392b]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={state === "sending"}
          className={cn(
            "w-full rounded-full bg-ink px-6 py-3.5 text-[0.9375rem] font-medium text-paper",
            "transition-[transform,opacity] duration-150 hover:-translate-y-0.5",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {state === "sending"
            ? "Sending…"
            : kind === "sponsor"
              ? "Reach out"
              : "Apply"}
        </button>
      </form>

      <p className="ink-muted mt-6 text-[0.8125rem] leading-relaxed">
        {form.name || "This"} stays with me. It is not a mailing list and
        nothing here is sold or shared.
      </p>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-paper text-ink">
      <div className="mx-auto w-full max-w-[34rem] px-6 py-[12vh]">{children}</div>
    </main>
  );
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-full px-4 py-2 font-medium transition-colors duration-150",
        on ? "bg-ink text-paper" : "text-ink/55 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  textarea?: boolean;
}) {
  const shared = cn(
    "mt-1.5 w-full rounded-xl border border-ink/12 bg-white px-4 py-3 text-[0.9375rem] text-ink",
    "placeholder:text-ink/35 outline-none",
    "transition-[border-color,box-shadow] duration-150",
    "focus:border-ink/30 focus:shadow-[0_0_0_3px_rgba(18,18,26,0.06)]",
  );
  return (
    <label className="block">
      <span className="text-[0.8125rem] font-medium text-ink/70">
        {label}
        {required && <span className="text-ink/30"> *</span>}
      </span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          rows={3}
          className={cn(shared, "resize-none")}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={shared}
        />
      )}
    </label>
  );
}
