import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  desktopBridge,
  type HandoverRecord,
  type PlanStatus,
  type InviteSummary,
  type ProfileFact,
  type SearchHit,
  type SharedHandover,
  type TeamSettings,
} from "@/lib/onboarding/bridge";
import type { WorkSession } from "@/lib/companion/work-history";
import { adoptSession, shareSessionWithDesktop } from "@/lib/supabase";
import { ConnectExtension } from "@/components/companion/ConnectExtension";
import { GrantAccess } from "@/components/companion/GrantAccess";
import { SOURCES, sourceLabel, type Source } from "@/lib/companion/sources";
import { cn } from "@/lib/cn";

/*
 * The window behind the pill.
 *
 * Wispr's shape, and for the reason that shape works: the thing you use is a
 * small overlay you never lose, and behind it sits a real application you open
 * when you want to look at something rather than do something.
 *
 * ── What belongs here, and what does not ─────────────────────────────────────
 * This is an account screen: your numbers, your data, your plan, your invites.
 * It is not a place to be told what Sidq is for.
 *
 * It used to open on an essay — a percentage the size of a fist, and four
 * paragraphs arguing that your assistant hides its reasoning from you. That
 * argument belongs on the site, where somebody is deciding whether to install
 * this. Somebody who already has it is here to look at their own things, and
 * making them scroll past the pitch every time is the app talking about itself.
 *
 * Every number is computed from data that exists. No placeholder cards, no
 * "coming soon" tiles, no stat with a plausible shape and nothing behind it. A
 * section with nothing to show says so in one line and takes up no more room
 * than that. Every row in the sidebar leads somewhere that works.
 */

type Tab =
  "overview" | "search" | "sources" | "profile" | "team" | "plan" | "invite";

type IconName = Tab;

/**
 * The sidebar, in two groups.
 *
 * Above the allowance card: the things Sidq does. Below it: the things your
 * account is. They are the same list of buttons and the rule for both is the
 * same — every one of them opens a panel that renders something real.
 */
const TABS: { id: Tab; label: string; icon: IconName; secondary?: true }[] = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "search", label: "Search", icon: "search" },
  { id: "sources", label: "Sources", icon: "sources" },
  { id: "profile", label: "How you work", icon: "profile" },
  { id: "team", label: "Your team", icon: "team" },
  { id: "plan", label: "Plan", icon: "plan", secondary: true },
  { id: "invite", label: "Invite a friend", icon: "invite", secondary: true },
];

const DAY_MS = 86_400_000;

/** Long enough to read "Copied", short enough that it never feels stuck. */
const COPIED_FOR_MS = 1600;

export function Home() {
  const bridge = useMemo(() => desktopBridge(), []);
  const [tab, setTab] = useState<Tab>("overview");
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [stats, setStats] = useState<[number, number]>([0, 0]);

  /*
   * Bumped when a sign-in lands, and passed to the panels that need an account.
   * They key off it to reload, which is cheaper than lifting their state up
   * here and means each one decides for itself what a new session changes.
   */
  const [signedInAt, setSignedInAt] = useState(0);

  /*
   * The plan as Rust understands it.
   *
   * Asked rather than assumed, and only ever used for wording. Rust confirms
   * the tier against the billing database and applies every limit inside the
   * command that would breach it, so this being wrong changes what somebody is
   * told and not what they are given.
   */
  const [plan, setPlan] = useState<PlanStatus | null>(null);

  /**
   * Everything on this screen that Rust owns, asked for again.
   *
   * Cheap: three local reads, no network. Called on mount, whenever Rust says
   * something changed, and whenever the window comes back to the front.
   */
  const refresh = useCallback(() => {
    if (!bridge) return;
    void bridge
      .recentWork(200)
      .then((rows) => setSessions(rows as WorkSession[]));
    void bridge.indexStats().then(setStats);
    void bridge.planStatus().then(setPlan);
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    refresh();
    /*
     * Refresh the token, then ask what the plan is.
     *
     * Access tokens expire after an hour and Rust's stored copy goes stale with
     * them, so opening this window is the moment to hand over a live one. It
     * also means somebody who has just paid sees it here rather than waiting
     * for a cache to lapse.
     */
    void shareSessionWithDesktop()
      .catch(() => {})
      .then(() => bridge.planStatus())
      .then(setPlan);
  }, [bridge, refresh]);

  /*
   * ── Keep Rust's copy of the token alive ──────────────────────────────────
   *
   * `entitlement::current` calls Supabase with whatever token was last handed
   * to it, and an access token lasts about an hour. Rust cannot renew one — it
   * holds no refresh token, deliberately — so the only thing that keeps it
   * valid is this window calling `getSession`, which renews it in passing.
   *
   * That happened on mount, on focus, and whenever something changed, which
   * covers somebody using the product. It does not cover somebody who has paid
   * and then left Sidq running untouched: the token lapses, every check fails,
   * and `current` falls back to the last confirmed tier — correctly, but only
   * for the grace period. After that a paying customer is quietly on Free.
   *
   * Measured while testing: the stored token was twelve minutes past expiry
   * with the app running, and the server refused it.
   *
   * A timer costs one call every half hour against a token that lasts an hour.
   */
  useEffect(() => {
    if (!bridge) return;
    const timer = setInterval(
      () => void shareSessionWithDesktop().catch(() => {}),
      SESSION_REFRESH_MS,
    );
    return () => clearInterval(timer);
  }, [bridge]);

  /*
   * ── Why this window listens, and also does not rely on listening ──────────
   *
   * It asked for the plan on mount and never again, so the allowance it printed
   * was the one from the moment it opened: you handed a conversation over, the
   * count stayed where it was, and it stayed there until the app was quit.
   * Nothing was miscounted — Rust records every handover — the window just
   * never looked a second time.
   *
   * So Rust announces, and this listens. But an event that fails to arrive
   * fails silently, and events in this app have done exactly that twice. The
   * focus listener is the belt to that braces: you hand a conversation over,
   * you come back to the window, and it is right, whatever the plumbing did.
   */
  useEffect(() => {
    if (!bridge) return;

    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void bridge.onChanged(refresh).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
      window.removeEventListener("focus", onFocus);
    };
  }, [bridge, refresh]);

  /*
   * Signing in has to change this window without being closed and reopened.
   *
   * The browser hands the tokens back through a `sidq://auth` deep link, and
   * until this listener existed nothing in here was watching for it: you signed
   * in, came back, and the panel still said to sign in. Onboarding had the same
   * listener and this window had none, because sign-in only ever happened
   * during setup — which is also why there was no way to start one from here.
   */
  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void bridge
      .onSignedIn((urls) => {
        void adoptSession(urls)
          .then(() => bridge.planStatus())
          .then(setPlan)
          .then(() => setSignedInAt(Date.now()));
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [bridge]);

  // Real working time, summed from what the readers measured. Not an estimate.
  const hoursRead = useMemo(
    () =>
      Math.round(
        sessions.reduce((sum, s) => sum + (s.activeMinutes ?? 0), 0) / 60,
      ),
    [sessions],
  );

  return (
    /*
     * ── The surface ──────────────────────────────────────────────────────
     *
     * A tinted ground with the work floating on it as one white card, which is
     * the shape every good Mac companion app has settled on. The sidebar is not
     * a panel with a border down its side; it sits directly on the ground, and
     * the card's edge is what separates them.
     *
     * ── Why it is light ──────────────────────────────────────────────────
     * It was near-black, and near-black is what an app reaches for when it
     * wants to look serious without deciding anything. Everything on it had to
     * be a percentage of white, so eleven shades of grey ended up standing in
     * for four levels of hierarchy, and the result read as one dim sheet.
     *
     * The lavender is the product's colour and it cannot carry a dark screen —
     * at #B8A6FF it is either invisible or shouting. On a light ground it has
     * somewhere to go: a tint for surfaces, a darker sibling for text, and ink
     * for the one button that matters.
     */
    <div
      className={cn(
        "grid h-[100dvh] grid-cols-[16.5rem_1fr] overflow-hidden text-[#16141C]",
        /*
         * ── Warmth, and where it comes from ──────────────────────────────────
         *
         * This was one flat fill and it read as sterile: a white card on a grey
         * sheet, no light in it anywhere. Two soft washes of the product's own
         * lavender, one warm counterpoint, painted into the ground rather than
         * onto anything — so the card floats on colour instead of on nothing,
         * and the sidebar picks it up without being tinted itself.
         *
         * Fixed, not animated, and behind everything. Decoration that moves
         * costs a frame budget on a window somebody keeps open all day.
         */
        "bg-[#F1EFF7]",
        "bg-[radial-gradient(120%_90%_at_0%_0%,rgba(139,110,255,0.16),transparent_55%),radial-gradient(90%_70%_at_100%_0%,rgba(255,175,130,0.10),transparent_50%),radial-gradient(80%_80%_at_50%_100%,rgba(106,75,234,0.07),transparent_60%)]",
      )}
    >
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="flex min-h-0 flex-col px-3 pb-4 pt-3">
        {/*
         * Room for the traffic lights, which float on the surface now.
         *
         * Also the drag handle: with the titlebar gone there is nothing else
         * to move the window by, and a window you cannot move is worse than
         * a titlebar that clashes.
         */}
        <div data-tauri-drag-region className="h-8 shrink-0" />

        <div className="flex items-center gap-2 px-3 pb-1 pt-2">
          <Mark />
          <span className="font-display text-[1.125rem] leading-none tracking-[-0.045em]">
            Sidq
          </span>
        </div>

        <nav className="mt-6 flex flex-col gap-0.5">
          {TABS.filter((t) => !t.secondary).map((t) => (
            <NavRow
              key={t.id}
              tab={t}
              active={tab === t.id}
              onClick={() => setTab(t.id)}
            />
          ))}
        </nav>

        {/*
         * The allowance, in the one place it belongs.
         *
         * It was three separate readings of the same number: a card down here,
         * a figure in the header strip and a bar on the overview. A limit is
         * something you glance at, and glancing at it in three places is how
         * you stop reading any of them.
         */}
        <div className="mt-auto pt-6">
          {plan && (
            <div
              className={cn(
                "rounded-[14px] border border-[#B8A6FF]/45 px-4 py-3.5",
                "bg-gradient-to-b from-white to-[#F3EEFF]",
                "shadow-[0_1px_2px_rgba(20,18,28,0.04)]",
              )}
            >
              {plan.handoversCap == null ? (
                <>
                  <p className="text-[0.875rem] font-medium capitalize text-[#16141C]">
                    {plan.plan}
                  </p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-[#57516A]">
                    Unlimited handovers, and search across everything.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[0.875rem] font-medium text-[#16141C]">
                    <span className="text-[#6A4BEA]">
                      {Math.max(0, plan.handoversCap - plan.handoversUsed)}
                    </span>{" "}
                    handovers left
                  </p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-[#57516A]">
                    You get {plan.handoversCap} a week on {plan.plan}. Invite a
                    friend, or upgrade for unlimited.
                  </p>
                  <button
                    onClick={() => void bridge?.openUpgrade()}
                    className={cn(
                      "mt-3 w-full rounded-[10px] px-3 py-2",
                      "bg-gradient-to-b from-[#6A4BEA] to-[#5436C9]",
                      "text-[0.8125rem] font-medium text-white",
                      "shadow-[0_1px_2px_rgba(20,18,28,0.18),0_6px_16px_-8px_rgba(106,75,234,0.6)]",
                      "cursor-pointer transition-[transform,box-shadow] duration-150",
                      "hover:-translate-y-px hover:shadow-[0_2px_4px_rgba(20,18,28,0.2),0_10px_22px_-10px_rgba(106,75,234,0.7)]",
                    )}
                  >
                    Upgrade to Pro
                  </button>
                </>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-col gap-0.5 border-t border-black/[0.07] pt-3">
            {TABS.filter((t) => t.secondary).map((t) => (
              <NavRow
                key={t.id}
                tab={t}
                active={tab === t.id}
                onClick={() => setTab(t.id)}
              />
            ))}
          </div>
        </div>
      </aside>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {/*
       * `min-h-0` is load-bearing, and its absence is a real bug rather than a
       * tidiness one.
       *
       * A grid row is `auto`, which means it grows to its content and will not
       * shrink below it — even inside a container with a fixed height. So the
       * card stretched to the full height of whatever was inside it, its
       * `overflow-y-auto` never had anything to scroll, and everything past
       * the window was simply cut off with no way to reach it. Measured on the
       * Sources panel: viewport 900, this element 1256.
       *
       * `min-h-0` lets the row shrink to the viewport, which is what hands the
       * overflow to the card.
       */}
      <main className="min-h-0 min-w-0 py-3 pl-0 pr-3">
        <div
          className={cn(
            "h-full min-h-0 overflow-y-auto rounded-[18px]",
            // Not flat white. A hair of the ground shows through the top of the
            // card, which is what stops it reading as a sheet of paper.
            "bg-gradient-to-b from-[#FBFAFE] to-white",
            "ring-1 ring-black/[0.06]",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(20,18,28,0.04),0_12px_32px_-16px_rgba(70,50,140,0.18)]",
          )}
        >
          <div data-tauri-drag-region className="h-3" />
          {/* Keyed on the tab so switching panels replays the entrance. */}
          <div key={tab} className="animate-rise px-9 pb-12 pt-5">
            {tab === "overview" && (
              <Overview
                bridge={bridge}
                plan={plan}
                stats={stats}
                hoursRead={hoursRead}
              />
            )}
            {tab === "search" && (
              <Search bridge={bridge} historyDays={plan?.historyDays ?? null} />
            )}
            {tab === "sources" && (
              <Sources sessions={sessions} bridge={bridge} />
            )}
            {tab === "profile" && <Profile bridge={bridge} />}
            {tab === "team" && <Team bridge={bridge} />}
            {tab === "plan" && <Plan bridge={bridge} plan={plan} />}
            {tab === "invite" && (
              <Invite bridge={bridge} signedInAt={signedInAt} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── The sidebar's parts ──────────────────────────────────────────────────── */

/**
 * One row of the sidebar.
 *
 * The active one is a white pill on the tinted ground rather than a bar on its
 * edge. On a dark screen the bar was the only mark that survived; here the row
 * can simply be the same colour as the card it opens, which says "this is the
 * thing on screen" without a second symbol to decode.
 */
function NavRow({
  tab,
  active,
  onClick,
}: {
  tab: (typeof TABS)[number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-[10px] px-3 py-[0.5625rem] text-left",
        "text-[0.875rem] transition-colors duration-150",
        active
          ? "bg-white text-[#16141C] shadow-[0_1px_2px_rgba(20,18,28,0.07),0_4px_12px_-6px_rgba(106,75,234,0.25)]"
          : "text-[#57516A] hover:bg-white/60 hover:text-[#16141C]",
      )}
    >
      <Icon
        name={tab.icon}
        className={active ? "text-[#6A4BEA]" : "text-[#8E8899]"}
      />
      <span className="min-w-0 truncate">{tab.label}</span>
    </button>
  );
}

/**
 * The Sidq mark: the scatter resolving into one clear line.
 *
 * The paths are `public/icons/icon.svg`, which is the Dock icon, cropped to the
 * artwork. The whole 512 square shrunk to 22 points was a smudge — the drawing
 * lives in a wide, short band across the middle of it and the plate is a shade
 * off the sidebar's own ground, so there was nothing to see at that size.
 *
 * The first version of this was four bars, which is Wispr's dictation waveform
 * and says nothing about what Sidq does.
 *
 * These two `d` strings are the icon's own, and `Home.test.tsx` reads the file
 * and fails if they stop matching, because a wordmark that has quietly drifted
 * from the app icon is not something anybody notices by looking.
 */
function Mark() {
  return (
    <svg
      viewBox="72 116 386 208"
      width="30"
      height="16"
      fill="none"
      stroke="#4F46E5"
      strokeWidth="24"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M96 232 C120 168 142 296 168 208 C190 136 210 300 236 236" />
      <path d="M236 236 C258 196 286 256 324 256 L416 256" />
      <circle cx="416" cy="256" r="30" fill="#4F46E5" stroke="none" />
    </svg>
  );
}

/**
 * The nav icons.
 *
 * Drawn here rather than pulled from a set. Six 16px glyphs is not worth a
 * dependency, and every icon library ships hundreds of paths to get them.
 */
function Icon({ name, className }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    overview: (
      <>
        <rect x="2.5" y="2.5" width="5" height="5" rx="1.2" />
        <rect x="10.5" y="2.5" width="5" height="5" rx="1.2" />
        <rect x="2.5" y="10.5" width="5" height="5" rx="1.2" />
        <rect x="10.5" y="10.5" width="5" height="5" rx="1.2" />
      </>
    ),
    search: (
      <>
        <circle cx="8" cy="8" r="5" />
        <path d="M11.8 11.8 15.5 15.5" />
      </>
    ),
    sources: (
      <>
        <ellipse cx="9" cy="4.5" rx="6" ry="2.4" />
        <path d="M3 4.5v9c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4v-9" />
        <path d="M3 9c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4" />
      </>
    ),
    profile: (
      <>
        <path d="M4 3h7l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
        <path d="M6 8.5h6M6 11.5h4" />
      </>
    ),
    team: (
      <>
        <circle cx="6.5" cy="6" r="2.6" />
        <path d="M2 15c0-2.5 2-4.2 4.5-4.2S11 12.5 11 15" />
        <path d="M12 4.2a2.6 2.6 0 0 1 0 5" />
        <path d="M13 10.9c1.9.4 3 1.9 3 4.1" />
      </>
    ),
    plan: (
      <>
        <rect x="2.5" y="4.5" width="13" height="9" rx="1.6" />
        <path d="M2.5 7.8h13" />
      </>
    ),
    invite: (
      <>
        <path d="M2.5 7h13v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V7Z" />
        <path d="M2.5 7 4 3.5h10L15.5 7M9 7v8.5" />
      </>
    ),
  };

  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("shrink-0 transition-colors duration-150", className)}
    >
      {paths[name]}
    </svg>
  );
}

/**
 * Today, written the way a person would say it.
 *
 * The one fact on this screen nobody has to take on trust — it is either right
 * or the machine's clock is wrong.
 */
function today(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * Morning, afternoon or evening.
 *
 * Cheap, and it is the difference between a window that greets you and a window
 * with a heading on it. The boundaries are the ordinary ones rather than
 * anything clever: nobody has ever been annoyed by "good afternoon" at 12:01.
 */
function greeting(): string {
  const hour = new Date().getHours();
  const part =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  /*
   * The name setup asked for, and the reason it is worth asking.
   *
   * Setup used to collect two answers and use neither — both went to
   * localStorage and were read by nothing. A question whose answer changes
   * nothing is a question that should not be asked. This one is on screen every
   * time the window opens.
   */
  const name = (() => {
    try {
      return localStorage.getItem("sidq.name")?.trim() ?? "";
    } catch {
      // A browser refusing storage is not worth failing a greeting over.
      return "";
    }
  })();

  return name ? `${part}, ${name}` : part;
}

/**
 * How often this window renews the token Rust holds.
 *
 * Half of the roughly one-hour life of an access token, so a single missed
 * tick is not enough to let one lapse.
 */
const SESSION_REFRESH_MS = 30 * 60 * 1000;

/**
 * Does this problem mean the sign-in lapsed, rather than anything being wrong?
 *
 * Rust already turns the server's developer-facing wording into a sentence, so
 * this matches on that sentence. Kept in step with `is_a_stale_session` in
 * `invites.rs`: if the two drift, the retry stops firing and the panel goes
 * back to telling somebody to try again at something that cannot work.
 */
function isAStaleSession(problem: string): boolean {
  return problem.includes("sign-in needs refreshing");
}

/* ── Panel headings ───────────────────────────────────────────────────────── */

/**
 * The top of every panel that is not Overview.
 *
 * ── What this is fixing ──────────────────────────────────────────────────────
 * Overview opens on today's date, then a greeting, then a line saying what Sidq
 * is doing right now. Every other panel opened on a single bare word in 1.75rem
 * on white — "Plan", "Search", "Sources" — which is a browser tab, not a screen
 * somebody chose to look at. The window read warm for one route and sterile for
 * the other five.
 *
 * ── Why the eyebrow carries a number ─────────────────────────────────────────
 * The greeting works because the date is checkable: a person can look at it and
 * confirm the app is awake rather than showing them a cached yesterday. An
 * eyebrow reading "YOUR PLAN" above a heading reading "Plan" is decoration and
 * would have been worse than the bare heading it replaced.
 *
 * So every eyebrow states something measured and live, and any panel that has
 * no such number omits the eyebrow entirely rather than inventing one.
 */
function PanelHead({
  eyebrow,
  title,
  lead,
}: {
  /** Something measured and true, or nothing. Rendered uppercase. */
  eyebrow?: string;
  title: React.ReactNode;
  /** One line under the heading. Optional, and never two. */
  lead?: React.ReactNode;
}) {
  return (
    <header>
      {eyebrow && (
        <p className="text-[0.75rem] tracking-[0.08em] text-[#8E8899]">
          {eyebrow.toUpperCase()}
        </p>
      )}
      <h1
        className={cn(
          "font-display text-[1.75rem] leading-[1.1] tracking-[-0.04em]",
          // Only pulled down when there is an eyebrow to be pulled down from.
          eyebrow && "mt-1.5",
        )}
      >
        {title}
      </h1>
      {lead && (
        <p className="mt-2.5 max-w-[54ch] text-[0.9375rem] leading-relaxed text-[#57516A]">
          {lead}
        </p>
      )}
    </header>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

/**
 * What Sidq has of yours, and what you have done with it.
 *
 * Two columns, the way a dashboard wants to be: the record down the left, the
 * standing figures down the right where they can be glanced at without being
 * scrolled past. The figures used to be a strip across the top of every panel,
 * which meant reading them on the search screen and the sources screen too.
 *
 * Every one is measured. Nothing here is an estimate and nothing is rounded up
 * to look better.
 */
function Overview({
  bridge,
  plan,
  stats,
  hoursRead,
}: {
  bridge: ReturnType<typeof desktopBridge>;
  plan: PlanStatus | null;
  stats: [number, number];
  hoursRead: number;
}) {
  const [rows, setRows] = useState<HandoverRecord[] | null>(null);
  const [reach, setReach] = useState<[number, number] | null>(null);

  /*
   * Whether there is a team folder to share into at all.
   *
   * Asked once here rather than per row, and used only to decide whether the
   * button is worth drawing. Rust refuses the call regardless of what this
   * says, so a wrong answer costs a button that does nothing rather than a
   * conversation somewhere it should not be.
   */
  const [sharesWithTeam, setSharesWithTeam] = useState(false);
  const [taps, setTaps] = useState<[string, string] | null>(null);
  const [shared, setShared] = useState<string | null>(null);

  /*
   * How many distinct AIs are actually in the index.
   *
   * Counted from the sessions rather than from the list of AIs Sidq supports,
   * because the useful number is how many of yours it has read — not how many
   * it could.
   */
  const [reading, setReading] = useState(0);

  useEffect(() => {
    if (!bridge) return;
    void bridge.recentHandovers().then(setRows);
    void bridge.tapKeys().then(setTaps);
    void bridge
      .teamSettings()
      .then((t) => setSharesWithTeam(t.allowed && t.folder !== null));
    void bridge.recentWork(500).then((found) => {
      const sessions = found as WorkSession[];
      const ends = sessions
        .map((s) => s.endedAt)
        .filter((n): n is number => typeof n === "number");
      setReach(ends.length > 0 ? [Math.min(...ends), Math.max(...ends)] : null);
      setReading(new Set(sessions.map((s) => s.source ?? "claude-code")).size);
    });
  }, [bridge]);

  return (
    <>
      {/*
       * ── A greeting with something in it ──────────────────────────────────
       *
       * "Welcome back" alone is a label. The date and the time of day are the
       * two things a person can check against reality the moment the window
       * opens, which is what makes a greeting read as the app being awake
       * rather than as decoration.
       */}
      <p className="text-[0.75rem] tracking-[0.08em] text-[#8E8899]">
        {today().toUpperCase()}
      </p>
      <h1 className="mt-1.5 font-display text-[2rem] leading-[1.1] tracking-[-0.04em]">
        {greeting()}
      </h1>
      <p className="mt-2 max-w-[52ch] text-[0.9375rem] leading-relaxed text-[#57516A]">
        {reading > 0 ? (
          <>
            Sidq is reading <span className="text-[#16141C]">{reading}</span>{" "}
            {reading === 1 ? "AI" : "AIs"} on this Mac. Press{" "}
            <Keys>&#8984;&#8679;K</Keys> to carry any conversation into another
            one.
          </>
        ) : (
          <>
            Press <Keys>&#8984;&#8679;K</Keys> to carry a conversation into
            another AI.
          </>
        )}
      </p>

      <div className="mt-8 grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0">
          <h2 className="text-[0.6875rem] tracking-[0.08em] text-[#8E8899]">
            HANDOVERS
          </h2>

          {rows !== null && rows.length === 0 && (
            <div className="mt-3 rounded-[14px] border border-dashed border-black/[0.12] px-5 py-6">
              <p className="text-[0.875rem] font-medium text-[#16141C]">
                Nothing handed over yet
              </p>
              <p className="mt-1.5 max-w-[52ch] text-[0.875rem] leading-relaxed text-[#57516A]">
                Press <Keys>&#8984;&#8679;K</Keys>, pick a conversation, press
                Enter. Each one is also written to your Downloads folder as a
                Markdown file, so nothing is lost to a misclick the way a
                clipboard is.
              </p>
            </div>
          )}

          {rows !== null && rows.length > 0 && (
            <ul className="mt-3 divide-y divide-black/[0.06] border-y border-black/[0.06]">
              {rows.map((row) => (
                <li
                  key={`${row.sessionId}-${row.madeAt}`}
                  className={cn(
                    "flex items-baseline gap-4 rounded-[10px] px-3 py-3",
                    "transition-[transform,background-color,box-shadow] duration-150",
                    "hover:-translate-y-px hover:bg-[#F8F6FD] hover:shadow-[0_2px_10px_-6px_rgba(70,50,140,0.35)]",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.875rem] text-[#16141C]">
                      {row.title || "Untitled conversation"}
                    </span>
                    <span className="block truncate text-[0.75rem] text-[#8E8899]">
                      {sourceLabel(row.source)}
                      {row.project && ` · ${row.project}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.75rem] tabular-nums text-[#8E8899]">
                    {whenHandedOver(row.madeAt)}
                  </span>
                  {/*
                   * Shown only to a team that has somewhere to share into, so
                   * it is not a button advertising a plan on a row about work
                   * somebody already did. Rust refuses it either way.
                   */}
                  {sharesWithTeam && (
                    <button
                      onClick={() => {
                        void bridge
                          ?.shareHandover({
                            sessionId: row.sessionId,
                            title: row.title || "Untitled conversation",
                            source: row.source,
                            resumePoint: "",
                            when: whenHandedOver(row.madeAt),
                            project: row.project,
                          })
                          .then((ok) => ok && setShared(row.sessionId));
                      }}
                      className={cn(
                        "shrink-0 rounded-md px-2 py-1 text-[0.75rem] font-medium",
                        "cursor-pointer text-[#57516A] transition-colors duration-150",
                        "hover:bg-[#16141C] hover:text-white",
                      )}
                    >
                      {shared === row.sessionId ? "Shared" : "Share with team"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* The standing figures. Wispr's shape, and it is the right one: a
            small stack of numbers that never moves, next to a list that does. */}
        <aside
          className={cn(
            "rounded-[14px] px-5 py-4 ring-1 ring-[#B8A6FF]/30",
            "bg-gradient-to-b from-[#F6F2FF] to-[#FBFAFE]",
          )}
        >
          <Stat value={stats[0].toLocaleString()} label="conversations" />
          <Stat value={stats[1].toLocaleString()} label="messages read" />
          <Stat value={`${hoursRead}h`} label="of work indexed" />
          <Stat
            value={(plan?.handoversUsed ?? 0).toLocaleString()}
            label="handovers, 7 days"
          />
          {reach && (
            <p className="mt-4 border-t border-black/[0.06] pt-3 text-[0.75rem] leading-relaxed text-[#57516A]">
              Read back to {new Date(reach[0]).toLocaleDateString()}. Last read{" "}
              {whenLabel(reach[1])}.
            </p>
          )}

          {/*
           * The gesture, where somebody who already finished setup can find it.
           *
           * It is taught on one screen during setup, which every existing user
           * has already been through — so for all of them it does not exist.
           * The tray menu was the only other place, and nobody opens a tray
           * menu to discover a feature.
           *
           * Read from Rust rather than written here: which key does what is a
           * setting, and a hard-coded one starts lying the moment it changes.
           */}
          {taps && (
            <p className="mt-4 border-t border-black/[0.06] pt-3 text-[0.75rem] leading-relaxed text-[#57516A]">
              Double-tap <Chip>{taps[0]}</Chip> to grab the conversation you
              were just in. <Chip>{taps[1]}</Chip> puts the last one back.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}

/** A keystroke, set in the mono face so it reads as something you press. */
function Keys({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[5px] border border-black/[0.12] bg-[#F5F3FB] px-1.5 py-0.5 font-mono text-[0.75rem] text-[#3A3547]">
      {children}
    </kbd>
  );
}

/* ── Plan ─────────────────────────────────────────────────────────────────── */

/**
 * What this account is on, and what that allows.
 *
 * Every figure comes from `plan_status`, which is Rust reporting the same
 * numbers it enforces. Nothing on this panel is written down twice: if the
 * limit changes in `entitlement.rs`, this changes with it.
 *
 * There is no "manage subscription" button because there is nothing behind one.
 * Sidq has no billing portal, and a button that opens a page that cannot cancel
 * anything is worse than saying where the receipt is.
 */
function Plan({
  bridge,
  plan,
}: {
  bridge: ReturnType<typeof desktopBridge>;
  plan: PlanStatus | null;
}) {
  if (!plan) {
    return (
      <>
        <PanelHead
          title="Plan"
          lead={
            bridge
              ? "Checking your plan…"
              : "Your plan lives in the Sidq app. Open it there."
          }
        />
      </>
    );
  }

  const free = plan.plan === "free";

  return (
    <>
      <PanelHead
        eyebrow={
          plan.handoversCap == null
            ? `${plan.handoversUsed} handovers this week`
            : `${Math.max(plan.handoversCap - plan.handoversUsed, 0)} of ${plan.handoversCap} left this week`
        }
        title={<span className="capitalize">{plan.plan}</span>}
      />

      <dl className="mt-8 max-w-[34rem] divide-y divide-black/[0.07] border-y border-black/[0.07]">
        <Row
          term="Handovers a week"
          detail={
            plan.handoversCap == null
              ? "Unlimited"
              : `${plan.handoversUsed} of ${plan.handoversCap} used`
          }
        />
        <Row
          term="Search reaches back"
          detail={
            plan.historyDays == null ? "Everything" : `${plan.historyDays} days`
          }
        />
        <Row
          term="Conversations kept"
          detail="On this Mac, always. Nothing is uploaded."
        />
      </dl>

      {free ? (
        <div className="mt-8">
          <button
            onClick={() => void bridge?.openUpgrade()}
            className={cn(
              "rounded-lg px-3.5 py-2 text-[0.8125rem] font-medium",
              "bg-[#16141C] text-white transition-opacity duration-150",
              "cursor-pointer hover:opacity-90",
            )}
          >
            See the plans
          </button>
          <p className="mt-3 max-w-[52ch] text-[0.8125rem] leading-relaxed text-[#7A7489]">
            Or raise the free limit without paying: every friend who joins with
            your code adds handovers to both of your weeks. That is the Invite
            tab.
          </p>
        </div>
      ) : (
        <p className="mt-8 max-w-[52ch] text-[0.8125rem] leading-relaxed text-[#7A7489]">
          Billing is handled by Stripe. The receipt in your email has the link
          to change or cancel it.
        </p>
      )}
    </>
  );
}

/** One line of a plan. A definition list, because that is what this is. */
function Row({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3">
      <dt className="text-[0.875rem] text-[#57516A]">{term}</dt>
      <dd className="text-right text-[0.875rem] text-[#16141C]">{detail}</dd>
    </div>
  );
}

/**
 * Whether a stated problem is "you have no account", as opposed to a network
 * that is down or a profile row that has not been written yet.
 *
 * Matched on the sentence rather than a code, because the sentence is the whole
 * contract between `invites.rs` and this panel — there is no code to match on.
 * Getting it wrong shows a sign-in button to somebody who is already signed in,
 * which is a wasted click, not a broken screen; the button is additive and Try
 * again is always there.
 */
function needsAccount(problem: string): boolean {
  return /sign in/i.test(problem);
}

/**
 * When the bonus next drops, said as a person would say it.
 *
 * An empty string means nothing is currently being paid for, which is not the
 * same as expiring now and must not read as a date.
 */
function lapses(expires: string): string {
  if (!expires) return "";

  const days = Math.ceil((new Date(expires).getTime() - Date.now()) / DAY_MS);
  if (Number.isNaN(days)) return "";
  if (days <= 0) return ", lapsing today";
  if (days === 1) return ", until tomorrow";
  return `, for ${days} more days`;
}

/* ── Invite ───────────────────────────────────────────────────────────────── */

/**
 * Your code, and what it has actually earned.
 *
 * The offer is stated with numbers the server sent rather than numbers typed
 * into this file, because the database is what pays them out: `invite_bonus` in
 * 0007_invites.sql decides the amount, `entitlement.rs` adds it to the weekly
 * allowance, and this only reads. A referral page whose promise and payout are
 * maintained separately is a referral page that eventually lies.
 *
 * Both sides of the failure are visible. There is no code without an account,
 * and no way to fetch one offline, so those say so instead of showing a blank
 * box that looks like a bug.
 */
function Invite({
  bridge,
  signedInAt,
}: {
  bridge: ReturnType<typeof desktopBridge>;
  /** Changes when a sign-in lands, which is the cue to ask again. */
  signedInAt: number;
}) {
  const [summary, setSummary] = useState<InviteSummary | null>(null);
  const [copied, setCopied] = useState(false);
  const [entry, setEntry] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [failure, setFailure] = useState("");
  const [opening, setOpening] = useState(false);

  /*
   * A missing bridge is an answer, not a pause.
   *
   * `/home` is a public route on the site as well as the desktop window, and
   * outside the app there is no Rust to ask. Returning early left the panel on
   * "Reading your invites…" forever, which is the one thing this panel was
   * written not to do.
   */
  const load = useCallback(() => {
    if (!bridge) {
      setSummary({
        code: "",
        invited: 0,
        bonus: 0,
        redeemed: false,
        each: 0,
        most: 0,
        thisWeek: 0,
        perWeek: 0,
        expires: "",
        problem: "Invites live in the Sidq app. Open it there.",
      });
      return;
    }
    /*
     * ── Renew the session before asking, and again before giving up ──────────
     *
     * Rust calls Supabase with whatever token this window last handed it, and
     * holds no refresh token of its own, deliberately. So a lapsed token is not
     * something Rust can fix and not something the person did — but it surfaced
     * here as the panel printing "JWT expired" over a Try again button that
     * would fail in exactly the same way, because asking twice does not renew
     * anything.
     *
     * `shareSessionWithDesktop` renews it in passing, since `getSession` does.
     * Doing it before the call covers the common case; doing it again after an
     * auth failure and retrying once covers the token that lapsed between the
     * two. Anything still failing after that is a real problem and is shown.
     */
    void shareSessionWithDesktop()
      .catch(() => {})
      .then(() => bridge.inviteSummary())
      .then(async (first) => {
        if (!isAStaleSession(first.problem)) return first;
        await shareSessionWithDesktop().catch(() => {});
        return bridge.inviteSummary();
      })
      .then(setSummary);
  }, [bridge]);

  useEffect(load, [load, signedInAt]);

  if (summary === null) {
    return (
      <p className="text-[0.875rem] text-[#7A7489]">
        Reading your invites&hellip;
      </p>
    );
  }

  if (summary.problem) {
    return (
      <>
        <PanelHead title="Invite a friend" lead={summary.problem} />

        {/*
         * "Sign in to get your invite code", and then only a Try again button,
         * which asks the same question and gets the same answer. Sign-in used
         * to live entirely in setup, so an account that skipped it had nowhere
         * in the app to make one. Saying what is wrong without offering the
         * one action that fixes it is worse than not saying it.
         */}
        <div className="mt-5 flex items-center gap-2.5">
          {needsAccount(summary.problem) && (
            <button
              onClick={() => {
                setOpening(true);
                void bridge?.openSignIn().catch((err: unknown) => {
                  setOpening(false);
                  setSummary({
                    ...summary,
                    problem: err instanceof Error ? err.message : String(err),
                  });
                });
              }}
              className={cn(
                "rounded-lg bg-[#16141C] px-3.5 py-2 text-[0.8125rem] font-medium text-white",
                "cursor-pointer transition-opacity duration-150 hover:opacity-85",
                opening && "pointer-events-none opacity-60",
              )}
            >
              {opening ? "Waiting for the browser…" : "Sign in"}
            </button>
          )}
          <button
            onClick={load}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium",
              "bg-[#EDEAF7] text-[#16141C] ring-1 ring-inset ring-black/[0.08]",
              "cursor-pointer transition-colors duration-150 hover:bg-[#E6E1F5]",
            )}
          >
            Try again
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <PanelHead
        eyebrow={`${summary.thisWeek} of ${summary.perWeek} used this week`}
        title="Invite a friend"
      />
      {/*
       * The offer, and the fact that it runs out, in the same breath.
       *
       * It used to say "permanently", which paid once and kept paying: invite
       * five friends in your first week and you are on a better free plan for
       * the life of the account, with no reason to invite anybody again or to
       * ever pay. It is a rolling week now, so keeping the lift means bringing
       * somebody new — and the number of numbers here is the reason this is
       * one sentence rather than a table.
       */}
      <p className="mt-3 max-w-[54ch] text-[0.875rem] leading-relaxed text-[#57516A]">
        Anyone who signs up with your code adds {summary.each} handovers a week
        to your account and {summary.each} to theirs, for the next seven days.
        Up to {summary.perWeek} friends a week.
      </p>

      {/* The code, at the size of the thing you are meant to read off a screen
          and say out loud. It has no O, I or L in it for the same reason. */}
      <div className="mt-8 flex max-w-[34rem] items-center gap-3">
        <span
          className={cn(
            "flex-1 rounded-[10px] border border-black/[0.11] px-4 py-3",
            "font-display text-[1.5rem] tracking-[0.18em] text-[#16141C]",
          )}
        >
          {summary.code}
        </span>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(summary.code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), COPIED_FOR_MS);
            });
          }}
          className={cn(
            "shrink-0 rounded-lg px-3.5 py-2 text-[0.8125rem] font-medium",
            "bg-[#16141C] text-white transition-opacity duration-150",
            "cursor-pointer hover:opacity-90",
          )}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <dl className="mt-8 max-w-[34rem] divide-y divide-black/[0.07] border-y border-black/[0.07]">
        <Row
          term="People who used it"
          detail={
            summary.invited === 0 ? "Nobody yet" : String(summary.invited)
          }
        />
        <Row
          term="This week"
          detail={
            summary.thisWeek >= summary.perWeek && summary.perWeek > 0
              ? `${summary.thisWeek} of ${summary.perWeek} — full until one lapses`
              : `${summary.thisWeek} of ${summary.perWeek}`
          }
        />
        <Row
          term="Extra handovers a week"
          detail={
            summary.bonus === 0
              ? "None right now"
              : `+${summary.bonus}${lapses(summary.expires)}`
          }
        />
      </dl>

      {/* Redeeming is offered once and then gone, because it can only happen
          once: the invitee is the primary key of the referrals table. */}
      {!summary.redeemed && (
        <div className="mt-10 max-w-[34rem]">
          <h2 className="text-[0.6875rem] tracking-[0.08em] text-[#8E8899]">
            SOMEBODY GAVE YOU A CODE?
          </h2>
          <form
            className="mt-3 flex items-center gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!bridge || entry.trim().length === 0) return;
              setRedeeming(true);
              setFailure("");
              void bridge
                .redeemInvite(entry.trim().toUpperCase())
                .then(() => {
                  setEntry("");
                  load();
                })
                // Rust hands back the sentence the database wrote, which names
                // what is actually wrong with the code that was typed.
                .catch((err: unknown) =>
                  setFailure(err instanceof Error ? err.message : String(err)),
                )
                .finally(() => setRedeeming(false));
            }}
          >
            <input
              value={entry}
              onChange={(e) => setEntry(e.target.value.toUpperCase())}
              spellCheck={false}
              autoCapitalize="characters"
              placeholder="Their code"
              className={cn(
                "min-w-0 flex-1 rounded-[10px] border border-black/[0.11] bg-transparent",
                "px-4 py-2.5 text-[0.9375rem] tracking-[0.14em] text-[#16141C]",
                "placeholder:tracking-normal placeholder:text-[#A29CB0]",
                "outline-none transition-colors duration-150 focus:border-[#6A4BEA]/60",
              )}
            />
            <button
              type="submit"
              disabled={redeeming || entry.trim().length === 0}
              className={cn(
                "shrink-0 rounded-lg px-3.5 py-2 text-[0.8125rem] font-medium",
                "bg-[#EDEAF7] text-[#16141C] ring-1 ring-inset ring-black/[0.08]",
                "transition-colors duration-150",
                redeeming || entry.trim().length === 0
                  ? "cursor-default opacity-40"
                  : "cursor-pointer hover:bg-[#E6E1F5] hover:text-[#16141C]",
              )}
            >
              {redeeming ? "Checking\u2026" : "Use it"}
            </button>
          </form>
          {failure && (
            <p className="mt-2.5 text-[0.8125rem] text-[#B23B32]">{failure}</p>
          )}
        </div>
      )}
    </>
  );
}

/* ── How you work ─────────────────────────────────────────────────────────── */

/**
 * The instructions you have given assistants, collected in one place.
 *
 * Every line is a sentence taken word for word out of one of your own turns.
 * Nothing here is generated or paraphrased, which is why each one is shown as a
 * quotation with a count next to it rather than as a claim about you: the count
 * is the evidence, and you can see for yourself whether it is right.
 */
function Profile({ bridge }: { bridge: ReturnType<typeof desktopBridge> }) {
  const [facts, setFacts] = useState<ProfileFact[] | null>(null);
  const [preamble, setPreamble] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    void bridge.memoryProfile().then(([found, text]) => {
      setFacts(found);
      setPreamble(text);
    });
  }, [bridge]);

  const heading = (
    <PanelHead
      eyebrow={
        facts && facts.length > 0
          ? `${facts.length} taken from your own messages`
          : undefined
      }
      title="How you work"
    />
  );

  if (facts === null) {
    return (
      <>
        {heading}
        <p className="mt-4 text-[0.875rem] text-[#7A7489]">
          Reading your conversations&hellip;
        </p>
      </>
    );
  }

  /*
   * Nothing found says nothing found.
   *
   * The alternative is a handful of vague lines dressed up as a profile, and
   * the first wrong one costs the whole feature its credibility.
   */
  if (facts.length === 0) {
    return (
      <>
        {heading}
        <p className="mt-4 max-w-[56ch] text-[0.875rem] leading-relaxed text-[#7A7489]">
          Empty, and it should be. This builds itself out of the rules you
          repeat and the stack you keep re-explaining, counting only sentences
          you actually typed. Have a few real conversations and it will have
          something to say.
        </p>
      </>
    );
  }

  return (
    <div>
      {heading}
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        {/*
         * That these already ride along was the best-kept secret in the app.
         *
         * This said "paste it at the top of a new conversation", which
         * describes a copy-paste tool and is the smaller half of what happens:
         * every handover already carries the repeated ones, under a heading
         * telling the receiving model to apply them. Somebody watching a demo
         * suggested building the thing it has done since it shipped, which is
         * what an invisible feature looks like from outside.
         *
         * The count on each row is what decides it, so the rule is stated
         * against the thing that shows it rather than in a tooltip.
         */}
        <p className="max-w-[56ch] text-[0.875rem] leading-relaxed text-[#57516A]">
          Taken word for word from your own messages, across every AI. The ones
          you have repeated in more than one conversation ride along with every
          handover, up to eight, so the next AI has them before it reads a line.
          Copy them when you are starting somewhere by hand.
        </p>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(preamble).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), COPIED_FOR_MS);
            });
          }}
          className={cn(
            "shrink-0 rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium",
            "bg-[#16141C] text-white transition-opacity duration-150",
            "cursor-pointer hover:opacity-90",
          )}
        >
          {copied ? "Copied" : "Copy as a preamble"}
        </button>
      </div>

      <ul className="mt-6 space-y-px">
        {facts.map((fact) => (
          <li
            key={fact.text}
            className={cn(
              "flex items-baseline gap-4 rounded-[10px] px-3 py-2.5",
              "transition-[transform,background-color] duration-150",
              "hover:-translate-y-px hover:bg-[#F4F2FB]",
            )}
          >
            <span className="min-w-0 flex-1 text-[0.875rem] leading-relaxed text-[#16141C]">
              {fact.text}
            </span>
            {/*
             * The count, not a badge saying "important".
             *
             * Said in six conversations is a fact about the transcripts and
             * can be checked. Any label we invented on top of it could not.
             */}
            <span className="shrink-0 text-[0.75rem] tabular-nums text-[#8E8899]">
              {fact.conversations === 1
                ? "once"
                : `${fact.conversations} conversations`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A key, inline in a sentence. Small enough not to shout in a stats column. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[5px] border border-black/[0.10] bg-white px-1.5 py-0.5 font-mono text-[0.6875rem] text-[#16141C]">
      {children}
    </kbd>
  );
}

/* ── Your team ────────────────────────────────────────────────────────────── */

/** The first name taken from the signed-in account at sign-in. Blank if unknown. */
function accountName(): string {
  try {
    return localStorage.getItem("sidq.name")?.trim() ?? "";
  } catch {
    return "";
  }
}

/**
 * Duo, made into something.
 *
 * It sold two seats and one invoice. Asked what it did, the honest answer was
 * "you both get Sidq" — and the thing people at a demo got excited about, that
 * a team could work from one shared context, was a guess they had made about
 * the name rather than a feature. This is that guess, made true.
 *
 * Through a folder, not a server. The front page says nothing is uploaded and
 * that it works with the wifi off, and those sentences are the product; making
 * them false for the paid tier is a worse trade than any feature is worth. So
 * Sidq writes one small readable file into somewhere that already syncs and
 * reads the files its teammates' copies wrote there. Sidq opens no socket, and
 * it works between people in different countries rather than two laptops on one
 * wifi.
 */
function Team({ bridge }: { bridge: ReturnType<typeof desktopBridge> }) {
  const [settings, setSettings] = useState<TeamSettings | null>(null);
  const [options, setOptions] = useState<[string, string][]>([]);
  const [shared, setShared] = useState<SharedHandover[]>([]);
  const [typed, setTyped] = useState("");
  const [name, setName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!bridge) return;
    void bridge.teamSettings().then((next) => {
      setSettings(next);
      // Empty means they have not chosen one. The account already knows a name,
      // and it is the one their co-founder would recognise.
      setName(next.name || accountName());
    });
    void bridge.teamHandovers().then(setShared);
  }, [bridge]);

  useEffect(() => {
    load();
    void bridge?.teamFolderOptions().then(setOptions);
  }, [bridge, load]);

  const heading = <PanelHead eyebrow="Duo" title="Your team" />;

  if (!settings) {
    return (
      <>
        {heading}
        <p className="mt-4 text-[0.875rem] text-[#7A7489]">Checking&hellip;</p>
      </>
    );
  }

  /*
   * The plan check is Rust's answer, not this window's guess.
   *
   * Sharing is refused in `team_rules` regardless of what is on screen, so the
   * two can never disagree about whether somebody is paying for it.
   */
  if (!settings.allowed) {
    return (
      <>
        {heading}
        <p className="mt-4 max-w-[56ch] text-[0.875rem] leading-relaxed text-[#57516A]">
          On Duo, the standing instructions on your{" "}
          <strong>How you work</strong> tab are shared with the people you work
          with, and theirs with you. Every handover any of you makes then
          arrives already knowing how the team works, not just how you do.
        </p>
        <p className="mt-3 max-w-[56ch] text-[0.875rem] leading-relaxed text-[#7A7489]">
          It goes through a folder you already sync, so nothing is uploaded to
          us and it still works with the wifi off.
        </p>
      </>
    );
  }

  /*
   * The name is written before the folder, always.
   *
   * The file is named after the person, and the fallback name is the same for
   * everybody. Two co-founders who pointed at the same folder without setting
   * one would both publish `me.sidq-context.md` and silently overwrite each
   * other's rules — the worst kind of bug here, because it looks like it is
   * working and the folder only ever holds one of them.
   */
  const choose = (path: string | null) => {
    if (!bridge) return;
    const settle = path
      ? bridge.setTeamName(name.trim())
      : Promise.resolve(true);
    void settle.then(() => bridge.setTeamFolder(path)).then(load);
  };

  if (!settings.folder) {
    return (
      <>
        {heading}
        <p className="mt-4 max-w-[56ch] text-[0.875rem] leading-relaxed text-[#57516A]">
          Pick somewhere that syncs. Sidq writes one small file there,{" "}
          <span className="tabular text-[#16141C]">{settings.file}</span>, and
          reads the ones your teammates&rsquo; copies write. Nothing is uploaded
          to us; your drive does the syncing you already trust it with.
        </p>

        {/*
         * Named before anything is written, not after.
         *
         * Everybody's fallback name is the same, so two people setting this up
         * without one would publish the same filename into the same folder and
         * overwrite each other. Asking first costs a field; finding out later
         * costs somebody their rules.
         */}
        <label className="mt-5 block text-[0.8125rem]">
          <span className="block text-[#7A7489]">
            What your team sees you called
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your first name"
            spellCheck={false}
            className={cn(
              "mt-1.5 w-full max-w-[18rem] rounded-lg border border-[#E3DFF1] bg-white px-3 py-2",
              "text-[0.8125rem] outline-none focus:border-[#B8A6FF]",
            )}
          />
        </label>

        <div className="mt-5 flex flex-wrap gap-2">
          {options.map(([label, path]) => (
            <button
              key={path}
              disabled={!name.trim()}
              onClick={() => choose(path)}
              className={cn(
                "rounded-lg border border-[#E3DFF1] bg-white px-3 py-2 text-[0.8125rem]",
                "cursor-pointer transition-colors duration-150 hover:border-[#B8A6FF]",
                "disabled:cursor-default disabled:opacity-40 disabled:hover:border-[#E3DFF1]",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && typed.trim() && choose(typed.trim())
            }
            placeholder="Or a path of your own, including a git repo"
            spellCheck={false}
            className={cn(
              "min-w-0 flex-1 rounded-lg border border-[#E3DFF1] bg-white px-3 py-2",
              "text-[0.8125rem] outline-none focus:border-[#B8A6FF]",
            )}
          />
          <button
            disabled={!typed.trim() || !name.trim()}
            onClick={() => choose(typed.trim())}
            className={cn(
              "shrink-0 rounded-lg bg-[#16141C] px-3 py-2 text-[0.8125rem] font-medium text-white",
              "cursor-pointer transition-opacity duration-150 hover:opacity-90",
              "disabled:cursor-default disabled:opacity-35",
            )}
          >
            Use this
          </button>
        </div>
      </>
    );
  }

  return (
    <div>
      {heading}

      <p className="mt-4 max-w-[56ch] text-[0.875rem] leading-relaxed text-[#57516A]">
        Sharing through{" "}
        <span className="tabular text-[#16141C]">{settings.folder}</span>. Sidq
        writes <span className="tabular text-[#16141C]">{settings.file}</span>{" "}
        there and reads whatever your teammates put beside it. You can open that
        file and read every word of it.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="text-[0.8125rem]">
          <span className="block text-[#7A7489]">
            What your team sees you called
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() =>
              name.trim() !== settings.name &&
              bridge?.setTeamName(name).then(load)
            }
            spellCheck={false}
            className={cn(
              "mt-1.5 rounded-lg border border-[#E3DFF1] bg-white px-3 py-2",
              "text-[0.8125rem] outline-none focus:border-[#B8A6FF]",
            )}
          />
        </label>
        <button
          onClick={() => choose(null)}
          className={cn(
            "rounded-lg border border-[#E3DFF1] px-3 py-2 text-[0.8125rem]",
            "cursor-pointer transition-colors duration-150 hover:border-[#16141C]",
          )}
        >
          Stop sharing
        </button>
      </div>

      <p className="mt-6 text-[0.75rem] uppercase tracking-[0.16em] text-[#8E8899]">
        In this folder
      </p>

      <ul className="mt-3 space-y-px">
        <li className="flex items-baseline gap-4 rounded-[10px] bg-[#F4F2FB] px-3 py-2.5">
          <span className="min-w-0 flex-1 text-[0.875rem] text-[#16141C]">
            {settings.name} <span className="text-[#8E8899]">(you)</span>
          </span>
          <span className="shrink-0 text-[0.75rem] tabular-nums text-[#8E8899]">
            {settings.sharing === 1 ? "1 rule" : `${settings.sharing} rules`}
          </span>
        </li>
        {settings.members.map(([who, count]: [string, number]) => (
          <li
            key={who}
            className="flex items-baseline gap-4 rounded-[10px] px-3 py-2.5"
          >
            <span className="min-w-0 flex-1 text-[0.875rem] text-[#16141C]">
              {who}
            </span>
            <span className="shrink-0 text-[0.75rem] tabular-nums text-[#8E8899]">
              {count === 1 ? "1 rule" : `${count} rules`}
            </span>
          </li>
        ))}
      </ul>

      {/*
       * Nobody else yet is the normal first state, not a failure. It says what
       * to do rather than reporting an absence, because the thing to do is the
       * only part that is not obvious: the other person has to point their own
       * Sidq at the same folder.
       */}
      {settings.members.length === 0 && (
        <p className="mt-4 max-w-[56ch] text-[0.875rem] leading-relaxed text-[#7A7489]">
          Nobody else is in here yet. Share the folder with whoever you work
          with, and have them point their Sidq at it on the same tab. They will
          appear the next time either of you makes a handover.
        </p>
      )}

      {/*
       * ── Whole conversations, when somebody chose to hand one over ──────────
       *
       * The rules above are published for you. These are not: each one is here
       * because a person pressed Share on that conversation. Its own section
       * for the same reason it is its own command in Rust — the two are
       * different sizes of decision and should not look alike.
       */}
      <p className="mt-8 text-[0.75rem] uppercase tracking-[0.16em] text-[#8E8899]">
        Conversations shared with the team
      </p>

      {shared.length === 0 ? (
        <p className="mt-3 max-w-[56ch] text-[0.875rem] leading-relaxed text-[#7A7489]">
          None yet. Press <strong>Share with team</strong> on any handover and
          it lands here for everyone pointed at this folder.
        </p>
      ) : (
        <ul className="mt-3 space-y-px">
          {shared.map((item) => (
            <li
              key={item.path}
              className={cn(
                "flex items-baseline gap-4 rounded-[10px] px-3 py-2.5",
                "transition-colors duration-150 hover:bg-[#F4F2FB]",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-[0.875rem] text-[#16141C]">
                {item.title}
              </span>
              <span className="shrink-0 text-[0.75rem] text-[#8E8899]">
                {item.mine ? "you" : item.who}
              </span>
              <button
                onClick={() => {
                  void bridge?.readTeamHandover(item.path).then((text) => {
                    if (!text) return;
                    void navigator.clipboard.writeText(text).then(() => {
                      setCopied(item.path);
                      setTimeout(() => setCopied(null), COPIED_FOR_MS);
                    });
                  });
                }}
                className={cn(
                  "shrink-0 rounded-md px-2 py-1 text-[0.75rem] font-medium",
                  "cursor-pointer text-[#57516A] transition-colors duration-150",
                  "hover:bg-[#16141C] hover:text-white",
                )}
              >
                {copied === item.path ? "Copied" : "Copy"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Search ───────────────────────────────────────────────────────────────── */

function Search({
  bridge,
  historyDays,
}: {
  bridge: ReturnType<typeof desktopBridge>;
  /** How far back the plan reaches, or null for everything. */
  historyDays: number | null;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [withheld, setWithheld] = useState(0);
  const [searched, setSearched] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  /*
   * There is no window to pass.
   *
   * This used to compute the cutoff and send it down, which meant the limit was
   * whatever the page felt like sending. Rust works it out from the plan now,
   * and the only thing this can say is what to look for.
   */
  const run = useCallback(
    (q: string) => {
      if (!bridge || q.trim().length < 2) {
        setHits([]);
        setWithheld(0);
        setSearched(false);
        return;
      }
      void bridge.searchConversations(q, 50).then(([found, older]) => {
        setHits(found);
        setWithheld(older);
        setSearched(true);
      });
    },
    [bridge],
  );

  // Debounced, because every keystroke otherwise runs a full-text query against
  // several thousand messages.
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => run(query), 180);
    return () => window.clearTimeout(timer.current);
  }, [query, run]);

  return (
    <>
      <PanelHead
        eyebrow={
          historyDays == null
            ? "Everything on this Mac"
            : `Reaching back ${historyDays} ${historyDays === 1 ? "day" : "days"}`
        }
        title="Search"
      />

      <div className="relative mt-5">
        <span
          aria-hidden="true"
          className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8899]"
        >
          <Icon name="search" />
        </span>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search everything you have ever asked"
          spellCheck={false}
          className={cn(
            "w-full rounded-[12px] bg-[#F5F3FB] py-3.5 pl-11 pr-4",
            "text-[1rem] text-[#16141C] placeholder:text-[#8E8899]",
            "ring-1 ring-inset ring-black/[0.07] transition-shadow duration-150",
            "focus:outline-none focus:ring-[#6A4BEA]/40",
          )}
        />
      </div>

      {searched && (
        <p className="mt-4 text-[0.8125rem] text-[#7A7489]">
          {hits.length === 0
            ? "Nothing matched that one."
            : `${hits.length} ${hits.length === 1 ? "result" : "results"}`}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {hits.map((hit) => (
          <Hit key={`${hit.sessionId}-${hit.snippet.slice(0, 24)}`} hit={hit} />
        ))}
      </div>

      {/*
       * The locked results.
       *
       * The count is real and comes from the same query; the text does not. It
       * is shown rather than hidden because someone who can see exactly what
       * they are missing has a reason to pay, and someone who cannot has no
       * idea there is anything there.
       */}
      {withheld > 0 && historyDays !== null && (
        <div className="mt-5 rounded-[12px] border border-[#B8A6FF]/45 bg-[#F5F1FF] p-4">
          <p className="text-[0.875rem] text-[#16141C]">
            <span className="font-medium text-[#16141C]">{withheld} more</span>{" "}
            {withheld === 1 ? "conversation matches" : "conversations match"},
            older than {historyDays} days
          </p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[#7A7489]">
            Free search reaches back {historyDays} days. Pro reaches everything
            you have ever asked, in any AI.
          </p>
        </div>
      )}

      {!searched && (
        <p className="mt-8 max-w-[52ch] text-[0.875rem] leading-relaxed text-[#7A7489]">
          Every conversation on this Mac, plus every AI you have opened in Sidq,
          searched together. No AI can read another one&rsquo;s history, so this
          is the only place yours sits in one pile.
        </p>
      )}
    </>
  );
}

function Hit({ hit }: { hit: SearchHit }) {
  return (
    <article className="rounded-[12px] bg-[#F8F6FD] p-4 ring-1 ring-inset ring-black/[0.06]">
      <div className="flex items-baseline gap-2">
        <span className="truncate text-[0.875rem] font-medium text-[#16141C]/90">
          {hit.title || "Untitled"}
        </span>
        <span className="shrink-0 text-[0.6875rem] text-[#8E8899]">
          {sourceLabel(hit.source)}
          {hit.project && ` · ${hit.project}`}
          {hit.endedAt > 0 && ` · ${whenLabel(hit.endedAt)}`}
        </span>
      </div>
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-[#57516A]">
        {/* FTS5 wraps matches in « ». Rendered as marks so the eye lands on why
            this result is here rather than on the surrounding sentence. */}
        {hit.snippet.split(/[«»]/).map((part, i) =>
          i % 2 === 1 ? (
            <mark
              key={i}
              className="rounded bg-[#E9E2FF] px-0.5 text-[#16141C]"
            >
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </p>
    </article>
  );
}

/** Rust stores seconds; everything in the browser is milliseconds. */
function whenHandedOver(seconds: number): string {
  const days = Math.floor((Date.now() - seconds * 1000) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(seconds * 1000).toLocaleDateString();
}

/* ── Sources ──────────────────────────────────────────────────────────────── */

/**
 * Bring in the history you already have, from whichever assistant it is in.
 *
 * claude.ai keeps nothing readable on this Mac. Its desktop app has an
 * IndexedDB at Application Support/Claude, and that store holds no conversation
 * text — checked, not assumed: 2.2MB, 31% printable, and the only readable
 * string in it is the name of the store.
 *
 * The extension covers the tab you have open. This covers the rest, which for
 * most people is nearly all of it.
 *
 * The file is read here and the JSON handed to Rust, rather than Rust opening
 * the path. That means no file-dialog plugin, and it means Sidq only ever sees
 * the one file somebody deliberately chose.
 */
/**
 * The assistants, opened where you are already signed in.
 *
 * Sidq has its own browser engine and for a while these opened inside it, which
 * removed the extension install and looked like the better answer. It is not.
 * The pages render perfectly and the one thing every account now depends on
 * cannot work: passkeys need WebAuthn, WebAuthn in a webview needs an
 * associated-domains entitlement, and that entitlement has to be granted by the
 * site owner publishing Sidq's team identifier in their own
 * apple-app-site-association file. OpenAI is not going to do that. AutoFill,
 * Keychain and every password manager are the same story.
 *
 * So the login stays in the browser where all of that already works, and Sidq
 * never holds a session at all. The extension reads the page from there.
 *
 * Opening inside Sidq is still offered underneath, because an account that
 * signs in with an email and a password hits none of the above and it saves
 * them an install.
 */
function OpenAssistants({
  bridge,
}: {
  bridge: ReturnType<typeof desktopBridge>;
}) {
  const [rows, setRows] = useState<{ id: string; label: string }[]>([]);
  const [inSidq, setInSidq] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    void bridge.assistantList().then(setRows);
  }, [bridge]);

  if (rows.length === 0) return null;

  return (
    <div className="mt-8">
      <p className="text-[0.875rem] font-medium text-[#16141C]">Open one</p>
      <p className="mt-1.5 max-w-[56ch] text-[0.8125rem] leading-relaxed text-[#57516A]">
        In your own browser, where you are already signed in and your passkeys
        and password manager work. Sidq never asks you to log in to anything.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {rows.map((row) => (
          <button
            key={row.id}
            onClick={() =>
              void (inSidq
                ? bridge?.openAssistant(row.id)
                : bridge?.openAssistantInBrowser(row.id))
            }
            className={cn(
              "rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium",
              "bg-[#EDEAF7] text-[#16141C] ring-1 ring-inset ring-black/[0.08]",
              "cursor-pointer transition-colors duration-150 hover:bg-[#E6E1F5] hover:text-[#16141C]",
            )}
          >
            {row.label}
          </button>
        ))}
      </div>
      <button
        onClick={() => setInSidq((v) => !v)}
        className="mt-3 text-[0.75rem] text-[#8E8899] transition-colors duration-150 hover:text-[#3A3547]"
      >
        {inSidq
          ? "Opening inside Sidq. Passkeys and autofill will not work here. Use my browser instead"
          : "Or open them inside Sidq, if you sign in with an email and password"}
      </button>
    </div>
  );
}

function ImportHistory({
  bridge,
}: {
  bridge: ReturnType<typeof desktopBridge>;
}) {
  const [state, setState] = useState<"idle" | "reading" | "done" | "failed">(
    "idle",
  );
  const [message, setMessage] = useState("");

  return (
    <div className="mt-8 rounded-[12px] border border-[#B8A6FF]/45 bg-[#F5F1FF] p-4">
      <p className="text-[0.875rem] font-medium text-[#16141C]">
        Already have an export file?
      </p>
      {/*
       * Deliberately the last thing on this panel, and phrased as an
       * afterthought.
       *
       * It used to be the headline. Requesting an export from Claude or
       * ChatGPT is emailed to you and can take days to arrive, so putting it
       * in front of somebody who has just installed Sidq means their first
       * experience of the product is waiting. Opening an assistant here works
       * in one click, so that is the offer; this is for the people who
       * happen to have a file already.
       */}
      <p className="mt-1.5 max-w-[54ch] text-[0.8125rem] leading-relaxed text-[#57516A]">
        This is the one route that needs no scrolling: an export holds every
        conversation in full, however old, whether or not you ever open it
        again. Worth requesting now even though it takes a day or two to arrive.
        Claude and ChatGPT both call it{" "}
        <code className="text-[#3A3547]">conversations.json</code>; Google
        Takeout calls it <code className="text-[#3A3547]">MyActivity.json</code>
        . Sidq works out which is which.
      </p>

      <label
        className={cn(
          "mt-3 inline-flex cursor-pointer items-center rounded-lg px-3 py-1.5",
          "bg-[#16141C] text-[0.8125rem] font-medium text-white",
          "transition-opacity duration-150 hover:opacity-90",
          state === "reading" && "pointer-events-none opacity-50",
        )}
      >
        {state === "reading" ? "Importing…" : "Choose an export file"}
        <input
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file || !bridge) return;

            setState("reading");
            void file
              .text()
              .then((json) => bridge.importExport(json))
              .then((count) => {
                setState("done");
                setMessage(
                  `${count} conversation${count === 1 ? "" : "s"} imported. They are searchable now.`,
                );
              })
              .catch((err: unknown) => {
                setState("failed");
                // Rust says what is actually wrong with the file. Replacing that
                // with "something went wrong" throws away the only useful part.
                setMessage(err instanceof Error ? err.message : String(err));
              });
            // Let the same file be chosen twice, after a failed first attempt.
            e.target.value = "";
          }}
        />
      </label>

      {state !== "idle" && state !== "reading" && (
        <p
          className={cn(
            "mt-2.5 text-[0.8125rem]",
            state === "done" ? "text-[#57516A]" : "text-[#B23B32]",
          )}
        >
          {message}
        </p>
      )}
    </div>
  );
}

/**
 * The sources, most-used first, measured rather than asked.
 *
 * Setup used to have a screen for this — "Which do you use most?", a row of
 * chips, a Continue — and ordered the list from the answer. Sidq has read the
 * index by the time anybody sees this panel, so it already knows, and knows
 * better: what somebody taps during setup is what they think they use, and
 * this is what they actually opened. It also stays true as that changes, which
 * a one-time answer cannot.
 *
 * Ties keep the fixed order, so the list does not reshuffle for no reason.
 */
function orderedSources(counts: Map<string, number>): readonly Source[] {
  return [...SOURCES].sort(
    (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0),
  );
}

function Sources({
  sessions,
  bridge,
}: {
  sessions: WorkSession[];
  bridge: ReturnType<typeof desktopBridge>;
}) {
  const [stale, setStale] = useState<string[]>([]);
  const [accessible, setAccessible] = useState<boolean | null>(null);

  useEffect(() => {
    if (!bridge) return;
    void bridge.staleSources().then(setStale);

    // Polled, because it is granted in another application and can change while
    // this window is open.
    const check = () => void bridge.accessibilityGranted().then(setAccessible);
    check();
    const timer = setInterval(check, 2000);
    return () => clearInterval(timer);
  }, [bridge]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      const key = s.source ?? "claude-code";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [sessions]);

  return (
    <>
      {/*
       * This credited the extension, and so did every row below it. The
       * extension stopped being how any of this works when the Accessibility
       * permission replaced it, and telling somebody their AIs are read "via
       * extension" sends them looking for an install that is not part of the
       * product any more — while the thing that actually reads them sits
       * further down the same screen.
       */}
      <PanelHead
        eyebrow={
          sessions.length > 0 ? `${sessions.length} being read` : undefined
        }
        title="Sources"
        lead="Sidq is not tied to any one AI. The ones that write conversations to this Mac are read with nothing to set up. The ones that run in a browser keep nothing readable here, so Sidq reads them from the window instead, in whichever browser you already use. Sidq never asks you to log in to anything."
      />

      <ul className="mt-6 space-y-1.5">
        {orderedSources(counts).map((source) => {
          const found = counts.get(source.id) ?? 0;
          return (
            <li
              key={source.id}
              className="flex items-center gap-3 rounded-[10px] bg-[#F8F6FD] px-4 py-2.5"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  found > 0 ? "bg-[#6A4BEA]" : "bg-[#D6D1E4]",
                )}
              />
              <span className="flex-1 text-[0.875rem] text-[#16141C]">
                {source.label}
              </span>
              <span className="text-[0.75rem] text-[#7A7489]">
                {/*
                 * What a row with nothing in it is waiting for, which is a
                 * different thing for the two kinds of source. A local one has
                 * simply never been used. A browser one is read the moment you
                 * open it, unless the permission is off, in which case that is
                 * the only thing standing in the way and the row should say so.
                 */}
                {found > 0
                  ? `${found} ${found === 1 ? "conversation" : "conversations"}`
                  : source.local
                    ? "none found"
                    : accessible === false
                      ? "needs permission"
                      : "when you open it"}
              </span>
            </li>
          );
        })}
      </ul>
      {stale.length > 0 && (
        /*
         * Said out loud, because the alternative is a source sitting at zero
         * that looks identical to one nobody has used. These sites redesign
         * without notice and the extension reads nothing when they do.
         */
        <div className="mt-6 rounded-[12px] border border-amber-500/30 bg-amber-50 p-4">
          <p className="text-[0.875rem] font-medium text-[#16141C]">
            {stale.join(" and ")} changed, and Sidq stopped reading{" "}
            {stale.length === 1 ? "it" : "them"}
          </p>
          <p className="mt-1.5 max-w-[54ch] text-[0.8125rem] leading-relaxed text-[#57516A]">
            The page moved out from under the extension. This is fixed from our
            side without you updating anything, usually the same day. Everything
            already captured is safe.
          </p>
        </div>
      )}

      <div className="mt-8">
        <GrantAccess />
      </div>

      {/*
       * The extension only when the permission has been declined.
       *
       * It is a real fallback and a worse one: a store listing, a review queue
       * and a developer-mode install per browser. Offering both at once asks
       * somebody to choose between two setups when one switch would have done.
       */}
      {accessible === false && (
        <div className="mt-4">
          <ConnectExtension />
        </div>
      )}

      <OpenAssistants bridge={bridge} />
      <ImportHistory bridge={bridge} />
    </>
  );
}

/* ── Stats ────────────────────────────────────────────────────────────────── */

/**
 * One measured number in the rail.
 *
 * Baseline-aligned with its label rather than stacked over it: at this size a
 * label underneath reads as a caption, and these are a list of facts.
 */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <p className="flex items-baseline gap-2 py-1">
      <span className="font-display text-[1.5rem] leading-none tabular-nums tracking-[-0.045em] text-[#2A1B57]">
        {value}
      </span>
      <span className="min-w-0 truncate text-[0.75rem] text-[#57516A]">
        {label}
      </span>
    </p>
  );
}

function whenLabel(endedAt: number): string {
  const days = Math.floor((Date.now() - endedAt) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}
